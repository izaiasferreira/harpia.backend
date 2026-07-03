const { cenos_pool } = require('../../db');
const { pinCreateSchema } = require('../../db/schemas');
const { getColaboradoresFilter, userIsAdmin, checkAgentPermission } = require('./admin');

async function findAgentById(agentId) {
    const normalizedId = String(agentId).trim().toUpperCase();
    const { rows } = await cenos_pool.query(
        'SELECT id, estado, telegram_id FROM login WHERE upper(id) = $1',
        [normalizedId]
    );
    if (rows.length === 0) return null;

    const agent = rows[0];
    agent.id = agent.id.toUpperCase();

    // Buscar nome na tabela colaboradores (cenos_pool)
    try {
        const { rows: colabRows } = await cenos_pool.query(
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

async function listPins(limit = 50, user = null) {
    // Se não tiver usuário, retorna lista vazia (segurança)
    if (!user) {
        return [];
    }

    let query = `
        SELECT ap.*, l.nome as agent_nome, l.estado as agent_estado
        FROM app_pins ap
        LEFT JOIN login l ON upper(l.id) = upper(ap.agent_id)
        WHERE 1=1
    `;
    let params = [];
    let paramIndex = 1;

    // Aplica filtro de permissão se não for admin
    if (!userIsAdmin(user)) {
        const colabFilter = getColaboradoresFilter(user, { includeAllStates: true });

        if (colabFilter.allowedStates.length > 0) {
            query += ` AND l.estado = ANY($${paramIndex})`;
            params.push(colabFilter.allowedStates);
            paramIndex++;
        }
    }

    query += ` ORDER BY ap.created_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const { rows } = await cenos_pool.query(query, params);

    // Se não for admin, aplica filtro adicional em memória para regional/seccional/gestor
    if (!userIsAdmin(user)) {
        const ids = [...new Set(rows.map(r => r.agent_id).filter(Boolean))];
        if (ids.length > 0) {
            const colabFilter = getColaboradoresFilter(user);
            let colabQuery = `SELECT "ID", "regional", "seccional", "GESTOR IMEDIATO" FROM colaboradores WHERE "ID" = ANY($1)`;
            const { rows: colabRows } = await cenos_pool.query(colabQuery, [ids]);

            const allowedMap = new Map();
            colabRows.forEach(c => {
                const agentData = {
                    id: c['ID'],
                    regional: c['regional'],
                    seccional: c['seccional'],
                    gestor: c['GESTOR IMEDIATO']
                };
                allowedMap.set(c['ID'].toUpperCase(), checkAgentPermission(agentData, user));
            });

            return rows.filter(r => allowedMap.get(r.agent_id?.toUpperCase()) !== false);
        }
    }

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
    findAgentById,
    invalidateExistingPins,
    createPin,
    listPins,
    deletePinById,
    findValidPin,
    markPinAsUsed,
};
