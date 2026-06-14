const { cenos_pool } = require('../../db');
const redisClient = require('../../redis');

async function updateHeartbeat(agentId, lat, lng) {
    await cenos_pool.query(
        `UPDATE login SET last_heartbeat_at = NOW(), last_heartbeat_lat = $1, last_heartbeat_lng = $2 WHERE id = $3`,
        [lat, lng, agentId]
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
        console.error('[REDIS] Erro ao atualizar geolocalização no Redis:', err);
    }
}

async function getAgentsHeartbeat() {
    const { rows } = await cenos_pool.query(`
        SELECT
            l.id AS agent_id,
            l.estado AS agent_estado,
            l.last_heartbeat_at,
            l.last_heartbeat_lat,
            l.last_heartbeat_lng
        FROM login l
        WHERE l.last_heartbeat_at IS NOT NULL
        ORDER BY l.last_heartbeat_at DESC
    `);
    return rows;
}

module.exports = { updateHeartbeat, getAgentsHeartbeat };
