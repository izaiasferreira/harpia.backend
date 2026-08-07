const { sinergia_pool } = require('../../db');
const { userIsAdmin, getColaboradoresFilter, checkAgentPermission } = require('./admin');

async function getAgentSpeedLimit(agentId) {
    const { rows } = await sinergia_pool.query(
        `SELECT speed_limit_kmh FROM tracking_agent_config WHERE agent_id = $1`,
        [agentId]
    );
    if (rows.length > 0) return Number(rows[0].speed_limit_kmh);

    const { rows: global } = await sinergia_pool.query(
        `SELECT value FROM tracking_global_config WHERE key = 'default_speed_limit_kmh'`
    );
    return global.length > 0 ? Number(global[0].value) : 81;
}

async function upsertAgentSpeedLimit(agentId, speedLimitKmh, updatedBy) {
    await sinergia_pool.query(`
        INSERT INTO tracking_agent_config (agent_id, speed_limit_kmh, updated_at, updated_by)
        VALUES ($1, $2, NOW(), $3)
        ON CONFLICT (agent_id) DO UPDATE SET
            speed_limit_kmh = EXCLUDED.speed_limit_kmh,
            updated_at = NOW(),
            updated_by = EXCLUDED.updated_by
    `, [agentId, speedLimitKmh, updatedBy]);
}

async function getGlobalSpeedLimit() {
    const { rows } = await sinergia_pool.query(
        `SELECT value FROM tracking_global_config WHERE key = 'default_speed_limit_kmh'`
    );
    return rows.length > 0 ? Number(rows[0].value) : 81;
}

async function upsertGlobalSpeedLimit(speedLimitKmh) {
    await sinergia_pool.query(`
        INSERT INTO tracking_global_config (key, value, updated_at)
        VALUES ('default_speed_limit_kmh', $1, NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `, [String(speedLimitKmh)]);
}

async function getAgentsLastPositionUnified(user = null) {
    // Primeiro: buscar agentes do sistema (ativos) baseado em permissões
    let query = `
        SELECT c."ID" AS agent_id, c.estado AS agent_estado 
        FROM colaboradores c 
        WHERE c.status = TRUE
    `;
    let params = [];

    // Aplica filtro de permissão
    if (user && !userIsAdmin(user)) {
        const filter = getColaboradoresFilter(user, { includeAllStates: true });
        if (filter.allowedStates.length > 0) {
            query += ` AND c.estado = ANY($1)`;
            params.push(filter.allowedStates);
        } else {
            return []; // Sem acesso
        }
    }

    query += ` ORDER BY c."ID"`;
    const { rows: allAgents } = await sinergia_pool.query(query, params);

    if (allAgents.length === 0) return [];

    // Segundo: buscar último ponto de tracking para cada agente
    const agentIds = allAgents.map(a => a.agent_id);
    const { rows: lastPoints } = await sinergia_pool.query(`
        SELECT a.agent_id, p.latitude, p.longitude, p.speed, p.accuracy,
               p.battery_level, p.is_charging, p.network_type, p.gps_enabled,
               p.device_model, p.device_platform, p.os_version, p.recorded_at
        FROM unnest($1::varchar[]) AS a(agent_id)
        LEFT JOIN LATERAL (
            SELECT agent_id,
                   latitude, longitude, speed, accuracy,
                   battery_level, is_charging, network_type, gps_enabled,
                   device_model, device_platform, os_version, recorded_at
            FROM tracking_session_points tsp
            WHERE tsp.agent_id = a.agent_id
            ORDER BY tsp.recorded_at DESC
            LIMIT 1
        ) p ON TRUE
    `, [agentIds]);

    const lastPointsMap = {};
    lastPoints.forEach(p => { lastPointsMap[p.agent_id] = p; });

    // Buscar heartbeats
    const { rows: heartbeats } = await sinergia_pool.query(`
        SELECT agent_id, last_heartbeat_at, last_heartbeat_lat, last_heartbeat_lng
        FROM agent_heartbeats
        WHERE agent_id = ANY($1)
    `, [agentIds]);
    const hbMap = {};
    heartbeats.forEach(h => { hbMap[h.agent_id] = h; });

    // Enriquecer com dados do colaborador
    const colLookup = async (ids) => {
        if (ids.length === 0) return {};
        const { rows: cols } = await sinergia_pool.query(
            `SELECT "ID", "Nome", "seccional", "regional", "GESTOR IMEDIATO", "Cargo" FROM colaboradores WHERE "ID" = ANY($1)`,
            [ids]
        );
        const map = {};
        cols.forEach(c => map[c.ID.toUpperCase()] = c);
        return map;
    };

    const allIds = [...new Set(allAgents.map(r => r.agent_id.toUpperCase()))];
    const cols = await colLookup(allIds);

    let result = allAgents.map(agent => {
        const id = agent.agent_id.toUpperCase();
        const col = cols[id] || {};
        const point = lastPointsMap[agent.agent_id] || {};
        const hb = hbMap[agent.agent_id];

        const hbTime = hb?.last_heartbeat_at ? new Date(hb.last_heartbeat_at).getTime() : 0;
        const ptTime = point.recorded_at ? new Date(point.recorded_at).getTime() : 0;
        const useHb = hbTime > ptTime && hb.last_heartbeat_lat != null;

        return {
            agent_id: agent.agent_id,
            agent_estado: agent.agent_estado,
            latitude: useHb ? hb.last_heartbeat_lat : (point.latitude ?? null),
            longitude: useHb ? hb.last_heartbeat_lng : (point.longitude ?? null),
            speed: point.speed ?? null,
            accuracy: point.accuracy ?? null,
            battery_level: point.battery_level ?? null,
            is_charging: point.is_charging ?? null,
            network_type: point.network_type ?? null,
            gps_enabled: point.gps_enabled ?? null,
            device_model: point.device_model ?? null,
            device_platform: point.device_platform ?? null,
            os_version: point.os_version ?? null,
            recorded_at: useHb ? hb.last_heartbeat_at : (point.recorded_at ?? null),
            nome: col['Nome'] || null,
            regional: col['regional'] || null,
            seccional: col['seccional'] || null,
            gestor: col['GESTOR IMEDIATO'] || null,
            cargo: col['Cargo'] || null,
        };
    });

    // Filtra apenas os agentes que de fato possuem dados de tracking (latitude/longitude)
    result = result.filter(r => r.latitude !== null && r.longitude !== null);

    // Aplica filtro em memória para regional/seccional/gestor
    if (user && !userIsAdmin(user)) {
        result = result.filter(r => {
            const agentData = {
                id: r.agent_id,
                nome: r.nome,
                regional: r.regional,
                seccional: r.seccional,
                gestor: r.gestor,
                estado: r.agent_estado
            };
            return checkAgentPermission(agentData, user);
        });
    }

    return result;
}

async function getAgentTrailUnified(agentId, dateFrom, dateTo) {
    const params = [agentId];
    let query = `
        SELECT latitude, longitude, speed, accuracy,
               battery_level, is_charging, network_type, gps_enabled,
               device_model, device_platform, os_version,
               speed_limit_applied, is_speed_violation, recorded_at,
               is_estimated, estimated_from_lat, estimated_from_lng, dead_reckon_drift
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

    const { rows } = await sinergia_pool.query(query, params);
    return rows;
}

async function getSpeedViolationsFromUnified(filters = {}, user = null) {
    const params = [];
    let query = `
        SELECT tsp.*, 
               c.estado as agent_estado,
               c."Nome" as nome,
               c.regional as regional,
               c.seccional as seccional,
               c."GESTOR IMEDIATO" as gestor,
               tsp.speed_limit_applied as speed_limit
        FROM tracking_session_points tsp
        INNER JOIN colaboradores c ON UPPER(c."ID") = UPPER(tsp.agent_id)
        WHERE tsp.is_speed_violation = TRUE`;

    // Aplica filtro de permissão
    if (user && !userIsAdmin(user)) {
        const filter = getColaboradoresFilter(user, { includeAllStates: true });
        if (filter.allowedStates.length > 0) {
            params.push(filter.allowedStates);
            query += ` AND c.estado = ANY($${params.length})`;
        } else {
            return []; // Sem acesso
        }
    }

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

    const { rows } = await sinergia_pool.query(query, params);

    let result = rows;

    // Filtro em memória para regional/seccional/gestor
    if (user && !userIsAdmin(user)) {
        result = result.filter(r => {
            const agentData = {
                id: r.agent_id,
                nome: r.nome,
                regional: r.regional,
                seccional: r.seccional,
                gestor: r.gestor,
                estado: r.agent_estado
            };
            return checkAgentPermission(agentData, user);
        });
    }

    return result;
}

/**
 * Retorna trail com detecção de paradas.
 * Algoritmo:
 *   - Agrupa pontos consecutivos por proximidade geográfica (< 20m)
 *   - Se cluster tem >= 3 pontos consecutivos → potential stop
 *   - Speed média do cluster < 2 km/h → confirma parada
 *   - Duração > 60s → registra como Stop
 */
async function getAgentTrailWithStops(agentId, dateFrom, dateTo) {
    const points = await getAgentTrailUnified(agentId, dateFrom, dateTo);
    if (points.length === 0) return { points: [], stops: [] };

    const stops = [];
    const cleanedPoints = [];
    let clusterStart = null;
    let clusterPoints = [];

    for (let i = 0; i < points.length; i++) {
        const pt = points[i];
        const lat = parseFloat(pt.latitude);
        const lng = parseFloat(pt.longitude);

        if (clusterStart === null) {
            clusterStart = { lat, lng, idx: i };
            clusterPoints = [pt];
            continue;
        }

        // Calcula distância do cluster start
        const d = haversineKm(clusterStart.lat, clusterStart.lng, lat, lng);

        if (d < 0.05) { // < 50m (ajustado para absorver drift de GPS indoor)
            clusterPoints.push(pt);
        } else {
            // Finalizou o cluster — avalia se é parada
            const stop = evaluateStop(clusterPoints, clusterStart);
            if (stop) {
                stops.push(stop);
                // Colapsa os pontos do cluster para remover o efeito "teia de aranha" (spiderweb) do drift
                cleanedPoints.push({ ...clusterPoints[0], latitude: clusterStart.lat, longitude: clusterStart.lng });
                if (clusterPoints.length > 1) {
                    cleanedPoints.push({ ...clusterPoints[clusterPoints.length - 1], latitude: clusterStart.lat, longitude: clusterStart.lng });
                }
            } else {
                cleanedPoints.push(...clusterPoints);
            }
            clusterStart = { lat, lng, idx: i };
            clusterPoints = [pt];
        }
    }

    // Último cluster
    if (clusterPoints.length > 0) {
        const stop = evaluateStop(clusterPoints, clusterStart);
        if (stop) {
            stops.push(stop);
            cleanedPoints.push({ ...clusterPoints[0], latitude: clusterStart.lat, longitude: clusterStart.lng });
            if (clusterPoints.length > 1) {
                cleanedPoints.push({ ...clusterPoints[clusterPoints.length - 1], latitude: clusterStart.lat, longitude: clusterStart.lng });
            }
        } else {
            cleanedPoints.push(...clusterPoints);
        }
    }

    return { points: cleanedPoints, stops };
}

function evaluateStop(clusterPoints, clusterStart) {
    if (clusterPoints.length < 3) return null;

    const speeds = clusterPoints
        .map(p => parseFloat(p.speed))
        .filter(s => s != null && !isNaN(s));
    const avgSpeed = speeds.length > 0
        ? speeds.reduce((a, b) => a + b, 0) / speeds.length
        : 0;

    // Confirma parada: speed média < 2.5 km/h
    if (avgSpeed > 2.5 && speeds.length > 0) return null;

    const first = clusterPoints[0];
    const last = clusterPoints[clusterPoints.length - 1];
    const durationMs = new Date(last.recorded_at) - new Date(first.recorded_at);

    if (durationMs < 60_000) return null; // < 60s não conta

    const accuracies = clusterPoints
        .map(p => parseFloat(p.accuracy))
        .filter(a => a != null && !isNaN(a) && a > 0);
    const accuracyAvg = accuracies.length > 0
        ? accuracies.reduce((a, b) => a + b, 0) / accuracies.length
        : null;

    return {
        lat: clusterStart.lat,
        lng: clusterStart.lng,
        stopped_at: first.recorded_at,
        resumed_at: last.recorded_at,
        duration_seconds: Math.round(durationMs / 1000),
        n_points: clusterPoints.length,
        accuracy_avg: accuracyAvg ? Math.round(accuracyAvg * 10) / 10 : null,
        speed_avg: Math.round(avgSpeed * 100) / 100,
    };
}

function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
            + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2))
            * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg) {
    return deg * (Math.PI / 180);
}

module.exports = {
    getAgentSpeedLimit,
    upsertAgentSpeedLimit,
    getGlobalSpeedLimit,
    upsertGlobalSpeedLimit,
    getAgentsLastPositionUnified,
    getAgentTrailUnified,
    getAgentTrailWithStops,
    getSpeedViolationsFromUnified,
};