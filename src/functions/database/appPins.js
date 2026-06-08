const { cenos_pool, pi_pool, ma_pool } = require('../../db');
const { pinCreateSchema } = require('../../db/schemas');

async function ensureAppPinsTable() {
    // Tabela app_pins criada via migration central
}

async function findAgentById(agentId) {
    const normalizedId = String(agentId).trim().toUpperCase();
    const { rows } = await cenos_pool.query(
        'SELECT id, estado, telegram_id FROM login WHERE upper(id) = $1',
        [normalizedId]
    );
    if (rows.length === 0) return null;

    const agent = rows[0];
    agent.id = agent.id.toUpperCase();

    // Buscar nome na tabela colaboradores (PI ou MA)
    const pool = (agent.estado || 'pi').toLowerCase() === 'ma' ? ma_pool : pi_pool;
    try {
        const { rows: colabRows } = await pool.query(
            `SELECT "Nome" FROM colaboradores WHERE upper("ID") = $1`,
            [normalizedId]
        );
        agent.nome = colabRows.length > 0 ? colabRows[0].Nome : agent.id;
    } catch {
        agent.nome = agent.id;
    }

    return agent;
}

async function invalidateExistingPins(agentId) {
    const normalizedId = String(agentId).trim().toUpperCase();
    await cenos_pool.query(
        'UPDATE app_pins SET expires_at = CURRENT_TIMESTAMP WHERE upper(agent_id) = $1 AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP',
        [normalizedId]
    );
}

async function createPin(agentId, pin, expiresAt) {
    const validated = pinCreateSchema.parse({ agent_id: agentId, pin, expires_at: expiresAt });
    const normalizedId = validated.agent_id;
    await cenos_pool.query(
        'INSERT INTO app_pins (agent_id, pin, expires_at) VALUES ($1, $2, $3)',
        [normalizedId, validated.pin, validated.expires_at]
    );
}

async function listPins(limit = 50) {
    const { rows } = await cenos_pool.query(`
        SELECT ap.*, l.nome as agent_nome, l.estado as agent_estado
        FROM app_pins ap
        LEFT JOIN login l ON upper(l.id) = upper(ap.agent_id)
        ORDER BY ap.created_at DESC
        LIMIT $1
    `, [limit]);
    return rows;
}

async function deletePinById(id) {
    await cenos_pool.query('DELETE FROM app_pins WHERE id = $1', [id]);
}

async function findValidPin(agentId, pin) {
    const normalizedId = String(agentId).trim().toUpperCase();
    const { rows } = await cenos_pool.query(
        'SELECT * FROM app_pins WHERE upper(agent_id) = $1 AND pin = $2 AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP',
        [normalizedId, pin]
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
