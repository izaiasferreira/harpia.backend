const { cenos_pool } = require('../../db');

let tablesChecked = false;

async function ensureTrackingTables() {
    if (tablesChecked) return;

    await cenos_pool.query(`
        CREATE TABLE IF NOT EXISTS tracking_points (
            id SERIAL PRIMARY KEY,
            agent_id VARCHAR(50) NOT NULL,
            latitude DECIMAL(10,7) NOT NULL,
            longitude DECIMAL(10,7) NOT NULL,
            speed DECIMAL(6,2),
            accuracy DECIMAL(6,2),
            recorded_at TIMESTAMP NOT NULL,
            synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await cenos_pool.query(`
        CREATE INDEX IF NOT EXISTS idx_tracking_points_agent ON tracking_points(agent_id)
    `);

    await cenos_pool.query(`
        CREATE INDEX IF NOT EXISTS idx_tracking_points_recorded ON tracking_points(recorded_at)
    `);

    await cenos_pool.query(`
        CREATE TABLE IF NOT EXISTS speed_violations (
            id SERIAL PRIMARY KEY,
            agent_id VARCHAR(50) NOT NULL,
            latitude DECIMAL(10,7) NOT NULL,
            longitude DECIMAL(10,7) NOT NULL,
            speed DECIMAL(6,2) NOT NULL,
            speed_limit DECIMAL(6,2) DEFAULT 50,
            recorded_at TIMESTAMP NOT NULL,
            synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await cenos_pool.query(`
        CREATE INDEX IF NOT EXISTS idx_speed_violations_agent ON speed_violations(agent_id)
    `);

    await cenos_pool.query(`
        CREATE TABLE IF NOT EXISTS fall_incidents (
            id SERIAL PRIMARY KEY,
            agent_id VARCHAR(50) NOT NULL,
            latitude DECIMAL(10,7),
            longitude DECIMAL(10,7),
            status VARCHAR(20) DEFAULT 'pending',
            recorded_at TIMESTAMP NOT NULL,
            confirmed_at TIMESTAMP,
            notes TEXT,
            synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await cenos_pool.query(`
        CREATE INDEX IF NOT EXISTS idx_fall_incidents_agent ON fall_incidents(agent_id)
    `);

    await cenos_pool.query(`
        CREATE INDEX IF NOT EXISTS idx_fall_incidents_status ON fall_incidents(status)
    `);

    await cenos_pool.query(`
        CREATE TABLE IF NOT EXISTS agent_alerts_log (
            id SERIAL PRIMARY KEY,
            agent_id VARCHAR(50) NOT NULL,
            alert_type VARCHAR(30) NOT NULL,
            latitude DECIMAL(10,7),
            longitude DECIMAL(10,7),
            details JSONB,
            recorded_at TIMESTAMP NOT NULL,
            synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await cenos_pool.query(`
        CREATE INDEX IF NOT EXISTS idx_agent_alerts_log_agent ON agent_alerts_log(agent_id)
    `);

    await cenos_pool.query(`
        CREATE INDEX IF NOT EXISTS idx_agent_alerts_log_type ON agent_alerts_log(alert_type)
    `);

    tablesChecked = true;
}

async function insertTrackingPoints(agentId, points) {
    if (!points || points.length === 0) return;

    const values = [];
    const params = [];
    let paramIdx = 1;

    for (const point of points) {
        values.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5})`);
        params.push(
            agentId,
            point.lat,
            point.lng,
            point.speed || null,
            point.accuracy || null,
            new Date(point.timestamp)
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
        values.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5})`);
        params.push(
            agentId,
            v.lat,
            v.lng,
            v.speed,
            v.speedLimit || 50,
            new Date(v.timestamp)
        );
        paramIdx += 6;
    }

    await cenos_pool.query(
        `INSERT INTO speed_violations (agent_id, latitude, longitude, speed, speed_limit, recorded_at) VALUES ${values.join(',')}`,
        params
    );
}

async function insertFallIncident(agentId, incident) {
    const { rows } = await cenos_pool.query(
        `INSERT INTO fall_incidents (agent_id, latitude, longitude, status, recorded_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [agentId, incident.lat || null, incident.lng || null, 'pending', new Date(incident.timestamp)]
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
    const confirmedAt = (status === 'confirmed' || status === 'false_positive') ? new Date() : null;
    const { rows } = await cenos_pool.query(
        `UPDATE fall_incidents SET status = $1, confirmed_at = $2, notes = $3 WHERE id = $4 RETURNING *`,
        [status, confirmedAt, notes || null, id]
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
    ensureTrackingTables,
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
