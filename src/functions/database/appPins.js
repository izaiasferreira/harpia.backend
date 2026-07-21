const { cenos_pool } = require('../../db');
const { pinCreateSchema } = require('../../db/schemas');
const { getColaboradoresFilter, userIsAdmin, checkAgentPermission } = require('./admin');

async function findAgentById(agentId) {
    const normalizedId = String(agentId).trim().toUpperCase();
    const { rows } = await cenos_pool.query(
        `SELECT c."ID" as id, c."estado", c."Nome" as nome, c."MAT" as mat, l.telegram_id 
         FROM colaboradores c
         LEFT JOIN login l ON upper(l.id) = upper(c."ID")
         WHERE upper(c."ID") = $1`,
        [normalizedId]
    );
    if (rows.length === 0) return null;

    return {
        id: rows[0].id.toUpperCase(),
        estado: rows[0].estado,
        nome: rows[0].nome,
        mat: rows[0].mat,
        telegram_id: rows[0].telegram_id || 0
    };
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
        SELECT ap.*, c."Nome" as agent_nome, c.estado as agent_estado
        FROM app_pins ap
        LEFT JOIN colaboradores c ON upper(c."ID") = upper(ap.agent_id)
        WHERE 1=1
    `;
    let params = [];
    let paramIndex = 1;

    // Aplica filtro de permissão se não for admin
    if (!userIsAdmin(user)) {
        const colabFilter = getColaboradoresFilter(user, { includeAllStates: true });

        if (colabFilter.allowedStates.length > 0) {
            query += ` AND c.estado = ANY($${paramIndex})`;
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
