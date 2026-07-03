const { cenos_pool } = require('../../db');
const { fallIncidentSchema, crashIncidentSyncSchema } = require('../../db/schemas');
const { getUserAllowedStatePools, userIsAdmin, getColaboradoresFilter, checkAgentPermission } = require('./admin');

// ─── Fall Incidents (Crash Detection) ─────────────────────────────────────

async function insertFallIncident(agentId, incident) {
    const validated = crashIncidentSyncSchema.parse({
        ...incident,
        agent_id: agentId,
    });
    const { rows } = await cenos_pool.query(
        `INSERT INTO fall_incidents (
            agent_id, latitude, longitude, status, recorded_at,
            free_fall_gravity, impact_gravity,
            gyro_rotation_x, gyro_rotation_y, gyro_rotation_z, gyro_rotation_total,
            gps_speed_kmh, gps_accuracy_m,
            phase_free_fall, phase_impact, phase_rotation, phase_immobility,
            speed_drop_confirmed,
            free_fall_duration_ms, impact_latency_ms,
            user_cancelled, user_cancelled_at,
            device_model, os_version, battery_level, is_charging, network_type,
            sensor_raw
        ) VALUES (
            $1, $2, $3, 'pending', $4,
            $5, $6,
            $7, $8, $9, $10,
            $11, $12,
            $13, $14, $15, $16,
            $17,
            $18, $19,
            $20, $21,
            $22, $23, $24, $25, $26,
            $27
        ) RETURNING *`,
        [
            agentId,
            validated.lat ?? null,
            validated.lng ?? null,
            validated.timestamp ? new Date(validated.timestamp) : new Date(),
            validated.freeFallGravity ?? null,
            validated.impactGravity ?? null,
            validated.gyroRotationX ?? null,
            validated.gyroRotationY ?? null,
            validated.gyroRotationZ ?? null,
            validated.gyroRotationTotal ?? null,
            validated.gpsSpeedKmh ?? null,
            validated.gpsAccuracyM ?? null,
            validated.phaseFreeFall ?? false,
            validated.phaseImpact ?? false,
            validated.phaseRotation ?? false,
            validated.phaseImmobility ?? false,
            validated.speedDropConfirmed ?? false,
            validated.freeFallDurationMs ?? null,
            validated.impactLatencyMs ?? null,
            validated.userCancelled ?? false,
            validated.userCancelledAt ? new Date(validated.userCancelledAt) : null,
            validated.deviceModel ?? null,
            validated.osVersion ?? null,
            validated.batteryLevel ?? null,
            validated.isCharging ?? null,
            validated.networkType ?? null,
            validated.sensorRaw ? JSON.stringify(validated.sensorRaw) : null,
        ]
    );
    return rows[0];
}

async function getFallIncidents(filters = {}, user = null) {
    const params = [];
    let query = `
        SELECT
            fi.*,
            l.estado as agent_estado,
            c."Nome" as agent_nome,
            c."regional" as agent_regional,
            c."seccional" as agent_seccional,
            c."GESTOR IMEDIATO" as agent_gestor
        FROM fall_incidents fi
        LEFT JOIN login l ON l.id = fi.agent_id
        LEFT JOIN colaboradores c ON c."ID" = fi.agent_id
        WHERE 1=1`;

    // Aplica filtro de permissão
    if (user && !userIsAdmin(user)) {
        const filter = getColaboradoresFilter(user, { includeAllStates: true });
        if (filter.allowedStates.length > 0) {
            if (filter.allowedStates.length === 1) {
                query += ` AND l.estado = $${params.length + 1}`;
                params.push(filter.allowedStates[0]);
            } else {
                query += ` AND l.estado = ANY($${params.length + 1})`;
                params.push(filter.allowedStates);
            }
        } else {
            query += ` AND 1 = 0`; // Sem acesso
        }
    }

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
    if (filters.dateTo) {
        params.push(filters.dateTo);
        query += ` AND fi.recorded_at <= $${params.length}`;
    }
    if (filters.speedDropConfirmed === true) {
        query += ` AND fi.speed_drop_confirmed = TRUE`;
    }

    query += ' ORDER BY fi.recorded_at DESC LIMIT 200';

    const { rows } = await cenos_pool.query(query, params);

    // Aplica filtro em memória para regional/seccional/gestor
    if (user && !userIsAdmin(user)) {
        return rows.filter(r => {
            const agentData = {
                id: r.agent_id,
                nome: r.agent_nome,
                regional: r.agent_regional,
                seccional: r.agent_seccional,
                gestor: r.agent_gestor,
                estado: r.agent_estado
            };
            return checkAgentPermission(agentData, user);
        });
    }

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

// ─── Agent Alerts Log ───────────────────────────────────────────────────────

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

// ─── Proximity Alerts ───────────────────────────────────────────────────────

async function insertProximityAlerts(agentId, alerts) {
    if (!alerts || alerts.length === 0) return;

    const values = [];
    const params = [];
    let paramIdx = 1;

    for (const a of alerts) {
        values.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7})`);
        params.push(
            a.id,
            agentId,
            a.lat || null,
            a.lng || null,
            a.motivo || 'Risco de segurança',
            a.distance || 0,
            a.actionTaken || 'unknown',
            a.recordedAt ? new Date(a.recordedAt) : new Date()
        );
        paramIdx += 8;
    }

    await cenos_pool.query(
        `INSERT INTO agent_proximity_alerts (id, agent_id, latitude, longitude, motivo, distance, action_taken, recorded_at) VALUES ${values.join(',')}`,
        params
    );
}

module.exports = {
    insertFallIncident,
    getFallIncidents,
    updateFallIncidentStatus,
    insertAlertLogs,
    getAlertLogs,
    insertProximityAlerts,
};
