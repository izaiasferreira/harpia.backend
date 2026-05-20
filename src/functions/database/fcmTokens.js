const { cenos_pool } = require('../../db');

let tableChecked = false;

async function ensureFcmTable() {
    if (tableChecked) return;

    await cenos_pool.query(`
        CREATE TABLE IF NOT EXISTS fcm_tokens (
            id SERIAL PRIMARY KEY,
            agent_id VARCHAR(50) NOT NULL,
            token TEXT NOT NULL,
            device_info TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(agent_id, token)
        )
    `);

    await cenos_pool.query(`
        CREATE INDEX IF NOT EXISTS idx_fcm_tokens_agent ON fcm_tokens(agent_id)
    `);

    tableChecked = true;
}

async function upsertFcmToken(agentId, token, deviceInfo) {
    await ensureFcmTable();
    await cenos_pool.query(`
        INSERT INTO fcm_tokens (agent_id, token, device_info, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (agent_id, token) DO UPDATE SET updated_at = NOW(), device_info = $3
    `, [agentId, token, deviceInfo || null]);
}

async function removeFcmToken(token) {
    await ensureFcmTable();
    await cenos_pool.query('DELETE FROM fcm_tokens WHERE token = $1', [token]);
}

async function getTokensByAgent(agentId) {
    await ensureFcmTable();
    const { rows } = await cenos_pool.query(
        'SELECT token FROM fcm_tokens WHERE agent_id = $1 ORDER BY updated_at DESC',
        [agentId]
    );
    return rows.map(r => r.token);
}

async function getTokensByAgents(agentIds) {
    await ensureFcmTable();
    if (!agentIds || agentIds.length === 0) return [];
    const { rows } = await cenos_pool.query(
        'SELECT agent_id, token FROM fcm_tokens WHERE agent_id = ANY($1) ORDER BY updated_at DESC',
        [agentIds]
    );
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
