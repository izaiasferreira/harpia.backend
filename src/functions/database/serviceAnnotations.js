const { cenos_pool } = require('../../db');
const { serviceAnnotationCreateSchema } = require('../../db/schemas/serviceAnnotations');
const { userIsAdmin, getColaboradoresFilter, checkAgentPermission } = require('./admin');

// ─── Agent: criar anotação de serviço ─────────────────────────────────────────

async function create_service_annotation(data) {
    const { autor, estado, seccional, regional, ...rest } = data;
    const validated = serviceAnnotationCreateSchema.parse(rest);
    const { tipo, identificacao_tipo, identificacao_valor, descricao, foto, latitude, longitude, expires_at } = validated;

    // Garante que o autor exista na tabela login para satisfazer a FK
    // (agentes já existem; admins/imports criam a linha sob demanda — no-op para agentes)
    await cenos_pool.query(
        'INSERT INTO login (id, estado) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
        [String(autor).slice(0, 50), (estado || 'pi').toLowerCase()]
    );

    const query = `
        INSERT INTO service_annotations (
            autor, tipo, identificacao_tipo, identificacao_valor, descricao, 
            latitude, longitude, estado, seccional, regional, foto, expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
    `;
    const { rows } = await cenos_pool.query(query, [
        autor, 
        tipo, 
        identificacao_tipo || null, 
        identificacao_valor || null, 
        descricao, 
        latitude || null, 
        longitude || null, 
        estado || 'pi', 
        seccional || null, 
        regional || null, 
        foto || null,
        expires_at || null
    ]);
    return rows[0];
}

// ─── Agent: obter anotações criadas pelo próprio agente ──────────────────────

async function get_service_annotations_by_agent(autor) {
    const query = `
        SELECT sa.*, 
               COALESCE(c."Nome", l.id) as agent_nome
        FROM service_annotations sa
        LEFT JOIN login l ON l.id = sa.autor
        LEFT JOIN colaboradores c ON c."ID" = sa.autor
        WHERE sa.autor = $1
        ORDER BY sa.created_at DESC
    `;
    const { rows } = await cenos_pool.query(query, [autor]);
    return rows;
}

// ─── Agent: obter anotações para proximidade no estado/seccional ─────────────

async function get_service_annotations_for_agent_state(estado, seccional = null) {
    const conditions = ['sa.estado = $1'];
    const params = [estado.toLowerCase()];

    if (seccional) {
        conditions.push('(sa.seccional IS NULL OR UPPER(sa.seccional) = UPPER($2))');
        params.push(seccional);
    }

    // Anotações expiradas ou arquivadas não aparecem mais para os agentes
    conditions.push('(sa.expires_at IS NULL OR sa.expires_at > NOW())');
    conditions.push('sa.arquivada = FALSE');

    const query = `
        SELECT sa.*, 
               COALESCE(c."Nome", l.id) as agent_nome
        FROM service_annotations sa
        LEFT JOIN login l ON l.id = sa.autor
        LEFT JOIN colaboradores c ON c."ID" = sa.autor
        WHERE ${conditions.join(' AND ')}
        ORDER BY sa.created_at DESC
    `;
    const { rows } = await cenos_pool.query(query, params);
    return rows;
}

// ─── Admin: listar anotações com suporte a permissão escopada ─────────────────

async function get_service_annotations_admin({ user, estado, status, search, page = 1, limit = 50 }) {
    const conditions = ['1=1'];
    const params = [];
    let paramIdx = 1;

    // Aplica filtro de permissão baseado no usuário
    if (!userIsAdmin(user)) {
        const colabFilter = getColaboradoresFilter(user, { includeAllStates: true });
        if (colabFilter.allowedStates.length > 0) {
            conditions.push(`sa.estado = ANY($${paramIdx++})`);
            params.push(colabFilter.allowedStates);
        }
    }

    if (estado) {
        conditions.push(`sa.estado = $${paramIdx++}`);
        params.push(estado.toLowerCase());
    }

    if (status === 'pendente') {
        conditions.push('sa.resolvido = FALSE AND sa.arquivada = FALSE');
    } else if (status === 'tratado') {
        conditions.push('sa.resolvido = TRUE AND sa.arquivada = FALSE');
    } else if (status === 'arquivada') {
        conditions.push('sa.arquivada = TRUE');
    }

    if (search) {
        conditions.push(`(
            sa.tipo ILIKE $${paramIdx} OR
            COALESCE(sa.identificacao_tipo, '') ILIKE $${paramIdx} OR
            COALESCE(sa.identificacao_valor, '') ILIKE $${paramIdx} OR
            COALESCE(sa.descricao, '') ILIKE $${paramIdx} OR
            COALESCE(sa.descricao_solucao, '') ILIKE $${paramIdx}
        )`);
        params.push(`%${search}%`);
        paramIdx++;
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const whereClause = conditions.join(' AND ');

    const countQuery = `
        SELECT COUNT(*) as total
        FROM service_annotations sa
        LEFT JOIN login l ON l.id = sa.autor
        WHERE ${whereClause}
    `;
    const { rows: countRows } = await cenos_pool.query(countQuery, params);
    const total = parseInt(countRows[0]?.total || 0);

    let dataQuery = `
        SELECT sa.*,
               l.estado as agent_estado,
               c."Nome" as agent_nome,
               c."regional" as agent_regional,
               c."seccional" as agent_seccional
        FROM service_annotations sa
        LEFT JOIN login l ON l.id = sa.autor
        LEFT JOIN colaboradores c ON c."ID" = sa.autor
        WHERE ${whereClause}
        ORDER BY sa.created_at DESC
        LIMIT $${paramIdx++} OFFSET $${paramIdx}
    `;
    const { rows } = await cenos_pool.query(dataQuery, [...params, parseInt(limit), offset]);

    if (!userIsAdmin(user)) {
        const filteredRows = rows.filter(r => {
            const agentData = {
                id: r.autor,
                nome: r.agent_nome,
                regional: r.agent_regional,
                seccional: r.agent_seccional,
                estado: r.agent_estado
            };
            return checkAgentPermission(agentData, user);
        });
        return { annotations: filteredRows, total: filteredRows.length, page: parseInt(page), limit: parseInt(limit) };
    }

    return { annotations: rows, total, page: parseInt(page), limit: parseInt(limit) };
}

// ─── Admin: obter anotação por ID ─────────────────────────────────────────────

async function get_service_annotation_by_id(id) {
    const query = `
        SELECT sa.*,
               l.estado as agent_estado,
               c."Nome" as agent_nome,
               c."regional" as agent_regional,
               c."seccional" as agent_seccional
        FROM service_annotations sa
        LEFT JOIN login l ON l.id = sa.autor
        LEFT JOIN colaboradores c ON c."ID" = sa.autor
        WHERE sa.id = $1
    `;
    const { rows } = await cenos_pool.query(query, [id]);
    if (rows.length === 0) return null;

    const annotation = rows[0];

    // Buscar evidências
    const { rows: evidencias } = await cenos_pool.query(
        'SELECT * FROM service_annotation_evidencias WHERE annotation_id = $1 ORDER BY created_at ASC',
        [id]
    );

    return { ...annotation, evidencias };
}

// ─── Admin: resolver anotação ──────────────────────────────────────────────────

async function resolve_service_annotation({ id, resolvido_por, resolvido_por_nome, descricao_solucao, evidencias = [] }) {
    const query = `
        UPDATE service_annotations
        SET resolvido = TRUE,
            resolvido_por = $1,
            resolvido_por_nome = $2,
            resolvido_em = NOW(),
            descricao_solucao = $3
        WHERE id = $4
        RETURNING *
    `;
    const { rows } = await cenos_pool.query(query, [resolvido_por, resolvido_por_nome, descricao_solucao, id]);
    if (rows.length === 0) return null;

    const annotation = rows[0];

    // Salvar evidências se houver
    for (const ev of evidencias) {
        await cenos_pool.query(
            'INSERT INTO service_annotation_evidencias (annotation_id, nome_arquivo, tipo, caminho) VALUES ($1, $2, $3, $4)',
            [id, ev.nome_arquivo || 'evidencia', ev.tipo || 'imagem', ev.caminho]
        );
    }

    return get_service_annotation_by_id(id);
}

// ─── Admin: reabrir anotação ──────────────────────────────────────────────────

async function reopen_service_annotation(id) {
    const query = `
        UPDATE service_annotations
        SET resolvido = FALSE,
            resolvido_por = NULL,
            resolvido_por_nome = NULL,
            resolvido_em = NULL,
            descricao_solucao = NULL
        WHERE id = $1
        RETURNING *
    `;
    const { rows } = await cenos_pool.query(query, [id]);
    if (rows.length === 0) return null;

    // Remover evidências
    await cenos_pool.query('DELETE FROM service_annotation_evidencias WHERE annotation_id = $1', [id]);

    return rows[0];
}

// ─── Admin: excluir anotação ──────────────────────────────────────────────────

async function delete_service_annotation(id) {
    const { rows } = await cenos_pool.query('DELETE FROM service_annotations WHERE id = $1 RETURNING *', [id]);
    return rows[0];
}

// ─── Admin: arquivar anotação (some do app dos agentes, mantém no admin) ──────

async function archive_service_annotation(id) {
    const { rows } = await cenos_pool.query(
        'UPDATE service_annotations SET arquivada = TRUE WHERE id = $1 RETURNING *',
        [id]
    );
    return rows[0];
}

// ─── Admin: desarquivar anotação ───────────────────────────────────────────────

async function unarchive_service_annotation(id) {
    const { rows } = await cenos_pool.query(
        'UPDATE service_annotations SET arquivada = FALSE WHERE id = $1 RETURNING *',
        [id]
    );
    return rows[0];
}

module.exports = {
    create_service_annotation,
    get_service_annotations_by_agent,
    get_service_annotations_for_agent_state,
    get_service_annotations_admin,
    get_service_annotation_by_id,
    resolve_service_annotation,
    reopen_service_annotation,
    delete_service_annotation,
    archive_service_annotation,
    unarchive_service_annotation,
};
