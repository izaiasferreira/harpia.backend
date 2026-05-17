const { cenos_pool, pi_pool, ma_pool } = require('../../db');

async function ensureAppPinsTable() {
    await cenos_pool.query(`
        CREATE TABLE IF NOT EXISTS app_pins (
            id SERIAL PRIMARY KEY,
            agent_id VARCHAR(50) NOT NULL,
            pin VARCHAR(6) NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            used_at TIMESTAMP
        )
    `);
}

async function findAgentById(agentId) {
    const { rows } = await cenos_pool.query(
        'SELECT id, estado, telegram_id FROM login WHERE lower(id) = $1',
        [String(agentId).trim().toLowerCase()]
    );
    if (rows.length === 0) return null;

    const agent = rows[0];

    // Buscar nome na tabela colaboradores (PI ou MA)
    const pool = (agent.estado || 'pi').toLowerCase() === 'ma' ? ma_pool : pi_pool;
    try {
        const { rows: colabRows } = await pool.query(
            `SELECT "Nome" FROM colaboradores WHERE "ID" = $1`,
            [String(agentId).trim().toUpperCase()]
        );
        agent.nome = colabRows.length > 0 ? colabRows[0].Nome : agentId;
    } catch {
        agent.nome = agentId;
    }

    return agent;
}

async function invalidateExistingPins(agentId) {
    await cenos_pool.query(
        'UPDATE app_pins SET expires_at = CURRENT_TIMESTAMP WHERE agent_id = $1 AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP',
        [agentId]
    );
}

async function createPin(agentId, pin, expiresAt) {
    await cenos_pool.query(
        'INSERT INTO app_pins (agent_id, pin, expires_at) VALUES ($1, $2, $3)',
        [agentId, pin, expiresAt]
    );
}

async function listPins(limit = 50) {
    const { rows } = await cenos_pool.query(`
        SELECT ap.*, l.nome as agent_nome, l.estado as agent_estado
        FROM app_pins ap
        LEFT JOIN login l ON l.id = ap.agent_id
        ORDER BY ap.created_at DESC
        LIMIT $1
    `, [limit]);
    return rows;
}

async function deletePinById(id) {
    await cenos_pool.query('DELETE FROM app_pins WHERE id = $1', [id]);
}

async function findValidPin(agentId, pin) {
    const { rows } = await cenos_pool.query(
        'SELECT * FROM app_pins WHERE agent_id = $1 AND pin = $2 AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP',
        [agentId, pin]
    );
    return rows[0] || null;
}

async function markPinAsUsed(pinId) {
    await cenos_pool.query(
        'UPDATE app_pins SET used_at = CURRENT_TIMESTAMP WHERE id = $1',
        [pinId]
    );
}

module.exports = {
    ensureAppPinsTable,
    findAgentById,
    invalidateExistingPins,
    createPin,
    listPins,
    deletePinById,
    findValidPin,
    markPinAsUsed,
};
