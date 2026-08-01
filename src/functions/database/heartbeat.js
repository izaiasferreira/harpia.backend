const { cenos_pool } = require('../../db');
const redisClient = require('../../redis');
const { getUserAllowedStatePools, userIsAdmin, getColaboradoresFilter, checkAgentPermission } = require('./admin');

async function updateHeartbeat(agentId, lat, lng, deviceTimestamp = null, androidVersion = null, deviceModel = null, metadata = null) {
    let ts;
    if (deviceTimestamp) {
        const d = new Date(deviceTimestamp);
        ts = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
    } else {
        ts = new Date().toISOString();
    }
    await cenos_pool.query(
        `INSERT INTO agent_heartbeats 
            (agent_id, last_heartbeat_at, last_heartbeat_lat, last_heartbeat_lng, updated_at, android_version, device_model, metadata)
         VALUES ($1, $2, $3, $4, $2, $5, $6, $7)
         ON CONFLICT (agent_id) DO UPDATE SET
             last_heartbeat_at = EXCLUDED.last_heartbeat_at,
             last_heartbeat_lat = EXCLUDED.last_heartbeat_lat,
             last_heartbeat_lng = EXCLUDED.last_heartbeat_lng,
             updated_at = EXCLUDED.updated_at,
             android_version = COALESCE(EXCLUDED.android_version, agent_heartbeats.android_version),
             device_model = COALESCE(EXCLUDED.device_model, agent_heartbeats.device_model),
             metadata = COALESCE(EXCLUDED.metadata, agent_heartbeats.metadata)`,
        [agentId, ts, lat, lng, androidVersion, deviceModel, metadata ? JSON.stringify(metadata) : null]
    );

    try {
        if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
            await redisClient.geoAdd('agents:locations', {
                longitude: Number(lng),
                latitude: Number(lat),
                member: String(agentId)
            });
        }
    } catch (err) {
        console.error('[REDIS] Erro ao atualizar geolocalização no Redis:', err.message);
    }
}

async function getAgentsHeartbeat(user = null) {
    let query = `
        SELECT
            h.agent_id,
            c.estado AS agent_estado,
            h.last_heartbeat_at,
            h.last_heartbeat_lat,
            h.last_heartbeat_lng
        FROM agent_heartbeats h
        INNER JOIN colaboradores c ON UPPER(h.agent_id) = UPPER(c."ID")
        WHERE h.last_heartbeat_at IS NOT NULL
    `;
    let params = [];

    // Aplica filtro de permissão
    if (user && !userIsAdmin(user)) {
        const filter = getColaboradoresFilter(user, { includeAllStates: true });
        if (filter.allowedStates.length > 0) {
            query += ` AND c.estado = ANY($1)`;
            params.push(filter.allowedStates);
        } else {
            query += ` AND 1 = 0`; // Sem acesso
        }
    }

    query += ` ORDER BY h.last_heartbeat_at DESC`;

    const { rows } = await cenos_pool.query(query, params);
    return rows;
}

module.exports = { updateHeartbeat, getAgentsHeartbeat };
