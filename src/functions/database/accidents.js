const { cenos_pool } = require('../../db');
const { accidentCreateSchema } = require('../../db/schemas/accidents');

// ─── Agent: criar acidente ────────────────────────────────────────────────────

async function create_accident(data) {
    const { autor, estado, ...rest } = data;
    const validated = accidentCreateSchema.parse(rest);
    const { tipo, descricao, latitude, longitude } = validated;
    const query = `
        INSERT INTO accidents (autor, tipo, descricao, latitude, longitude, estado)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
    `;
    const { rows } = await cenos_pool.query(query, [
        autor, tipo, descricao || null, latitude || null, longitude || null, estado || 'pi'
    ]);
    return rows[0];
}

// ─── Agent: listar acidentes do agente ───────────────────────────────────────

async function get_accidents_by_agent(autor) {
    const query = `
        SELECT a.*,
               l.estado as agent_estado,
               c."Nome" as agent_nome
        FROM accidents a
        LEFT JOIN login l ON l.id = a.autor
        LEFT JOIN colaboradores c ON c."ID" = a.autor
        WHERE a.autor = $1
        ORDER BY a.created_at DESC
    `;
    const { rows } = await cenos_pool.query(query, [autor]);
    return rows;
}

// ─── Admin: listar todos os acidentes ─────────────────────────────────────────

async function get_accidents_admin({ user, estado, status, search, page = 1, limit = 50 }) {
    const conditions = ['1=1'];
    const params = [];
    let paramIdx = 1;

    if (estado) {
        conditions.push(`a.estado = $${paramIdx++}`);
        params.push(estado.toLowerCase());
    }

    if (status === 'pendente') {
        conditions.push('a.resolvido = FALSE');
    } else if (status === 'tratado') {
        conditions.push('a.resolvido = TRUE');
    }

    if (search) {
        conditions.push(`(
            a.tipo ILIKE $${paramIdx} OR
            COALESCE(a.descricao, '') ILIKE $${paramIdx} OR
            COALESCE(a.descricao_solucao, '') ILIKE $${paramIdx}
        )`);
        params.push(`%${search}%`);
        paramIdx++;
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const whereClause = conditions.join(' AND ');

    const countQuery = `
        SELECT COUNT(*) as total
        FROM accidents a
        LEFT JOIN login l ON l.id = a.autor
        WHERE ${whereClause}
    `;
    const { rows: countRows } = await cenos_pool.query(countQuery, params);
    const total = parseInt(countRows[0]?.total || 0);

    const dataQuery = `
        SELECT a.*,
               l.estado as agent_estado,
               c."Nome" as agent_nome
        FROM accidents a
        LEFT JOIN login l ON l.id = a.autor
        LEFT JOIN colaboradores c ON c."ID" = a.autor
        WHERE ${whereClause}
        ORDER BY a.created_at DESC
        LIMIT $${paramIdx++} OFFSET $${paramIdx}
    `;
    const { rows } = await cenos_pool.query(dataQuery, [...params, parseInt(limit), offset]);

    return { accidents: rows, total, page: parseInt(page), limit: parseInt(limit) };
}

// ─── Admin: resolver acidente ─────────────────────────────────────────────────

async function resolve_accident({ id, user, descricao_solucao }) {
    const query = `
        UPDATE accidents
        SET resolvido = TRUE,
            resolvido_por = $1,
            resolvido_por_nome = $2,
            resolvido_em = NOW(),
            descricao_solucao = $3
        WHERE id = $4
        RETURNING *
    `;
    const { rows } = await cenos_pool.query(query, [
        user.id,
        user.nome || user.name || user.login || user.id,
        descricao_solucao,
        id
    ]);
    return rows[0];
}

// ─── Admin: reabrir acidente ───────────────────────────────────────────────────

async function reopen_accident(id) {
    const query = `
        UPDATE accidents
        SET resolvido = FALSE,
            resolvido_por = NULL,
            resolvido_por_nome = NULL,
            resolvido_em = NULL,
            descricao_solucao = NULL
        WHERE id = $1
        RETURNING *
    `;
    const { rows } = await cenos_pool.query(query, [id]);
    return rows[0];
}

// ─── Admin: adicionar evidência ────────────────────────────────────────────────

async function add_accident_evidencia({ accident_id, nome_arquivo, tipo, caminho }) {
    const query = `
        INSERT INTO accident_evidencias (accident_id, nome_arquivo, tipo, caminho)
        VALUES ($1, $2, $3, $4)
        RETURNING *
    `;
    const { rows } = await cenos_pool.query(query, [accident_id, nome_arquivo, tipo, caminho]);
    return rows[0];
}

// ─── Admin: listar evidências ───────────────────────────────────────────────────

async function get_accident_evidencias(accident_id) {
    const query = `
        SELECT * FROM accident_evidencias
        WHERE accident_id = $1
        ORDER BY created_at ASC
    `;
    const { rows } = await cenos_pool.query(query, [accident_id]);
    return rows;
}

// ─── Admin: obter um acidente por ID ──────────────────────────────────────────

async function get_accident_by_id(id) {
    const query = `
        SELECT a.*,
               l.estado as agent_estado,
               c."Nome" as agent_nome
        FROM accidents a
        LEFT JOIN login l ON l.id = a.autor
        LEFT JOIN colaboradores c ON c."ID" = a.autor
        WHERE a.id = $1
    `;
    const { rows } = await cenos_pool.query(query, [id]);
    return rows[0] || null;
}

module.exports = {
    create_accident,
    get_accidents_by_agent,
    get_accidents_admin,
    resolve_accident,
    reopen_accident,
    add_accident_evidencia,
    get_accident_evidencias,
    get_accident_by_id,
};
