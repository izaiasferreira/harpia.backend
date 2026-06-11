const { cenos_pool, pi_pool, ma_pool } = require('../../db');
const { resolverSchema } = require('../../db/schemas/securityValidation');

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
    if (isMainAdmin || statesFilters.includes('pi')) available.push('pi');
    if (isMainAdmin || statesFilters.includes('ma')) available.push('ma');
    return available;
};

async function resolve_security_report({ id, user, descricao_solucao }) {
    const pool = cenos_pool;
    const reportId = parseInt(id, 10);
    if (isNaN(reportId)) throw new Error('ID inválido');

    const { rows: existing } = await pool.query('SELECT * FROM security_report WHERE id = $1', [reportId]);
    if (existing.length === 0) throw new Error('Relatório não encontrado');

    const report = existing[0];
    const allowedPools = getUserAllowedStatePools(user);

    if (!userIsAdmin(user) && report.estado && !allowedPools.includes(report.estado)) {
        throw new Error('Você não tem permissão para resolver relatórios deste estado');
    }

    resolverSchema.parse({ descricao_solucao });

    const resolvidoPorNome = user.nome || user.email || String(user.id);
    const { rows } = await pool.query(`
        UPDATE security_report
        SET resolvido = TRUE,
            resolvido_por = $1,
            resolvido_por_nome = $2,
            resolvido_em = NOW(),
            descricao_solucao = $3
        WHERE id = $4
        RETURNING *
    `, [user.id, resolvidoPorNome, descricao_solucao, reportId]);

    return rows[0];
}

async function reabrir_security_report({ id, user }) {
    const pool = cenos_pool;
    const reportId = parseInt(id, 10);
    if (isNaN(reportId)) throw new Error('ID inválido');

    const { rows: existing } = await pool.query('SELECT * FROM security_report WHERE id = $1', [reportId]);
    if (existing.length === 0) throw new Error('Relatório não encontrado');

    const report = existing[0];
    const allowedPools = getUserAllowedStatePools(user);

    if (!userIsAdmin(user) && report.estado && !allowedPools.includes(report.estado)) {
        throw new Error('Você não tem permissão para reabrir relatórios deste estado');
    }

    const { rows } = await pool.query(`
        UPDATE security_report
        SET resolvido = FALSE,
            resolvido_por = NULL,
            resolvido_por_nome = NULL,
            resolvido_em = NULL,
            descricao_solucao = NULL
        WHERE id = $1
        RETURNING *
    `, [reportId]);

    return rows[0];
}

async function add_evidencia({ report_id, nome_arquivo, tipo, caminho }) {
    const pool = cenos_pool;
    const { rows } = await pool.query(`
        INSERT INTO security_report_evidencias (report_id, nome_arquivo, tipo, caminho)
        VALUES ($1, $2, $3, $4)
        RETURNING *
    `, [report_id, nome_arquivo, tipo, caminho]);
    return rows[0];
}

async function get_evidencias(report_id) {
    const pool = cenos_pool;
    const { rows } = await pool.query(`
        SELECT * FROM security_report_evidencias
        WHERE report_id = $1
        ORDER BY created_at DESC
    `, [report_id]);
    return rows;
}

async function get_dashboard_stats({ user, estado }) {
    const pool = cenos_pool;
    const allowedPools = getUserAllowedStatePools(user);

    let whereClause = '';
    const params = [];
    let paramIdx = 1;

    if (!userIsAdmin(user)) {
        whereClause += ` AND estado = ANY($${paramIdx})`;
        params.push(allowedPools);
        paramIdx++;
    }

    if (estado) {
        whereClause += ` AND estado = $${paramIdx}`;
        params.push(estado.toLowerCase());
        paramIdx++;
    }

    const dateFilter = ` AND created_at >= NOW() - INTERVAL '3 months'`;

    const [totalRes, resolvedRes, byHazardRes, byAgentRes, monthlyTrendRes] = await Promise.all([
        pool.query(`SELECT COUNT(*) FROM security_report WHERE 1=1${dateFilter}${whereClause}`, params),
        pool.query(`SELECT COUNT(*) FILTER (WHERE resolvido = TRUE) AS resolvidos, COUNT(*) FILTER (WHERE resolvido = FALSE OR resolvido IS NULL) AS pendentes FROM security_report WHERE 1=1${dateFilter}${whereClause}`, params),
        pool.query(`SELECT motivo, COUNT(*) FROM security_report WHERE 1=1${dateFilter}${whereClause} GROUP BY motivo ORDER BY COUNT(*) DESC`, params),
        pool.query(`SELECT autor, COUNT(*) FROM security_report WHERE 1=1${dateFilter}${whereClause} GROUP BY autor ORDER BY COUNT(*) DESC LIMIT 10`, params),
        pool.query(`SELECT DATE_TRUNC('month', created_at) AS mes, COUNT(*) FROM security_report WHERE 1=1${dateFilter}${whereClause} GROUP BY mes ORDER BY mes`, params),
    ]);

    const total = parseInt(totalRes.rows[0]?.count) || 0;
    const resolvidos = parseInt(resolvedRes.rows[0]?.resolvidos) || 0;
    const pendentes = parseInt(resolvedRes.rows[0]?.pendentes) || 0;

    return {
        total,
        resolvidos,
        pendentes,
        taxaResolucao: total > 0 ? Math.round((resolvidos / total) * 100) : 0,
        porTipo: byHazardRes.rows,
        porAgente: byAgentRes.rows,
        tendenciaMensal: monthlyTrendRes.rows.map(r => ({
            mes: r.mes,
            total: parseInt(r.count),
        })),
    };
}

module.exports = {
    resolve_security_report,
    reabrir_security_report,
    add_evidencia,
    get_evidencias,
    get_dashboard_stats,
};
