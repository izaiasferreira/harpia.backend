const { sinergia_pool } = require('../../db');
const { pinCreateSchema } = require('../../db/schemas');
const { getColaboradoresFilter, userIsAdmin, checkAgentPermission } = require('./admin');
const { normalizeAgentId } = require('../../utils/agentNormalize');

async function findAgentById(agentId) {
    const normalizedId = normalizeAgentId(agentId);
    const { rows } = await sinergia_pool.query(
        `SELECT c."ID" as id, c."estado", c."Nome" as nome, c."MAT" as mat, l.telegram_id 
         FROM colaboradores c
         LEFT JOIN login l ON TRIM(UPPER(l.id)) = TRIM(UPPER(c."ID"))
         WHERE TRIM(UPPER(c."ID")) = $1`,
        [normalizedId]
    );
    if (rows.length === 0) return null;

    return {
        id: normalizeAgentId(rows[0].id),
        estado: rows[0].estado,
        nome: rows[0].nome,
        mat: rows[0].mat,
        telegram_id: rows[0].telegram_id || 0
    };
}

async function invalidateExistingPins(agentId) {
    const normalizedId = normalizeAgentId(agentId);
    await sinergia_pool.query(
        'UPDATE app_pins SET expires_at = CURRENT_TIMESTAMP WHERE upper(agent_id) = $1 AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP',
        [normalizedId]
    );
}

async function invalidateAgentSessions(agentId, user) {
    const normalizedId = normalizeAgentId(agentId);
    await sinergia_pool.query(
        'DELETE FROM telegram_tokens WHERE upper(agent_id) = $1',
        [normalizedId]
    );
    await sinergia_pool.query(
        'DELETE FROM fcm_tokens WHERE upper(agent_id) = $1',
        [normalizedId]
    );
    if (user) {
        await sinergia_pool.query(
            'INSERT INTO session_invalidation_log (agent_id, invalidated_by_id, invalidated_by_name) VALUES ($1, $2, $3)',
            [normalizedId, user.id || null, user.nome || null]
        );
    }
}

async function createPin(agentId, pin, expiresAt, user) {
    const validated = pinCreateSchema.parse({ agent_id: agentId, pin, expires_at: expiresAt });
    const normalizedId = normalizeAgentId(validated.agent_id);
    await sinergia_pool.query(
        'INSERT INTO app_pins (agent_id, pin, expires_at, created_by_id, created_by_name) VALUES ($1, $2, $3, $4, $5)',
        [normalizedId, validated.pin, validated.expires_at, user?.id || null, user?.nome || null]
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

    const { rows } = await sinergia_pool.query(query, params);

    // Se não for admin, aplica filtro adicional em memória para regional/seccional/gestor
    if (!userIsAdmin(user)) {
        const ids = [...new Set(rows.map(r => r.agent_id).filter(Boolean).map(normalizeAgentId))];
        if (ids.length > 0) {
            const colabFilter = getColaboradoresFilter(user);
            let colabQuery = `SELECT "ID", "regional", "seccional", "GESTOR IMEDIATO" FROM colaboradores WHERE TRIM(UPPER("ID")) = ANY($1)`;
            const { rows: colabRows } = await sinergia_pool.query(colabQuery, [ids]);

            const allowedMap = new Map();
            colabRows.forEach(c => {
                const agentData = {
                    id: c['ID'],
                    regional: c['regional'],
                    seccional: c['seccional'],
                    gestor: c['GESTOR IMEDIATO']
                };
                allowedMap.set(normalizeAgentId(c['ID']), checkAgentPermission(agentData, user));
            });

            return rows.filter(r => allowedMap.get(normalizeAgentId(r.agent_id)) !== false);
        }
    }

    return rows;
}

async function deletePinById(id) {
    await sinergia_pool.query('DELETE FROM app_pins WHERE id = $1', [id]);
}

async function findValidPin(agentId, pin) {
    const normalizedId = normalizeAgentId(agentId);
    const { rows } = await sinergia_pool.query(
        'SELECT * FROM app_pins WHERE upper(agent_id) = $1 AND pin = $2 AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP',
        [normalizedId, pin]
    );
    return rows[0] || null;
}

async function markPinAsUsed(pinId) {
    await sinergia_pool.query(
        'UPDATE app_pins SET used_at = CURRENT_TIMESTAMP WHERE id = $1',
        [pinId]
    );
}

async function generateBulkPins(agentIds) {
    const results = [];
    for (const rawId of agentIds) {
        const id = normalizeAgentId(rawId);
        try {
            const agent = await findAgentById(id);
            if (!agent) {
                results.push({ agent_id: id, error: 'Agente não encontrado' });
                continue;
            }
            await invalidateExistingPins(agent.id);
            await invalidateAgentSessions(agent.id);
            const pin = String(Math.floor(100000 + Math.random() * 900000));
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
            await createPin(agent.id, pin, expiresAt);
            results.push({ agent_id: agent.id, agent_nome: agent.nome, pin, expires_at: expiresAt.toISOString() });
        } catch (e) {
            results.push({ agent_id: id, error: e.message });
        }
    }
    return results;
}

async function getSessionHistory(agentId) {
    const normalizedId = normalizeAgentId(agentId);
    
    // Historico de login pins
    const { rows: loginPins } = await sinergia_pool.query(
        `SELECT id, 'login_pin' as type, pin, created_at, created_by_name as author_name
         FROM app_pins 
         WHERE upper(agent_id) = $1`,
        [normalizedId]
    );

    // Historico de logout pins
    const { rows: logoutPins } = await sinergia_pool.query(
        `SELECT id, 'logout_pin' as type, pin, created_at, created_by_name as author_name
         FROM app_logout_pins 
         WHERE upper(agent_id) = $1`,
        [normalizedId]
    );

    // Historico de invalidação
    const { rows: invalidations } = await sinergia_pool.query(
        `SELECT id, 'invalidation' as type, null as pin, created_at, invalidated_by_name as author_name
         FROM session_invalidation_log 
         WHERE upper(agent_id) = $1`,
        [normalizedId]
    );

    const history = [...loginPins, ...logoutPins, ...invalidations];
    
    // Sort by created_at desc
    history.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    return history;
}

module.exports = {
    findAgentById,
    invalidateExistingPins,
    invalidateAgentSessions,
    createPin,
    listPins,
    deletePinById,
    findValidPin,
    markPinAsUsed,
    generateBulkPins,
    getSessionHistory,
};
