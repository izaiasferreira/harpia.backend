const { cenos_pool } = require('../../db');
const { unifiedPointSchema, trackingAgentConfigSchema } = require('../../db/schemas/tracking');

async function insertUnifiedPoints(agentId, points, speedLimit) {
    if (!points || points.length === 0) return { inserted: 0, violations: 0 };

    const speedLimitNum = Number(speedLimit) || 81;
    const values = [];
    const params = [];
    let paramIdx = 1;
    let violations = 0;

    for (const raw of points) {
        const point = unifiedPointSchema.parse(raw);

        // Normalizar battery: Capacitor envia 0~1, nativo envia 0~100
        let batteryLevel = point.batteryLevel ?? null;
        if (batteryLevel != null && batteryLevel <= 1) {
            batteryLevel = Math.round(batteryLevel * 100);
        }

        // Normalizar velocidade: Android GPS retorna m/s, nativo envia km/h
        // Heuristic: valores > 50 e inteiros provavelmente m/s → converter
        let speedKmh = point.speed ?? null;
        if (speedKmh != null) {
            if (speedKmh > 50 && speedKmh < 150 && Number.isInteger(speedKmh)) {
                speedKmh = Math.round(speedKmh * 3.6);
            }
        }

        const isViolation = speedKmh != null && speedKmh > speedLimitNum;
        if (isViolation) violations++;

        values.push(`($${paramIdx},$${paramIdx+1},$${paramIdx+2},$${paramIdx+3},$${paramIdx+4},$${paramIdx+5},$${paramIdx+6},$${paramIdx+7},$${paramIdx+8},$${paramIdx+9},$${paramIdx+10},$${paramIdx+11},$${paramIdx+12},$${paramIdx+13},$${paramIdx+14})`);
        params.push(
            agentId,
            point.lat,
            point.lng,
            speedKmh,
            point.accuracy ?? null,
            batteryLevel,
            point.isCharging ?? false,
            point.networkType ?? null,
            point.gpsEnabled ?? true,
            point.deviceModel ?? null,
            point.devicePlatform ?? null,
            point.osVersion ?? null,
            new Date(point.timestamp),
            speedLimitNum,
            isViolation
        );
        paramIdx += 15;
    }

    await cenos_pool.query(`
        INSERT INTO tracking_session_points
            (agent_id, latitude, longitude, speed, accuracy,
             battery_level, is_charging, network_type, gps_enabled,
             device_model, device_platform, os_version, recorded_at,
             speed_limit_applied, is_speed_violation)
        VALUES ${values.join(',')}
    `, params);

    return { inserted: points.length, violations };
}

async function getAgentSpeedLimit(agentId) {
    const { rows } = await cenos_pool.query(
        `SELECT speed_limit_kmh FROM tracking_agent_config WHERE agent_id = $1`,
        [agentId]
    );
    if (rows.length > 0) return Number(rows[0].speed_limit_kmh);

    const { rows: global } = await cenos_pool.query(
        `SELECT value FROM tracking_global_config WHERE key = 'default_speed_limit_kmh'`
    );
    return global.length > 0 ? Number(global[0].value) : 81;
}

async function upsertAgentSpeedLimit(agentId, speedLimitKmh, updatedBy) {
    await cenos_pool.query(`
        INSERT INTO tracking_agent_config (agent_id, speed_limit_kmh, updated_at, updated_by)
        VALUES ($1, $2, NOW(), $3)
        ON CONFLICT (agent_id) DO UPDATE SET
            speed_limit_kmh = EXCLUDED.speed_limit_kmh,
            updated_at = NOW(),
            updated_by = EXCLUDED.updated_by
    `, [agentId, speedLimitKmh, updatedBy]);
}

async function getGlobalSpeedLimit() {
    const { rows } = await cenos_pool.query(
        `SELECT value FROM tracking_global_config WHERE key = 'default_speed_limit_kmh'`
    );
    return rows.length > 0 ? Number(rows[0].value) : 81;
}

async function upsertGlobalSpeedLimit(speedLimitKmh) {
    await cenos_pool.query(`
        INSERT INTO tracking_global_config (key, value, updated_at)
        VALUES ('default_speed_limit_kmh', $1, NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `, [String(speedLimitKmh)]);
}

async function getAgentsLastPositionUnified() {
    // Primeiro: buscar TODOS os agentes do sistema (login)
    const { rows: allAgents } = await cenos_pool.query(`
        SELECT l.id AS agent_id, l.estado AS agent_estado
        FROM login l
        WHERE l.id IS NOT NULL
        ORDER BY l.id
    `);

    if (allAgents.length === 0) return [];

    // Segundo: buscar último ponto de tracking para cada agente
    const agentIds = allAgents.map(a => a.agent_id);
    const { rows: lastPoints } = await cenos_pool.query(`
        SELECT DISTINCT ON (agent_id)
            agent_id,
            latitude, longitude, speed, accuracy,
            battery_level, is_charging, network_type, gps_enabled,
            device_model, device_platform, os_version,
            recorded_at
        FROM tracking_session_points
        WHERE agent_id = ANY($1)
        ORDER BY agent_id, recorded_at DESC
    `, [agentIds]);

    const lastPointsMap = {};
    lastPoints.forEach(p => { lastPointsMap[p.agent_id] = p; });

    // Enriquecer com dados do colaborador (PI e MA)
    const piIds = allAgents.filter(r => r.agent_estado === 'pi').map(r => r.agent_id.toUpperCase());
    const maIds = allAgents.filter(r => r.agent_estado === 'ma').map(r => r.agent_id.toUpperCase());
    const { pi_pool, ma_pool } = require('../../db');

    const colLookup = async (pool, ids) => {
        if (ids.length === 0) return {};
        const { rows: cols } = await pool.query(
            `SELECT "ID", "Nome", "seccional", "regional", "GESTOR IMEDIATO" FROM colaboradores WHERE "ID" = ANY($1)`,
            [ids]
        );
        const map = {};
        cols.forEach(c => map[c.ID.toUpperCase()] = c);
        return map;
    };

    const [piCols, maCols] = await Promise.all([
        colLookup(pi_pool, piIds),
        colLookup(ma_pool, maIds),
    ]);

    return allAgents.map(agent => {
        const id = agent.agent_id.toUpperCase();
        const col = piCols[id] || maCols[id] || {};
        const point = lastPointsMap[agent.agent_id] || {};
        return {
            agent_id: agent.agent_id,
            agent_estado: agent.agent_estado,
            latitude: point.latitude ?? null,
            longitude: point.longitude ?? null,
            speed: point.speed ?? null,
            accuracy: point.accuracy ?? null,
            battery_level: point.battery_level ?? null,
            is_charging: point.is_charging ?? null,
            network_type: point.network_type ?? null,
            gps_enabled: point.gps_enabled ?? null,
            device_model: point.device_model ?? null,
            device_platform: point.device_platform ?? null,
            os_version: point.os_version ?? null,
            recorded_at: point.recorded_at ?? null,
            nome: col['Nome'] || null,
            regional: col['regional'] || null,
            seccional: col['seccional'] || null,
            gestor: col['GESTOR IMEDIATO'] || null,
        };
    });
}

async function getAgentTrailUnified(agentId, dateFrom, dateTo) {
    const params = [agentId];
    let query = `
        SELECT latitude, longitude, speed, accuracy,
               battery_level, is_charging, network_type, gps_enabled,
               device_model, device_platform, os_version,
               speed_limit_applied, is_speed_violation, recorded_at
        FROM tracking_session_points WHERE agent_id = $1`;

    if (dateFrom) {
        params.push(dateFrom);
        query += ` AND recorded_at >= $${params.length}`;
    }
    if (dateTo) {
        params.push(dateTo);
        query += ` AND recorded_at <= $${params.length}`;
    }

    query += ' ORDER BY recorded_at ASC LIMIT 10000';

    const { rows } = await cenos_pool.query(query, params);
    return rows;
}

async function getSpeedViolationsFromUnified(filters = {}) {
    const params = [];
    let query = `
        SELECT tsp.*, l.estado as agent_estado
        FROM tracking_session_points tsp
        LEFT JOIN login l ON l.id = tsp.agent_id
        WHERE tsp.is_speed_violation = TRUE`;

    if (filters.agentId) {
        params.push(filters.agentId);
        query += ` AND tsp.agent_id = $${params.length}`;
    }
    if (filters.dateFrom) {
        params.push(filters.dateFrom);
        query += ` AND tsp.recorded_at >= $${params.length}`;
    }
    if (filters.dateTo) {
        params.push(filters.dateTo);
        query += ` AND tsp.recorded_at <= $${params.length}`;
    }

    query += ' ORDER BY tsp.recorded_at DESC LIMIT 500';

    const { rows } = await cenos_pool.query(query, params);

    if (rows.length === 0) return rows;

    const piIds = rows.filter(r => r.agent_estado === 'pi').map(r => r.agent_id.toUpperCase());
    const maIds = rows.filter(r => r.agent_estado === 'ma').map(r => r.agent_id.toUpperCase());

    const { pi_pool, ma_pool } = require('../../db');

    const colLookup = async (pool, ids) => {
        if (ids.length === 0) return {};
        const { rows: cols } = await pool.query(
            `SELECT "ID", "Nome", "seccional", "regional", "GESTOR IMEDIATO" FROM colaboradores WHERE "ID" = ANY($1)`,
            [ids]
        );
        const map = {};
        cols.forEach(c => map[c.ID.toUpperCase()] = c);
        return map;
    };

    const [piCols, maCols] = await Promise.all([
        colLookup(pi_pool, piIds),
        colLookup(ma_pool, maIds),
    ]);

    return rows.map(r => {
        const id = r.agent_id.toUpperCase();
        const col = piCols[id] || maCols[id] || {};
        return {
            ...r,
            speed_limit: r.speed_limit_applied,
            nome: col['Nome'] || null,
            regional: col['regional'] || null,
            seccional: col['seccional'] || null,
            gestor: col['GESTOR IMEDIATO'] || null,
        };
    });
}

module.exports = {
    insertUnifiedPoints,
    getAgentSpeedLimit,
    upsertAgentSpeedLimit,
    getGlobalSpeedLimit,
    upsertGlobalSpeedLimit,
    getAgentsLastPositionUnified,
    getAgentTrailUnified,
    getSpeedViolationsFromUnified,
};