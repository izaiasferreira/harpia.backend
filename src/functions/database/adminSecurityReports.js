const { cenos_pool, pi_pool, ma_pool } = require('../../db');
const { securityReportCreateSchema } = require('../../db/schemas/security');
const { get_users_agents_admin } = require('./admin');

const userIsAdmin = (user) => {
    if (!user || !user.role) return false;
    return user.role.toLowerCase().includes('admin');
}

const getUserAllowedStatePools = (user) => {
    if (!user) return [];

    const isMainAdmin = userIsAdmin(user);
    const userFilters = user?.permissions?.map(p => p.filters).flat() || [];
    const statesFilters = userFilters.filter(f => f.type === 'estado').map(f => f.value.toLowerCase());

    const available = [];
    if (isMainAdmin || statesFilters.includes('pi')) available.push({ state: 'pi', pool: pi_pool });
    if (isMainAdmin || statesFilters.includes('ma')) available.push({ state: 'ma', pool: ma_pool });
    return available;
};

async function get_security_reports_admin({ user, estado, page = 1, limit = 9999, search }) {
    const availablePools = getUserAllowedStatePools(user).map(p => p.state);
    const pool = cenos_pool;

    const limitVal = parseInt(limit) || 9999;
    const offsetVal = (parseInt(page) - 1) * limitVal;

    const dataParams = [];
    const countParams = [];
    let dataParamIdx = 1;
    let countParamIdx = 1;

    let dataQuery = `SELECT * FROM security_report WHERE created_at >= NOW() - INTERVAL '3 months'`;
    let countQuery = `SELECT COUNT(*) AS total FROM security_report WHERE created_at >= NOW() - INTERVAL '3 months'`;

    // Se não for admin global, filtra pelos estados permitidos
    if (!userIsAdmin(user)) {
        dataQuery += ` AND estado = ANY($${dataParamIdx})`;
        countQuery += ` AND estado = ANY($${countParamIdx})`;
        dataParams.push(availablePools);
        countParams.push(availablePools);
        dataParamIdx++;
        countParamIdx++;
    }

    if (estado) {
        dataQuery += ` AND estado = $${dataParamIdx}`;
        countQuery += ` AND estado = $${countParamIdx}`;
        dataParams.push(estado.toLowerCase());
        countParams.push(estado.toLowerCase());
        dataParamIdx++;
        countParamIdx++;
    }

    if (search) {
        dataQuery += ` AND (autor ILIKE $${dataParamIdx} OR motivo ILIKE $${dataParamIdx} OR observacao ILIKE $${dataParamIdx})`;
        countQuery += ` AND (autor ILIKE $${countParamIdx} OR motivo ILIKE $${countParamIdx} OR observacao ILIKE $${countParamIdx})`;
        dataParams.push(`%${search}%`);
        countParams.push(`%${search}%`);
        dataParamIdx++;
        countParamIdx++;
    }

    // Apply LIMIT/OFFSET directly in SQL
    dataQuery += ` ORDER BY created_at DESC LIMIT $${dataParamIdx} OFFSET $${dataParamIdx + 1}`;
    dataParams.push(limitVal, offsetVal);

    // Run data and count queries in parallel
    const [{ rows }, { rows: countRows }] = await Promise.all([
        pool.query(dataQuery, dataParams),
        pool.query(countQuery, countParams)
    ]);

    const total = parseInt(countRows[0]?.total) || 0;
    const totalPages = Math.ceil(total / limitVal);

    // Complementar com dados do agente para exibição completa no admin
    const agents = await get_users_agents_admin({ user });

    let result = rows.map(r => {
        const agent = agents.find(a => a.id?.toUpperCase() === r.autor?.toUpperCase());
        // Se o estado estiver nulo (registros antigos dos agentes), tentamos inferir do agente
        if (!r.estado && agent) {
            r.estado = agent.estado;
        }
        return { ...agent, ...r };
    });

    // Caso o registro não tenha estado e não conseguimos inferir, e o usuário não for admin global,
    // removemos se o estado inferido não estiver nos permitidos.
    if (!userIsAdmin(user)) {
        result = result.filter(r => availablePools.includes(r.estado));
    }

    return {
        data: result,
        total,
        page: parseInt(page),
        limit: limitVal,
        totalPages
    };
}

async function delete_security_report_admin(id, user) {
    const pool = cenos_pool;
    const reportId = parseInt(id, 10);
    if (isNaN(reportId)) return null;
    
    // Antes de deletar, verificamos a permissão de estado
    const { rows: existing } = await pool.query('SELECT * FROM security_report WHERE id = $1', [reportId]);
    if (existing.length === 0) return null;

    const report = existing[0];
    const allowedPools = getUserAllowedStatePools(user).map(p => p.state);

    if (!userIsAdmin(user) && report.estado && !allowedPools.includes(report.estado)) {
        throw new Error('Você não tem permissão para deletar relatórios deste estado');
    }

    const { rows } = await pool.query('DELETE FROM security_report WHERE id = $1 RETURNING *', [reportId]);
    return rows[0];
}

module.exports = {
    get_security_reports_admin,
    delete_security_report_admin
};
