const { cenos_pool } = require('../../db');

// ─── Proximity Alerts: consulta admin ────────────────────────────────────────

async function get_agent_proximity_alerts(agentId, dateFrom, dateTo) {
    const params = [agentId];
    let query = `
        SELECT apa.id,
               apa.agent_id,
               COALESCE(c."Nome", l.id) as agent_nome,
               apa.latitude,
               apa.longitude,
               apa.motivo,
               apa.distance,
               apa.action_taken,
               apa.recorded_at
        FROM agent_proximity_alerts apa
        LEFT JOIN login l ON l.id = apa.agent_id
        LEFT JOIN colaboradores c ON c."ID" = apa.agent_id
        WHERE apa.agent_id = $1`;

    if (dateFrom) {
        params.push(dateFrom);
        query += ` AND apa.recorded_at >= $${params.length}`;
    }
    if (dateTo) {
        params.push(dateTo);
        query += ` AND apa.recorded_at <= $${params.length}`;
    }

    query += ' ORDER BY apa.recorded_at DESC';

    const { rows } = await cenos_pool.query(query, params);
    return rows;
}

module.exports = {
    get_agent_proximity_alerts,
};
