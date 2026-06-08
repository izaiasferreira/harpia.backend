const { cenos_pool } = require('../../db');
const { fcmTokenCreateSchema } = require('../../db/schemas');

let tableChecked = false;

async function ensureFcmTable() {
    // Tabela fcm_tokens criada via migration central
}

async function upsertFcmToken(agentId, token, deviceInfo) {
    await ensureFcmTable();
    const validated = fcmTokenCreateSchema.parse({ agent_id: agentId, token, device_info: deviceInfo });
    const normalizedAgentId = validated.agent_id;
    await cenos_pool.query(`
        INSERT INTO fcm_tokens (agent_id, token, device_info, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (agent_id, token) DO UPDATE SET updated_at = NOW(), device_info = $3
    `, [normalizedAgentId, validated.token, validated.device_info || null]);
}

async function removeFcmToken(token) {
    await ensureFcmTable();
    await cenos_pool.query('DELETE FROM fcm_tokens WHERE token = $1', [token]);
}

async function getTokensByAgent(agentId) {
    await ensureFcmTable();
    const { rows } = await cenos_pool.query(
        'SELECT token FROM fcm_tokens WHERE upper(agent_id) = upper($1) ORDER BY updated_at DESC',
        [agentId]
    );
    return rows.map(r => r.token);
}

async function getTokensByAgents(agentIds) {
    await ensureFcmTable();
    if (!agentIds || agentIds.length === 0) return [];
    const normalizedIds = agentIds.map(id => String(id).toUpperCase());
    console.log('[FCM] getTokensByAgents - input IDs:', agentIds, 'normalized:', normalizedIds);
    const { rows } = await cenos_pool.query(
        'SELECT agent_id, token FROM fcm_tokens WHERE upper(agent_id) = ANY($1) ORDER BY updated_at DESC',
        [normalizedIds]
    );
    console.log('[FCM] Query result rows:', rows.length, rows);
    return rows;
}

async function getAllTokens() {
    await ensureFcmTable();
    const { rows } = await cenos_pool.query('SELECT agent_id, token FROM fcm_tokens ORDER BY updated_at DESC');
    return rows;
}

module.exports = {
    ensureFcmTable,
    upsertFcmToken,
    removeFcmToken,
    getTokensByAgent,
    getTokensByAgents,
    getAllTokens,
};
