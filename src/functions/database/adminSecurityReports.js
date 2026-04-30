const { cenos_pool, pi_pool, ma_pool } = require('../../db');
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

async function ensureSecurityReportTable() {
    const pool = cenos_pool;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS security_report (
            id SERIAL PRIMARY KEY,
            autor TEXT NOT NULL,
            motivo TEXT NOT NULL,
            observacao TEXT,
            latitude TEXT,
            longitude TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    // Add estado column if it doesn't exist
    await pool.query(`
        ALTER TABLE security_report 
        ADD COLUMN IF NOT EXISTS estado TEXT;
    `).catch(() => { });
}

async function get_security_reports_admin({ user, estado, page = 1, limit = 9999, search }) {
    await ensureSecurityReportTable();
    const availablePools = getUserAllowedStatePools(user).map(p => p.state);
    const pool = cenos_pool;

    let query = `SELECT * FROM security_report WHERE created_at >= NOW() - INTERVAL '3 months'`;
    const params = [];
    let paramIndex = 1;

    // Se não for admin global, filtra pelos estados permitidos
    if (!userIsAdmin(user)) {
        query += ` AND estado = ANY($${paramIndex})`;
        params.push(availablePools);
        paramIndex++;
    }

    if (estado) {
        query += ` AND estado = $${paramIndex}`;
        params.push(estado.toLowerCase());
        paramIndex++;
    }

    if (search) {
        query += ` AND (autor ILIKE $${paramIndex} OR motivo ILIKE $${paramIndex} OR observacao ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
    }

    query += ` ORDER BY created_at DESC`;

    const { rows } = await pool.query(query, params);

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

    // Paginação em memória
    const limitVal = parseInt(limit) || 9999;
    const offsetVal = (parseInt(page) - 1) * limitVal;
    
    return {
        data: result.slice(offsetVal, offsetVal + limitVal),
        total: result.length,
        page: parseInt(page),
        limit: limitVal,
        totalPages: Math.ceil(result.length / limitVal)
    };
}

async function create_security_report_admin({ autor, motivo, observacao, latitude, longitude, estado }) {
    await ensureSecurityReportTable();
    const pool = cenos_pool;
    const query = `
        INSERT INTO security_report (autor, motivo, observacao, latitude, longitude, estado)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
    `;
    const { rows } = await pool.query(query, [autor?.toUpperCase(), motivo, observacao, latitude, longitude, estado?.toLowerCase()]);
    return rows[0];
}

async function delete_security_report_admin(id, user) {
    await ensureSecurityReportTable();
    const pool = cenos_pool;
    
    // Antes de deletar, verificamos a permissão de estado
    const { rows: existing } = await pool.query('SELECT * FROM security_report WHERE id = $1', [id]);
    if (existing.length === 0) return null;

    const report = existing[0];
    const allowedPools = getUserAllowedStatePools(user).map(p => p.state);

    if (!userIsAdmin(user) && report.estado && !allowedPools.includes(report.estado)) {
        throw new Error('Você não tem permissão para deletar relatórios deste estado');
    }

    const { rows } = await pool.query('DELETE FROM security_report WHERE id = $1 RETURNING *', [id]);
    return rows[0];
}

module.exports = {
    get_security_reports_admin,
    create_security_report_admin,
    delete_security_report_admin
};
