const { cenos_pool } = require('../../db');
const redisClient = require('../../redis');
const { getUserAllowedStatePools, userIsAdmin, getColaboradoresFilter, checkAgentPermission } = require('./admin');

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
        console.error('[REDIS] Erro ao atualizar geolocalização no Redis:', err.message);
    }
}

async function getAgentsHeartbeat(user = null) {
    let query = `
        SELECT
            l.id AS agent_id,
            l.estado AS agent_estado,
            l.last_heartbeat_at,
            l.last_heartbeat_lat,
            l.last_heartbeat_lng
        FROM login l
        WHERE l.last_heartbeat_at IS NOT NULL
    `;
    let params = [];

    // Aplica filtro de permissão
    if (user && !userIsAdmin(user)) {
        const filter = getColaboradoresFilter(user, { includeAllStates: true });
        if (filter.allowedStates.length > 0) {
            query += ` AND l.estado = ANY($1)`;
            params.push(filter.allowedStates);
        } else {
            query += ` AND 1 = 0`; // Sem acesso
        }
    }

    query += ` ORDER BY l.last_heartbeat_at DESC`;

    const { rows } = await cenos_pool.query(query, params);
    return rows;
}

module.exports = { updateHeartbeat, getAgentsHeartbeat };
