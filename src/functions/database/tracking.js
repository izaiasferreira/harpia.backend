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
            recorded_at: point.timestamp
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
            recorded_at: v.timestamp
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
        recorded_at: incident.timestamp
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
        SELECT DISTINCT ON (agent_id)
            agent_id, latitude, longitude, speed, accuracy, recorded_at
        FROM tracking_points
        ORDER BY agent_id, recorded_at DESC
    `);
    return rows;
}

async function getAgentTrail(agentId, dateFrom, dateTo) {
    const params = [agentId];
    let query = `SELECT latitude, longitude, speed, accuracy, recorded_at
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
    let query = 'SELECT sv.*, l.estado as agent_estado FROM speed_violations sv LEFT JOIN login l ON l.id = sv.agent_id WHERE 1=1';

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
    return rows;
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

module.exports = {
    insertTrackingPoints,
    insertSpeedViolations,
    insertFallIncident,
    insertAlertLogs,
    getAgentsLastPosition,
    getAgentTrail,
    getSpeedViolations,
    getFallIncidents,
    updateFallIncidentStatus,
    getAlertLogs,
};
