const { cenos_pool } = require('../../db');
const { equipmentCreateSchema, equipmentUpdateSchema } = require('../../db/schemas/equipment');
const { validateDados, EQUIPMENT_TIPO_IDS, EQUIPMENT_STATUS, EQUIPMENT_CONDICAO } = require('../../constants/equipmentTypes');
const { minioClient, CONFIG, compressImage, getFileUrl } = require('../minio');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EQUIPMENT_SELECT = `
    e.id, e.tipo, e.estado, e.regional, e.seccional, e.dados, e.status, e.condicao, e.fotos,
    e.criado_por, e.created_at, e.updated_at,
    ea.agente            AS agente_atual,
    ea.id                AS assignment_id,
    ea.data_associacao   AS data_associacao,
    ea.assignado_por     AS assignado_por,
    ea.assignado_por_nome AS assignado_por_nome
`;

// ─── Upload de foto (MinIO) ───────────────────────────────────────────────────

async function uploadEquipmentPhoto(buffer, mimeType, prefix = 'equipment') {
    const ext = mimeType.includes('png') ? 'png' : 'jpg';
    const objectName = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const compressed = await compressImage(buffer, mimeType);
    await minioClient.putObject(CONFIG.bucket, objectName, compressed, { 'Content-Type': mimeType });
    return getFileUrl(objectName);
}

async function log_equipment_event(client_or_pool, { equipment_id, event_type, agente, actor_id, actor_nome, changes, metadata }) {
    await client_or_pool.query(`
        INSERT INTO equipment_events (equipment_id, event_type, agente, actor_id, actor_nome, changes, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
        equipment_id,
        event_type,
        agente || null,
        actor_id || null,
        actor_nome || null,
        changes ? JSON.stringify(changes) : null,
        metadata ? JSON.stringify(metadata) : null
    ]);
}

// ─── Listagem ─────────────────────────────────────────────────────────────────

async function list_equipment({ estado, regional, seccional, tipo, status, condicao, search, page = 1, limit = 15, userRole, userPermissions = [] } = {}) {
    const pool = cenos_pool;
    const params = [];
    let paramIdx = 1;

    let query = `
        SELECT ${EQUIPMENT_SELECT}, c."Nome" as agente_nome
        FROM equipment e
        LEFT JOIN equipment_assignments ea
            ON ea.equipment_id = e.id AND ea.status = 'ativa'
        LEFT JOIN colaboradores c
            ON LOWER(c."ID") = LOWER(ea.agente)
        WHERE 1=1
    `;

    if (userRole !== 'COMPANY_ADMIN') {
        if (userPermissions && userPermissions.length > 0) {
            const permConditions = [];
            userPermissions.forEach(perm => {
                const filters = perm.filters || [];
                const permEstado = filters.find(f => f.type === 'estado')?.value;
                const permRegional = filters.find(f => f.type === 'regional')?.value;
                const permSeccional = filters.find(f => f.type === 'seccional')?.value;

                if (permEstado) {
                    let cond = `(e.estado = $${paramIdx++}`;
                    params.push(permEstado.toLowerCase());
                    
                    if (permRegional) {
                        cond += ` AND (e.regional = $${paramIdx++} OR e.regional IS NULL)`;
                        params.push(permRegional);
                    }
                    if (permSeccional) {
                        cond += ` AND (e.seccional = $${paramIdx++} OR e.seccional IS NULL)`;
                        params.push(permSeccional);
                    }
                    cond += `)`;
                    permConditions.push(cond);
                }
            });

            if (permConditions.length > 0) {
                query += ` AND (${permConditions.join(' OR ')})`;
            } else {
                query += ` AND 1=0`; 
            }
        } else {
            query += ` AND 1=0`;
        }
    }

    if (estado) { query += ` AND e.estado = $${paramIdx++}`; params.push(estado.toLowerCase()); }
    if (regional) { query += ` AND e.regional = $${paramIdx++}`; params.push(regional); }
    if (seccional) { query += ` AND e.seccional = $${paramIdx++}`; params.push(seccional); }
    if (tipo)   { query += ` AND e.tipo = $${paramIdx++}`;   params.push(tipo.toLowerCase()); }
    if (status) { query += ` AND e.status = $${paramIdx++}`; params.push(status.toLowerCase()); }
    if (condicao) { query += ` AND e.condicao = $${paramIdx++}`; params.push(condicao.toLowerCase()); }

    if (search) {
        query += ` AND (
            e.dados::text ILIKE $${paramIdx} OR
            LOWER(ea.agente) LIKE $${paramIdx} OR
            LOWER(c."Nome") LIKE $${paramIdx}
        )`;
        params.push(`%${search.toLowerCase()}%`);
        paramIdx++;
    }

    // Count query
    const countQuery = `SELECT COUNT(*) AS total FROM (${query}) AS sub`;
    const { rows: [{ total: totalStr }] } = await pool.query(countQuery, params);
    const total = parseInt(totalStr);

    query += ` ORDER BY e.created_at DESC`;
    
    const limitVal = parseInt(limit) || 15;
    const offset = (parseInt(page) - 1) * limitVal;
    const totalPages = Math.max(1, Math.ceil(total / limitVal));

    query += ` LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(limitVal, offset);

    const { rows: data } = await pool.query(query, params);

    return { data, total, page: parseInt(page), limit: limitVal, totalPages };
}

async function get_equipment_stats() {
    const pool = cenos_pool;
    
    // Total geral
    const { rows: [{ total }] } = await pool.query(`SELECT COUNT(*)::int AS total FROM equipment`);
    
    // Status
    const { rows: statusRows } = await pool.query(`
        SELECT status, COUNT(*)::int AS count 
        FROM equipment 
        GROUP BY status
    `);
    
    // Tipo
    const { rows: tipoRows } = await pool.query(`
        SELECT tipo, COUNT(*)::int AS count 
        FROM equipment 
        GROUP BY tipo
    `);
    
    // Condicao
    const { rows: condicaoRows } = await pool.query(`
        SELECT condicao, COUNT(*)::int AS count 
        FROM equipment 
        GROUP BY condicao
    `);
    
    // Estado
    const { rows: estadoRows } = await pool.query(`
        SELECT estado, COUNT(*)::int AS count 
        FROM equipment 
        WHERE estado IS NOT NULL AND estado != ''
        GROUP BY estado
        ORDER BY count DESC
    `);
    
    return {
        total,
        status: statusRows.reduce((acc, row) => ({ ...acc, [row.status]: row.count }), {}),
        tipos: tipoRows.reduce((acc, row) => ({ ...acc, [row.tipo]: row.count }), {}),
        condicoes: condicaoRows.reduce((acc, row) => ({ ...acc, [row.condicao]: row.count }), {}),
        estados: estadoRows.reduce((acc, row) => ({ ...acc, [row.estado]: row.count }), {})
    };
}

async function get_equipment_by_id(id) {
    const pool = cenos_pool;
    const { rows } = await pool.query(`
        SELECT ${EQUIPMENT_SELECT}
        FROM equipment e
        LEFT JOIN equipment_assignments ea ON ea.equipment_id = e.id AND ea.status = 'ativa'
        WHERE e.id = $1
    `, [id]);
    return rows[0] || null;
}

async function get_equipment_by_agent(agente) {
    const pool = cenos_pool;
    const { rows } = await pool.query(`
        SELECT e.id, e.tipo, e.estado, e.dados, e.status, e.condicao, e.fotos,
               ea.id              AS assignment_id,
               ea.data_associacao AS data_associacao,
               ea.assignado_por   AS assignado_por,
               ea.status          AS assignment_status,
               pr.id              AS pending_return_request_id
        FROM equipment_assignments ea
        JOIN equipment e ON e.id = ea.equipment_id
        LEFT JOIN equipment_requests pr
            ON pr.equipment_id = e.id
           AND pr.agente = LOWER($1)
           AND pr.status = 'pendente'
           AND pr.tipo_solicitacao = 'devolucao'
        WHERE LOWER(ea.agente) = LOWER($1)
          AND ea.status = 'ativa'
        ORDER BY e.tipo, ea.data_associacao DESC
    `, [agente]);
    return rows;
}

async function list_available_equipment({ tipo, estado, search, page = 1, limit = 15 } = {}) {
    const pool = cenos_pool;
    const params = [];
    let paramIdx = 1;

    let query = `SELECT id, tipo, estado, regional, seccional, dados, condicao, status, fotos FROM equipment WHERE status = 'disponivel'`;

    if (tipo)   { query += ` AND tipo = $${paramIdx++}`;   params.push(tipo.toLowerCase()); }
    if (estado) { query += ` AND estado = $${paramIdx++}`; params.push(estado.toLowerCase()); }
    if (search) {
        query += ` AND dados::text ILIKE $${paramIdx++}`;
        params.push(`%${search}%`);
    }

    // Count query
    const countQuery = `SELECT COUNT(*) AS total FROM (${query}) AS sub`;
    const { rows: [{ total: totalStr }] } = await pool.query(countQuery, params);
    const total = parseInt(totalStr);

    query += ` ORDER BY tipo, created_at DESC`;

    const limitVal = parseInt(limit) || 15;
    const offset = (parseInt(page) - 1) * limitVal;
    const totalPages = Math.max(1, Math.ceil(total / limitVal));

    query += ` LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(limitVal, offset);

    const { rows: data } = await pool.query(query, params);

    return { data, total, page: parseInt(page), limit: limitVal, totalPages };
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

async function create_equipment(data) {
    const validated = equipmentCreateSchema.parse(data);

    // Valida campos obrigatórios do tipo
    const { valid, erros } = validateDados(validated.tipo, validated.dados);
    if (!valid) throw new Error(`Dados inválidos: ${erros.join('; ')}`);

    const pool = cenos_pool;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(`
            INSERT INTO equipment (tipo, estado, regional, seccional, dados, status, condicao, fotos, criado_por)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `, [
            validated.tipo,
            validated.estado,
            validated.regional || null,
            validated.seccional || null,
            JSON.stringify(validated.dados),
            validated.status,
            validated.condicao,
            JSON.stringify(validated.fotos || []),
            validated.criado_por || null,
        ]);
        
        await log_equipment_event(client, {
            equipment_id: rows[0].id,
            event_type: 'criacao',
            actor_id: validated.criado_por,
            changes: { tipo: validated.tipo, estado: validated.estado, regional: validated.regional, seccional: validated.seccional, status: validated.status, condicao: validated.condicao }
        });

        await client.query('COMMIT');
        return rows[0];
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

async function update_equipment(id, data) {
    const validated = equipmentUpdateSchema.parse(data);
    const pool = cenos_pool;

    const { rows: eqRows } = await pool.query(`SELECT * FROM equipment WHERE id = $1`, [id]);
    if (!eqRows[0]) throw new Error('Equipamento não encontrado');
    const eqData = eqRows[0];

    // Se enviou novos dados, valida os campos obrigatórios do tipo existente
    if (validated.dados) {
        const { valid, erros } = validateDados(eqData.tipo, validated.dados);
        if (!valid) throw new Error(`Dados inválidos: ${erros.join('; ')}`);
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const updates = [];
        const params = [];
        let pIdx = 1;

        if (validated.estado !== undefined) { updates.push(`estado = $${pIdx++}`); params.push(validated.estado || null); }
        if (validated.regional !== undefined) { updates.push(`regional = $${pIdx++}`); params.push(validated.regional || null); }
        if (validated.seccional !== undefined) { updates.push(`seccional = $${pIdx++}`); params.push(validated.seccional || null); }
        if (validated.dados !== undefined) { updates.push(`dados = $${pIdx++}`); params.push(validated.dados ? JSON.stringify(validated.dados) : null); }
        if (validated.status !== undefined) { updates.push(`status = $${pIdx++}`); params.push(validated.status || null); }
        if (validated.condicao !== undefined) { updates.push(`condicao = $${pIdx++}`); params.push(validated.condicao || null); }
        if (validated.fotos !== undefined) { updates.push(`fotos = $${pIdx++}`); params.push(validated.fotos ? JSON.stringify(validated.fotos) : null); }
        
        if (updates.length === 0) return eqData;

        updates.push(`updated_at = NOW()`);
        params.push(id);
        const idIdx = pIdx;

        const { rows } = await client.query(`
            UPDATE equipment SET ${updates.join(', ')}
            WHERE id = $${idIdx}
            RETURNING *
        `, params);

        const changes = {};
        if (validated.estado && validated.estado !== eqData.estado) changes.estado = { old: eqData.estado, new: validated.estado };
        if (validated.regional !== undefined && validated.regional !== eqData.regional) changes.regional = { old: eqData.regional, new: validated.regional };
        if (validated.seccional !== undefined && validated.seccional !== eqData.seccional) changes.seccional = { old: eqData.seccional, new: validated.seccional };
        if (validated.status && validated.status !== eqData.status) changes.status = { old: eqData.status, new: validated.status };
        if (validated.condicao && validated.condicao !== eqData.condicao) changes.condicao = { old: eqData.condicao, new: validated.condicao };

        if (Object.keys(changes).length > 0) {
            await log_equipment_event(client, {
                equipment_id: id,
                event_type: 'atualizacao',
                changes
            });
        }

        await client.query('COMMIT');
        return rows[0];
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

async function delete_equipment(id) {
    const pool = cenos_pool;
    
    // Validação para impedir deleção se houver associação ativa
    const { rows: asgRows } = await pool.query(`SELECT id FROM equipment_assignments WHERE equipment_id = $1 AND status = 'ativa'`, [id]);
    if (asgRows.length > 0) throw new Error('Não é possível excluir equipamento que possui associação ativa');

    const { rows } = await pool.query(`DELETE FROM equipment WHERE id = $1 RETURNING id`, [id]);
    if (!rows[0]) throw new Error('Equipamento não encontrado');
    return rows[0];
}

// ─── Histórico ────────────────────────────────────────────────────────────────

async function get_equipment_history(equipment_id) {
    const pool = cenos_pool;
    const { rows } = await pool.query(`
        SELECT ea.*, c."Nome" AS agente_nome
        FROM equipment_assignments ea
        LEFT JOIN colaboradores c ON LOWER(c."ID") = LOWER(ea.agente)
        WHERE ea.equipment_id = $1
        ORDER BY ea.created_at DESC
    `, [equipment_id]);
    return rows;
}

async function get_equipment_history_full(equipment_id) {
    const pool = cenos_pool;
    const { rows } = await pool.query(`
        SELECT * FROM equipment_events
        WHERE equipment_id = $1
        ORDER BY created_at DESC
    `, [equipment_id]);
    return rows;
}

// ─── Associações (Admin) ──────────────────────────────────────────────────────

async function assign_equipment({ equipment_id, agente, assignado_por, assignado_por_nome, observacao, foto_buffer, foto_mime, latitude, longitude }) {
    const pool = cenos_pool;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: existing } = await client.query(
            `SELECT id FROM equipment_assignments WHERE equipment_id = $1 AND status = 'ativa' FOR UPDATE`,
            [equipment_id]
        );
        if (existing.length > 0) throw new Error('Equipamento já está associado a um agente. Desassocie primeiro.');

    let foto_url = null;
    if (foto_buffer && foto_mime) {
        foto_url = await uploadEquipmentPhoto(foto_buffer, foto_mime, `equipment-assignments/${agente}`);
    }
        const { rows } = await client.query(`
            INSERT INTO equipment_assignments (
                equipment_id, agente, assignado_por, assignado_por_nome, status, observacao,
                foto_url, latitude, longitude
            )
            VALUES ($1, $2, $3, $4, 'ativa', $5, $6, $7, $8) RETURNING *
        `, [
            equipment_id,
            agente.toLowerCase(),
            assignado_por,
            assignado_por_nome,
            observacao || null,
            foto_url,
            latitude || null,
            longitude || null
        ]);
        await client.query(`UPDATE equipment SET status = 'em_uso', updated_at = NOW() WHERE id = $1`, [equipment_id]);
        
        await log_equipment_event(client, {
            equipment_id,
            event_type: 'associacao',
            agente,
            actor_id: assignado_por,
            actor_nome: assignado_por_nome,
            metadata: {
                assignment_id: rows[0].id,
                observacao,
                foto_url,
                latitude,
                longitude
            }
        });

        await client.query('COMMIT');
        return rows[0];
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

async function unassign_equipment({ equipment_id, desassociado_por, desassociado_por_nome, observacao }) {
    const pool = cenos_pool;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(`
            UPDATE equipment_assignments
            SET status = 'encerrada', data_desassociacao = NOW(),
                desassociado_por = $2, desassociado_por_nome = $3,
                observacao = COALESCE($4, observacao)
            WHERE equipment_id = $1 AND status = 'ativa' RETURNING *
        `, [equipment_id, desassociado_por, desassociado_por_nome, observacao || null]);
        if (!rows[0]) throw new Error('Nenhuma associação ativa encontrada');
        await client.query(`UPDATE equipment SET status = 'disponivel', updated_at = NOW() WHERE id = $1`, [equipment_id]);
        
        await log_equipment_event(client, {
            equipment_id,
            event_type: 'desassociacao',
            agente: rows[0].agente,
            actor_id: desassociado_por,
            actor_nome: desassociado_por_nome,
            metadata: {
                assignment_id: rows[0].id,
                observacao
            }
        });

        await client.query('COMMIT');
        return rows[0];
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

// ─── Solicitações de Agentes ──────────────────────────────────────────────────

async function create_equipment_request({ equipment_id, agente, foto_buffer, foto_mime, latitude, longitude, observacao_agente, tipo_solicitacao = 'associacao' }) {
    const pool = cenos_pool;
    const client = await pool.connect();
    let foto_url = null;

    try {
        await client.query('BEGIN');

        // Verifica disponibilidade / posse
        let eqQuery = `SELECT e.id, e.status`;
        if (tipo_solicitacao === 'devolucao') {
            eqQuery += `, ea.agente AS agente_atual FROM equipment e LEFT JOIN equipment_assignments ea ON ea.equipment_id = e.id AND ea.status = 'ativa'`;
        } else {
            eqQuery += ` FROM equipment e`;
        }
        eqQuery += ` WHERE e.id = $1 FOR UPDATE`;

        const { rows: eqRows } = await client.query(eqQuery, [equipment_id]);
        if (!eqRows[0]) throw new Error('Equipamento não encontrado');
        
        if (tipo_solicitacao === 'associacao') {
            if (eqRows[0].status !== 'disponivel') throw new Error('Equipamento não está disponível');
        } else if (tipo_solicitacao === 'devolucao') {
            if (eqRows[0].status !== 'em_uso') throw new Error('Equipamento não está em uso');
            if ((eqRows[0].agente_atual || '').toLowerCase() !== agente.toLowerCase()) {
                throw new Error('Este equipamento não está associado a este agente');
            }
        }

        // Verifica solicitação pendente duplicada do mesmo tipo
        const { rows: dupRows } = await client.query(
            `SELECT id FROM equipment_requests WHERE equipment_id = $1 AND agente = $2 AND status = 'pendente' AND tipo_solicitacao = $3 FOR UPDATE`,
            [equipment_id, agente.toLowerCase(), tipo_solicitacao]
        );
        if (dupRows.length > 0) throw new Error('Já existe uma solicitação pendente desse tipo para este equipamento');

        // Faz upload da foto obrigatória
        foto_url = await uploadEquipmentPhoto(foto_buffer, foto_mime, `equipment-requests/${agente}`);

        const { rows } = await client.query(`
            INSERT INTO equipment_requests (equipment_id, agente, foto_url, latitude, longitude, observacao_agente, tipo_solicitacao)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
        `, [equipment_id, agente.toLowerCase(), foto_url, latitude || null, longitude || null, observacao_agente || null, tipo_solicitacao]);

        await log_equipment_event(client, {
            equipment_id,
            event_type: tipo_solicitacao === 'devolucao' ? 'solicitacao_devolucao' : 'solicitacao_associacao',
            agente: agente.toLowerCase(),
            actor_id: agente.toLowerCase(),
            metadata: {
                request_id: rows[0].id,
                foto_url,
                latitude,
                longitude,
                observacao: observacao_agente
            }
        });

        await client.query('COMMIT');
        return rows[0];
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

async function list_pending_requests({ estado, page = 1, limit = 15, userRole, userPermissions = [] } = {}) {
    const pool = cenos_pool;
    const params = [];
    let paramIdx = 1;

    let query = `
        SELECT er.*, e.tipo, e.estado, e.status AS equipment_status, e.condicao, e.dados,
               c."Nome" AS agente_nome
        FROM equipment_requests er
        JOIN equipment e ON e.id = er.equipment_id
        LEFT JOIN colaboradores c ON LOWER(c."ID") = LOWER(er.agente)
        WHERE er.status = 'pendente'
    `;

    if (userRole !== 'COMPANY_ADMIN') {
        if (userPermissions && userPermissions.length > 0) {
            const permConditions = [];
            userPermissions.forEach(perm => {
                const filters = perm.filters || [];
                const permEstado = filters.find(f => f.type === 'estado')?.value;
                const permRegional = filters.find(f => f.type === 'regional')?.value;
                const permSeccional = filters.find(f => f.type === 'seccional')?.value;

                if (permEstado) {
                    let cond = `(e.estado = $${paramIdx++}`;
                    params.push(permEstado.toLowerCase());
                    
                    if (permRegional) {
                        cond += ` AND (e.regional = $${paramIdx++} OR e.regional IS NULL)`;
                        params.push(permRegional);
                    }
                    if (permSeccional) {
                        cond += ` AND (e.seccional = $${paramIdx++} OR e.seccional IS NULL)`;
                        params.push(permSeccional);
                    }
                    cond += `)`;
                    permConditions.push(cond);
                }
            });

            if (permConditions.length > 0) {
                query += ` AND (${permConditions.join(' OR ')})`;
            } else {
                query += ` AND 1=0`; 
            }
        } else {
            query += ` AND 1=0`;
        }
    }

    if (estado) { query += ` AND e.estado = $${paramIdx++}`; params.push(estado.toLowerCase()); }
    // Count query
    const countQuery = `SELECT COUNT(*) AS total FROM (${query}) AS sub`;
    const { rows: [{ total: totalStr }] } = await pool.query(countQuery, params);
    const total = parseInt(totalStr);

    query += ` ORDER BY er.created_at DESC`;

    const limitVal = parseInt(limit) || 15;
    const offset = (parseInt(page) - 1) * limitVal;
    const totalPages = Math.max(1, Math.ceil(total / limitVal));

    query += ` LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(limitVal, offset);

    const { rows: data } = await pool.query(query, params);

    return { data, total, page: parseInt(page), limit: limitVal, totalPages };
}

async function approve_equipment_request({ request_id, aprovado_por, aprovado_por_nome }) {
    const pool = cenos_pool;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: reqRows } = await client.query(
            `SELECT * FROM equipment_requests WHERE id = $1 AND status = 'pendente' FOR UPDATE`, [request_id]
        );
        if (!reqRows[0]) throw new Error('Solicitação não encontrada ou já processada');
        const req = reqRows[0];

        const { rows: eqRows } = await client.query(`SELECT status FROM equipment WHERE id = $1 FOR UPDATE`, [req.equipment_id]);
        if (!eqRows[0]) throw new Error('Equipamento não encontrado');

        if (req.tipo_solicitacao === 'devolucao') {
            if (eqRows[0].status !== 'em_uso') throw new Error('Equipamento não está em uso');

            // Encerra a associação ativa
            const { rows: asgRows } = await client.query(`
                UPDATE equipment_assignments
                SET status = 'encerrada', data_desassociacao = NOW(),
                    desassociado_por = $2, desassociado_por_nome = $3,
                    observacao = 'Devolução aprovada via solicitação'
                WHERE equipment_id = $1 AND status = 'ativa' RETURNING *
            `, [req.equipment_id, aprovado_por, aprovado_por_nome]);

            // Atualiza a solicitação
            await client.query(`
                UPDATE equipment_requests SET
                    status = 'aprovado', processado_por = $2, processado_por_nome = $3,
                    data_processamento = NOW()
                WHERE id = $1
            `, [request_id, aprovado_por, aprovado_por_nome]);

            // Atualiza status do equipamento
            await client.query(`UPDATE equipment SET status = 'disponivel', updated_at = NOW() WHERE id = $1`, [req.equipment_id]);

            await log_equipment_event(client, {
                equipment_id: req.equipment_id,
                event_type: 'solicitacao_aprovada',
                agente: req.agente,
                actor_id: aprovado_por,
                actor_nome: aprovado_por_nome,
                metadata: {
                    request_id,
                    tipo_solicitacao: req.tipo_solicitacao,
                    assignment_encerrado_id: asgRows[0].id
                }
            });

            await client.query('COMMIT');
            return { request: { ...req, status: 'aprovado' }, assignment: asgRows[0] || null };

        } else {
            // associacao
            if (eqRows[0].status !== 'disponivel') throw new Error('Equipamento não está mais disponível');

            // Cria o assignment
            const { rows: asgRows } = await client.query(`
                INSERT INTO equipment_assignments (equipment_id, agente, assignado_por, assignado_por_nome, status, data_associacao)
                VALUES ($1, $2, $3, $4, 'ativa', NOW()) RETURNING *
            `, [req.equipment_id, req.agente, aprovado_por, aprovado_por_nome]);

            // Atualiza a solicitação com referência ao assignment
            await client.query(`
                UPDATE equipment_requests SET
                    status = 'aprovado', processado_por = $2, processado_por_nome = $3,
                    data_processamento = NOW(), assignment_id = $4
                WHERE id = $1
            `, [request_id, aprovado_por, aprovado_por_nome, asgRows[0].id]);

            // Atualiza status do equipamento
            await client.query(`UPDATE equipment SET status = 'em_uso', updated_at = NOW() WHERE id = $1`, [req.equipment_id]);

            await log_equipment_event(client, {
                equipment_id: req.equipment_id,
                event_type: 'solicitacao_aprovada',
                agente: req.agente,
                actor_id: aprovado_por,
                actor_nome: aprovado_por_nome,
                metadata: {
                    request_id,
                    tipo_solicitacao: req.tipo_solicitacao,
                    assignment_id: asgRows[0].id
                }
            });

            await client.query('COMMIT');
            return { request: { ...req, status: 'aprovado' }, assignment: asgRows[0] };
        }
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}
async function reject_equipment_request({ request_id, rejeitado_por, rejeitado_por_nome, observacao_admin }) {
    const pool = cenos_pool;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const { rows } = await client.query(`
            UPDATE equipment_requests SET
                status = 'rejeitado', processado_por = $2, processado_por_nome = $3,
                data_processamento = NOW(), observacao_admin = $4
            WHERE id = $1 AND status = 'pendente' RETURNING *
        `, [request_id, rejeitado_por, rejeitado_por_nome, observacao_admin || null]);
        if (!rows[0]) throw new Error('Solicitação não encontrada ou já processada');
        
        await log_equipment_event(client, {
            equipment_id: rows[0].equipment_id,
            event_type: 'solicitacao_rejeitada',
            agente: rows[0].agente,
            actor_id: rejeitado_por,
            actor_nome: rejeitado_por_nome,
            metadata: {
                request_id,
                tipo_solicitacao: rows[0].tipo_solicitacao,
                observacao_admin
            }
        });

        await client.query('COMMIT');
        return rows[0];
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    list_equipment,
    get_equipment_stats,
    get_equipment_by_id,
    get_equipment_by_agent,
    list_available_equipment,
    create_equipment,
    update_equipment,
    delete_equipment,
    get_equipment_history,
    get_equipment_history_full,
    assign_equipment,
    unassign_equipment,
    create_equipment_request,
    list_pending_requests,
    approve_equipment_request,
    reject_equipment_request,
    uploadEquipmentPhoto,
    EQUIPMENT_TIPO_IDS,
    EQUIPMENT_STATUS,
    EQUIPMENT_CONDICAO,
};
