const { sinergia_pool } = require('../../db');
const { logoutPinCreateSchema } = require('../../db/schemas/appLogoutPins');
const { findAgentById } = require('./appPins');
const { getColaboradoresFilter, userIsAdmin, checkAgentPermission } = require('./admin');
const { normalizeAgentId } = require('../../utils/agentNormalize');

async function invalidateExistingLogoutPins(agentId) {
    const normalizedId = normalizeAgentId(agentId);
    await sinergia_pool.query(
        'UPDATE app_logout_pins SET expires_at = CURRENT_TIMESTAMP WHERE upper(agent_id) = $1 AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP',
        [normalizedId]
    );
}

async function createLogoutPin(agentId, pin, expiresAt, user) {
    const validated = logoutPinCreateSchema.parse({ agent_id: agentId, pin, expires_at: expiresAt });
    const normalizedId = normalizeAgentId(validated.agent_id);
    await sinergia_pool.query(
        'INSERT INTO app_logout_pins (agent_id, pin, expires_at, created_by_id, created_by_name) VALUES ($1, $2, $3, $4, $5)',
        [normalizedId, validated.pin, validated.expires_at, user?.id || null, user?.nome || null]
    );
}

async function findValidLogoutPin(agentId, pin) {
    const normalizedId = normalizeAgentId(agentId);
    const { rows } = await sinergia_pool.query(
        'SELECT * FROM app_logout_pins WHERE upper(agent_id) = $1 AND pin = $2 AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP',
        [normalizedId, pin]
    );
    return rows[0] || null;
}

async function markLogoutPinAsUsed(pinId) {
    await sinergia_pool.query(
        'UPDATE app_logout_pins SET used_at = CURRENT_TIMESTAMP WHERE id = $1',
        [pinId]
    );
}

async function listLogoutPins(limit = 50, user = null) {
    if (!user) return [];

    let query = `
        SELECT alp.*, c."Nome" as agent_nome, c.estado as agent_estado
        FROM app_logout_pins alp
        LEFT JOIN colaboradores c ON upper(c."ID") = upper(alp.agent_id)
        WHERE 1=1
    `;
    let params = [];
    let paramIndex = 1;

    if (!userIsAdmin(user)) {
        const colabFilter = getColaboradoresFilter(user, { includeAllStates: true });
        if (colabFilter.allowedStates.length > 0) {
            query += ` AND c.estado = ANY($${paramIndex})`;
            params.push(colabFilter.allowedStates);
            paramIndex++;
        }
    }

    query += ` ORDER BY alp.created_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const { rows } = await sinergia_pool.query(query, params);

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

module.exports = {
    findAgentById,
    invalidateExistingLogoutPins,
    createLogoutPin,
    findValidLogoutPin,
    markLogoutPinAsUsed,
    listLogoutPins,
};
