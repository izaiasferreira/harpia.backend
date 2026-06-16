const { cenos_pool } = require('../../db');
const { trackingPointSchema, speedViolationSchema, fallIncidentSchema } = require('../../db/schemas');

async function insertTrackingPoints(agentId, points) {
    if (!points || points.length === 0) return;

    const values = [];
    const params = [];
    let paramIdx = 1;

    for (const point of points) {
        const validated = trackingPointSchema.parse({
            agent_id: agentId,
            latitude: point.lat,
            longitude: point.lng,
            speed: point.speed,
            accuracy: point.accuracy,
            recorded_at: new Date(point.timestamp)
        });
        values.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5})`);
        params.push(
            validated.agent_id,
            validated.latitude,
            validated.longitude,
            validated.speed,
            validated.accuracy,
            validated.recorded_at
        );
        paramIdx += 6;
    }

    await cenos_pool.query(
        `INSERT INTO tracking_points (agent_id, latitude, longitude, speed, accuracy, recorded_at) VALUES ${values.join(',')}`,
        params
    );
}

async function insertTrackingPointsExtended(agentId, points, deviceInfo) {
    if (!points || points.length === 0) return;

    const values = [];
    const params = [];
    let paramIdx = 1;

    const defaultDevice = {
        batteryLevel: null,
        connectionType: null,
        deviceModel: null,
        devicePlatform: null,
        osVersion: null,
        ...(deviceInfo || {})
    };

    for (const point of points) {
        // Normalizar battery_level: Capacitor envia 0~1, nativo envia 0~100
        let batteryLevel = point.batteryLevel ?? defaultDevice.batteryLevel;
        if (batteryLevel != null && batteryLevel <= 1) {
            batteryLevel = Math.round(batteryLevel * 100);
        }

        const validated = trackingPointSchema.parse({
            agent_id: agentId,
            latitude: point.lat,
            longitude: point.lng,
            speed: point.speed,
            accuracy: point.accuracy,
            battery_level: batteryLevel,
            network_type: point.networkType ?? defaultDevice.connectionType,
            device_model: point.deviceModel ?? defaultDevice.deviceModel,
            device_platform: point.devicePlatform ?? defaultDevice.devicePlatform,
            os_version: point.osVersion ?? defaultDevice.osVersion,
            recorded_at: new Date(point.timestamp)
        });
        values.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7}, $${paramIdx + 8}, $${paramIdx + 9}, $${paramIdx + 10})`);
        params.push(
            validated.agent_id,
            validated.latitude,
            validated.longitude,
            validated.speed,
            validated.accuracy,
            validated.battery_level,
            validated.network_type,
            validated.device_model,
            validated.device_platform,
            validated.os_version,
            validated.recorded_at
        );
        paramIdx += 11;
    }

    await cenos_pool.query(
        `INSERT INTO tracking_points (agent_id, latitude, longitude, speed, accuracy, battery_level, network_type, device_model, device_platform, os_version, recorded_at) VALUES ${values.join(',')}`,
        params
    );
}

async function insertSpeedViolations(agentId, violations) {
    if (!violations || violations.length === 0) return;

    const values = [];
    const params = [];
    let paramIdx = 1;

    for (const v of violations) {
        const validated = speedViolationSchema.parse({
            agent_id: agentId,
            latitude: v.lat,
            longitude: v.lng,
            speed: v.speed,
            speed_limit: v.speedLimit || 50,
            recorded_at: new Date(v.timestamp)
        });
        values.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5})`);
        params.push(
            validated.agent_id,
            validated.latitude,
            validated.longitude,
            validated.speed,
            validated.speed_limit,
            validated.recorded_at
        );
        paramIdx += 6;
    }

    await cenos_pool.query(
        `INSERT INTO speed_violations (agent_id, latitude, longitude, speed, speed_limit, recorded_at) VALUES ${values.join(',')}`,
        params
    );
}

async function insertFallIncident(agentId, incident) {
    const validated = fallIncidentSchema.parse({
        agent_id: agentId,
        latitude: incident.lat || null,
        longitude: incident.lng || null,
        status: 'pending',
        recorded_at: new Date(incident.timestamp)
    });
    const { rows } = await cenos_pool.query(
        `INSERT INTO fall_incidents (agent_id, latitude, longitude, status, recorded_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [validated.agent_id, validated.latitude, validated.longitude, validated.status, validated.recorded_at]
    );
    return rows[0];
}

async function getAgentsLastPosition() {
    const { rows } = await cenos_pool.query(`
        SELECT DISTINCT ON (tp.agent_id)
            tp.agent_id, tp.latitude, tp.longitude, tp.speed, tp.accuracy, tp.battery_level, tp.network_type, tp.device_model, tp.device_platform, tp.os_version, tp.recorded_at,
            l.estado as agent_estado
        FROM tracking_points tp
        LEFT JOIN login l ON l.id = tp.agent_id
        ORDER BY tp.agent_id, tp.recorded_at DESC
    `);

    if (rows.length === 0) return rows;

    // Enriquecer com dados do colaborador (nome, regional, seccional, gestor)
    const colLookup = async (ids) => {
        if (ids.length === 0) return {};
        const { rows: cols } = await cenos_pool.query(
            `SELECT "ID", "Nome", "seccional", "regional", "GESTOR IMEDIATO" FROM colaboradores WHERE "ID" = ANY($1)`,
            [ids]
        );
        const map = {};
        cols.forEach(c => map[c.ID.toUpperCase()] = c);
        return map;
    };

    const allIds = [...new Set(rows.map(r => r.agent_id.toUpperCase()))];
    const cols = await colLookup(allIds);

    return rows.map(r => {
        const id = r.agent_id.toUpperCase();
        const col = cols[id] || {};
        return {
            ...r,
            nome: col['Nome'] || null,
            regional: col['regional'] || null,
            seccional: col['seccional'] || null,
            gestor: col['GESTOR IMEDIATO'] || null,
        };
    });
}

async function getAgentTrail(agentId, dateFrom, dateTo) {
    const params = [agentId];
    let query = `SELECT latitude, longitude, speed, accuracy, battery_level, network_type, device_model, device_platform, os_version, recorded_at
                 FROM tracking_points WHERE agent_id = $1`;

    if (dateFrom) {
        params.push(dateFrom);
        query += ` AND recorded_at >= $${params.length}`;
    }
    if (dateTo) {
        params.push(dateTo);
        query += ` AND recorded_at <= $${params.length}`;
    }

    query += ' ORDER BY recorded_at ASC LIMIT 5000';

    const { rows } = await cenos_pool.query(query, params);
    return rows;
}

async function getSpeedViolations(filters = {}) {
    const params = [];
    let query = `SELECT sv.*, l.estado as agent_estado
                 FROM speed_violations sv
                 LEFT JOIN login l ON l.id = sv.agent_id
                 WHERE 1=1`;

    if (filters.agentId) {
        params.push(filters.agentId);
        query += ` AND sv.agent_id = $${params.length}`;
    }
    if (filters.dateFrom) {
        params.push(filters.dateFrom);
        query += ` AND sv.recorded_at >= $${params.length}`;
    }
    if (filters.dateTo) {
        params.push(filters.dateTo);
        query += ` AND sv.recorded_at <= $${params.length}`;
    }

    query += ' ORDER BY sv.recorded_at DESC LIMIT 200';

    const { rows } = await cenos_pool.query(query, params);
    if (rows.length === 0) return rows;

    // Enriquecer com dados do colaborador
    const colLookup = async (ids) => {
        if (ids.length === 0) return {};
        const { rows: cols } = await cenos_pool.query(
            `SELECT "ID", "Nome", "seccional", "regional", "GESTOR IMEDIATO" FROM colaboradores WHERE "ID" = ANY($1)`,
            [ids]
        );
        const map = {};
        cols.forEach(c => map[c.ID.toUpperCase()] = c);
        return map;
    };

    const allIds = [...new Set(rows.map(r => r.agent_id.toUpperCase()))];
    const cols = await colLookup(allIds);

    return rows.map(r => {
        const id = r.agent_id.toUpperCase();
        const col = cols[id] || {};
        return {
            ...r,
            nome: col['Nome'] || null,
            regional: col['regional'] || null,
            seccional: col['seccional'] || null,
            gestor: col['GESTOR IMEDIATO'] || null,
        };
    });
}

async function getFallIncidents(filters = {}) {
    const params = [];
    let query = 'SELECT fi.*, l.estado as agent_estado FROM fall_incidents fi LEFT JOIN login l ON l.id = fi.agent_id WHERE 1=1';

    if (filters.status) {
        params.push(filters.status);
        query += ` AND fi.status = $${params.length}`;
    }
    if (filters.agentId) {
        params.push(filters.agentId);
        query += ` AND fi.agent_id = $${params.length}`;
    }
    if (filters.dateFrom) {
        params.push(filters.dateFrom);
        query += ` AND fi.recorded_at >= $${params.length}`;
    }

    query += ' ORDER BY fi.recorded_at DESC LIMIT 100';

    const { rows } = await cenos_pool.query(query, params);
    return rows;
}

async function updateFallIncidentStatus(id, status, notes) {
    const validated = fallIncidentSchema.pick({ status: true, notes: true }).parse({ status, notes });
    const confirmedAt = (validated.status === 'confirmed' || validated.status === 'false_positive') ? new Date() : null;
    const { rows } = await cenos_pool.query(
        `UPDATE fall_incidents SET status = $1, confirmed_at = $2, notes = $3 WHERE id = $4 RETURNING *`,
        [validated.status, confirmedAt, validated.notes || null, id]
    );
    return rows[0];
}

async function insertAlertLogs(agentId, alerts) {
    if (!alerts || alerts.length === 0) return;

    const values = [];
    const params = [];
    let paramIdx = 1;

    for (const alert of alerts) {
        values.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5})`);
        params.push(
            agentId,
            alert.type,
            alert.lat || null,
            alert.lng || null,
            JSON.stringify(alert.details || {}),
            new Date(alert.timestamp)
        );
        paramIdx += 6;
    }

    await cenos_pool.query(
        `INSERT INTO agent_alerts_log (agent_id, alert_type, latitude, longitude, details, recorded_at) VALUES ${values.join(',')}`,
        params
    );
}

async function getAlertLogs(filters = {}) {
    const params = [];
    let query = `SELECT al.*, l.estado as agent_estado
                 FROM agent_alerts_log al
                 LEFT JOIN login l ON l.id = al.agent_id
                 WHERE 1=1`;

    if (filters.agentId) {
        params.push(filters.agentId);
        query += ` AND al.agent_id = $${params.length}`;
    }
    if (filters.type) {
        params.push(filters.type);
        query += ` AND al.alert_type = $${params.length}`;
    }
    if (filters.dateFrom) {
        params.push(filters.dateFrom);
        query += ` AND al.recorded_at >= $${params.length}`;
    }
    if (filters.dateTo) {
        params.push(filters.dateTo);
        query += ` AND al.recorded_at <= $${params.length}`;
    }

    query += ' ORDER BY al.recorded_at DESC LIMIT 200';

    const { rows } = await cenos_pool.query(query, params);
    return rows;
}

async function deleteSpeedViolation(id) {
    const { rows } = await cenos_pool.query(
        'DELETE FROM speed_violations WHERE id = $1 RETURNING *',
        [id]
    );
    return rows[0] || null;
}

module.exports = {
    insertTrackingPoints,
    insertTrackingPointsExtended,
    insertSpeedViolations,
    insertFallIncident,
    insertAlertLogs,
    getAgentsLastPosition,
    getAgentTrail,
    getSpeedViolations,
    getFallIncidents,
    updateFallIncidentStatus,
    getAlertLogs,
    deleteSpeedViolation,
};
