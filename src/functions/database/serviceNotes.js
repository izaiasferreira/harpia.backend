const { cenos_pool } = require('../../db');
const { serviceGroupCreateSchema, serviceGroupSchema, markerCategorySchema, serviceNoteCreateSchema, serviceNoteSchema } = require('../../db/schemas');

// ==========================================
// DDL
// ==========================================

async function ensureServiceNotesTables() {
    // Tabelas criadas via migration central
}

function validateCoordinates(coord) {
    if (!coord) return undefined;
    const strCoord = String(coord);
    const parts = strCoord.split(',');
    if (parts.length !== 2) return undefined;
    const lat = parseFloat(parts[0].trim());
    const lon = parseFloat(parts[1].trim());
    if (isNaN(lat) || isNaN(lon)) return undefined;
    if (lat < -90 || lat > 90) return undefined;
    if (lon < -180 || lon > 180) return undefined;
    return `${lat},${lon}`;
}

// ==========================================
// GRUPOS
// ==========================================

async function listServiceGroups() {
    await ensureServiceNotesTables();
    const { rows } = await cenos_pool.query('SELECT * FROM service_groups ORDER BY created_at DESC');
    return rows;
}

async function getServiceGroupById(id) {
    await ensureServiceNotesTables();
    const { rows } = await cenos_pool.query('SELECT * FROM service_groups WHERE id = $1', [id]);
    return rows[0] || null;
}

async function createServiceGroup({ name, description, completion_config, allow_all_agents, allowed_agents, allow_agent_creation, created_by }) {
    await ensureServiceNotesTables();
    const validated = serviceGroupCreateSchema.parse({ name, description, completion_config, allow_all_agents, allowed_agents, allow_agent_creation, created_by });
    const { rows } = await cenos_pool.query(
        `INSERT INTO service_groups (name, description, completion_config, allow_all_agents, allowed_agents, allow_agent_creation, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
            validated.name,
            validated.description || null,
            typeof validated.completion_config === 'string' ? validated.completion_config : JSON.stringify(validated.completion_config || {}),
            validated.allow_all_agents !== undefined ? validated.allow_all_agents : true,
            typeof validated.allowed_agents === 'string' ? validated.allowed_agents : JSON.stringify(validated.allowed_agents || []),
            validated.allow_agent_creation !== undefined ? validated.allow_agent_creation : false,
            validated.created_by || null
        ]
    );
    return rows[0];
}

async function updateServiceGroup(id, data) {
    await ensureServiceNotesTables();
    const validated = serviceGroupSchema.partial().parse(data);
    const { name, description, completion_config, allow_all_agents, allowed_agents, allow_agent_creation } = validated;
    const updates = [];
    const params = [];
    let idx = 1;
    if (name !== undefined) { updates.push(`name = $${idx}`); params.push(name); idx++; }
    if (description !== undefined) { updates.push(`description = $${idx}`); params.push(description); idx++; }
    if (completion_config !== undefined) { updates.push(`completion_config = $${idx}`); params.push(typeof completion_config === 'string' ? completion_config : JSON.stringify(completion_config)); idx++; }
    if (allow_all_agents !== undefined) { updates.push(`allow_all_agents = $${idx}`); params.push(allow_all_agents); idx++; }
    if (allowed_agents !== undefined) { updates.push(`allowed_agents = $${idx}`); params.push(typeof allowed_agents === 'string' ? allowed_agents : JSON.stringify(allowed_agents)); idx++; }
    if (allow_agent_creation !== undefined) { updates.push(`allow_agent_creation = $${idx}`); params.push(allow_agent_creation); idx++; }
    if (updates.length === 0) return null;
    updates.push('updated_at = NOW()');
    params.push(id);
    const { rows } = await cenos_pool.query(`UPDATE service_groups SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`, params);
    return rows[0] || null;
}

async function deleteServiceGroup(id) {
    await ensureServiceNotesTables();
    const { rows } = await cenos_pool.query('DELETE FROM service_groups WHERE id = $1 RETURNING *', [id]);
    return rows[0] || null;
}

// ==========================================
// CATEGORIAS
// ==========================================

async function listCategoriesByGroup(groupId) {
    await ensureServiceNotesTables();
    const { rows } = await cenos_pool.query('SELECT * FROM marker_categories WHERE group_id = $1 ORDER BY name', [groupId]);
    return rows;
}

async function createCategory({ group_id, name, color }) {
    await ensureServiceNotesTables();
    const validated = markerCategorySchema.parse({ group_id: Number(group_id), name, color });
    const { rows } = await cenos_pool.query(
        `INSERT INTO marker_categories (group_id, name, color) VALUES ($1, $2, $3) RETURNING *`,
        [validated.group_id, validated.name, validated.color || '#2563EB']
    );
    return rows[0];
}

async function deleteCategory(id) {
    await ensureServiceNotesTables();
    const { rows } = await cenos_pool.query('DELETE FROM marker_categories WHERE id = $1 RETURNING *', [id]);
    return rows[0] || null;
}

// ==========================================
// NOTAS DE SERVICO
// ==========================================

async function listServiceNotes({ groupId, status, assignedTo, archived, unassigned, categoryId, createdFrom, createdTo, completedFrom, completedTo }) {
    await ensureServiceNotesTables();
    let query = 'SELECT sn.*, mc.name as category_name, mc.color as category_color, sg.name as group_name, sg.completion_config FROM service_notes sn LEFT JOIN marker_categories mc ON sn.marker_category_id = mc.id LEFT JOIN service_groups sg ON sn.group_id = sg.id WHERE 1=1';
    const params = [];
    let idx = 1;
    if (archived !== undefined) { query += ` AND sn.archived = $${idx}`; params.push(archived); idx++; }
    if (groupId) { query += ` AND sn.group_id = $${idx}`; params.push(groupId); idx++; }
    if (status) { query += ` AND sn.status = $${idx}`; params.push(status); idx++; }
    if (unassigned) { query += ' AND sn.assigned_to IS NULL'; }
    else if (assignedTo === '__any__') { query += ' AND sn.assigned_to IS NOT NULL'; }
    else if (assignedTo) { query += ` AND sn.assigned_to = $${idx}`; params.push(assignedTo); idx++; }
    if (categoryId) { query += ` AND sn.marker_category_id = $${idx}`; params.push(categoryId); idx++; }
    if (createdFrom) { query += ` AND sn.created_at >= $${idx}`; params.push(createdFrom); idx++; }
    if (createdTo) { query += ` AND sn.created_at <= $${idx}`; params.push(createdTo + 'T23:59:59'); idx++; }
    if (completedFrom) { query += ` AND sn.completed_at >= $${idx}`; params.push(completedFrom); idx++; }
    if (completedTo) { query += ` AND sn.completed_at <= $${idx}`; params.push(completedTo + 'T23:59:59'); idx++; }
    query += ' ORDER BY sn.created_at DESC';
    const { rows } = await cenos_pool.query(query, params);
    return rows;
}

async function getServiceNoteById(id) {
    await ensureServiceNotesTables();
    const { rows } = await cenos_pool.query(
        `SELECT sn.*, mc.name as category_name, mc.color as category_color, sg.completion_config
         FROM service_notes sn
         LEFT JOIN marker_categories mc ON sn.marker_category_id = mc.id
         LEFT JOIN service_groups sg ON sn.group_id = sg.id
         WHERE sn.id = $1`, [id]
    );
    return rows[0] || null;
}

async function createServiceNote({ group_id, title, description, coordinates, latitude, longitude, address, marker_category_id, custom_fields }) {
    await ensureServiceNotesTables();
    let latVal = latitude !== undefined ? parseFloat(latitude) : null;
    let lngVal = longitude !== undefined ? parseFloat(longitude) : null;
    let coordVal = coordinates;

    if (coordinates && (latVal === null || lngVal === null)) {
        const parts = String(coordinates).split(',');
        if (parts.length === 2) {
            latVal = parseFloat(parts[0].trim());
            lngVal = parseFloat(parts[1].trim());
        }
    } else if (latVal !== null && lngVal !== null && !coordinates) {
        coordVal = `${latVal},${lngVal}`;
    }

    const validated = serviceNoteCreateSchema.parse({
        group_id: Number(group_id),
        title,
        description,
        coordinates: coordVal || null,
        latitude: latVal,
        longitude: lngVal,
        address,
        marker_category_id: marker_category_id !== undefined && marker_category_id !== null ? Number(marker_category_id) : null,
        custom_fields
    });

    const { rows } = await cenos_pool.query(
        `INSERT INTO service_notes (group_id, title, description, coordinates, latitude, longitude, address, marker_category_id, custom_fields)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [
            validated.group_id,
            validated.title,
            validated.description || null,
            validated.coordinates || null,
            validated.latitude,
            validated.longitude,
            validated.address || null,
            validated.marker_category_id || null,
            validated.custom_fields ? (typeof validated.custom_fields === 'string' ? validated.custom_fields : JSON.stringify(validated.custom_fields)) : null
        ]
    );
    return rows[0];
}

async function updateServiceNote(id, fields) {
    await ensureServiceNotesTables();
    const validated = serviceNoteSchema.partial().parse(fields);
    const allowed = ['title', 'description', 'coordinates', 'latitude', 'longitude', 'address', 'marker_category_id', 'status', 'group_id', 'archived'];
    const updates = [];
    const params = [];
    let idx = 1;

    let latVal = validated.latitude !== undefined ? parseFloat(validated.latitude) : undefined;
    let lngVal = validated.longitude !== undefined ? parseFloat(validated.longitude) : undefined;
    let coordVal = validated.coordinates;

    if (validated.coordinates !== undefined && validated.latitude === undefined) {
        const parts = String(validated.coordinates).split(',');
        if (parts.length === 2) {
            latVal = parseFloat(parts[0].trim());
            lngVal = parseFloat(parts[1].trim());
        }
    } else if (latVal !== undefined && lngVal !== undefined && validated.coordinates === undefined) {
        coordVal = `${latVal},${lngVal}`;
    }

    for (const key of allowed) {
        if (validated[key] !== undefined || (key === 'latitude' && latVal !== undefined) || (key === 'longitude' && lngVal !== undefined)) {
            updates.push(`${key} = $${idx}`);
            if (key === 'coordinates') {
                params.push(coordVal || null);
            } else if (key === 'latitude') {
                params.push(latVal !== undefined ? latVal : null);
            } else if (key === 'longitude') {
                params.push(lngVal !== undefined ? lngVal : null);
            } else {
                params.push(validated[key]);
            }
            idx++;
        }
    }
    if (updates.length === 0) return null;
    updates.push('updated_at = NOW()');
    params.push(id);
    const { rows } = await cenos_pool.query(`UPDATE service_notes SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`, params);
    return rows[0] || null;
}

async function deleteServiceNote(id) {
    await ensureServiceNotesTables();
    const { rows } = await cenos_pool.query('DELETE FROM service_notes WHERE id = $1 RETURNING *', [id]);
    return rows[0] || null;
}

// ==========================================
// ATRIBUICAO
// ==========================================

async function assignServiceNote(noteId, agentId, assignedBy) {
    await ensureServiceNotesTables();
    await cenos_pool.query('UPDATE service_notes SET assigned_to = $1, updated_at = NOW() WHERE id = $2', [agentId, noteId]);
    if (agentId) {
        await cenos_pool.query('INSERT INTO service_assignments (service_note_id, agent_id, assigned_by) VALUES ($1, $2, $3)', [noteId, agentId, assignedBy || null]);
    }
}

async function bulkAssign(serviceIds, agentId, assignedBy) {
    await ensureServiceNotesTables();
    const client = await cenos_pool.connect();
    try {
        await client.query('BEGIN');
        for (const id of serviceIds) {
            await client.query('UPDATE service_notes SET assigned_to = $1, updated_at = NOW() WHERE id = $2', [agentId, id]);
            if (agentId) {
                await client.query('INSERT INTO service_assignments (service_note_id, agent_id, assigned_by) VALUES ($1, $2, $3)', [id, agentId, assignedBy || null]);
            }
        }
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

async function bulkUpdateCategory(serviceIds, categoryId) {
    await ensureServiceNotesTables();
    await cenos_pool.query('UPDATE service_notes SET marker_category_id = $1, updated_at = NOW() WHERE id = ANY($2::int[])', [categoryId, serviceIds]);
}

async function bulkDelete(serviceIds) {
    await ensureServiceNotesTables();
    await cenos_pool.query('DELETE FROM service_notes WHERE id = ANY($1::int[])', [serviceIds]);
}

async function bulkArchive(serviceIds) {
    await ensureServiceNotesTables();
    await cenos_pool.query('UPDATE service_notes SET archived = true, updated_at = NOW() WHERE id = ANY($1::int[])', [serviceIds]);
}

async function bulkUnarchive(serviceIds) {
    await ensureServiceNotesTables();
    await cenos_pool.query('UPDATE service_notes SET archived = false, updated_at = NOW() WHERE id = ANY($1::int[])', [serviceIds]);
}

// ==========================================
// CONCLUSAO (Agente)
// ==========================================

async function completeServiceNote(noteId, { agentId, coordinates, completionData, completedAt }) {
    await ensureServiceNotesTables();
    const validCoords = validateCoordinates(coordinates);
    const { rows } = await cenos_pool.query(
        `UPDATE service_notes 
         SET status = 'CONCLUIDO', 
              completed_by = $1, 
              assigned_to = COALESCE(assigned_to, $1),
              completed_at = $2, 
              completion_coordinates = $3, 
              completion_data = $4, 
              updated_at = NOW()
          WHERE id = $5 AND status = 'PENDENTE' AND (assigned_to = $1 OR assigned_to IS NULL) RETURNING *`,
        [agentId, completedAt || new Date().toISOString(), validCoords || null, completionData ? JSON.stringify(completionData) : null, noteId]
    );
    return rows[0] || null;
}

async function selfRegisterServiceNote({ groupId, agentId, title, coordinates, completionData, completedAt }) {
    await ensureServiceNotesTables();

    const group = await getServiceGroupById(groupId);
    if (!group) throw new Error('Grupo nao encontrado');

    if (!group.allow_agent_creation) throw new Error('Este grupo nao permite criacao de servicos por agentes');

    const isVisible = group.allow_all_agents ||
        (Array.isArray(group.allowed_agents) && group.allowed_agents.includes(agentId));
    if (!isVisible) throw new Error('Voce nao tem permissao para registrar servicos neste grupo');

    const validCoords = validateCoordinates(coordinates);
    const autoTitle = title || `Registro – ${group.name} – ${new Date().toLocaleDateString('pt-BR')}`;
    const { rows } = await cenos_pool.query(
        `INSERT INTO service_notes (group_id, title, coordinates, status, assigned_to, completed_by, completed_at, completion_coordinates, completion_data, self_registered)
         VALUES ($1, $2, $3, 'CONCLUIDO', $4, $4, $5, $3, $6, true) RETURNING *`,
        [groupId, autoTitle, validCoords || null, agentId, completedAt || new Date().toISOString(), completionData ? JSON.stringify(completionData) : null]
    );
    return rows[0];
}

// ==========================================
// CRIACAO PELO AGENTE (com status PENDENTE)
// ==========================================

async function createAgentServiceNote({ group_id, title, description, coordinates, latitude, longitude, address, marker_category_id, agentId, assignToSelf }) {
    await ensureServiceNotesTables();

    const group = await getServiceGroupById(group_id);
    if (!group) throw new Error('Grupo nao encontrado');

    if (!group.allow_agent_creation) throw new Error('Este grupo nao permite criacao de servicos por agentes');

    const isVisible = group.allow_all_agents ||
        (Array.isArray(group.allowed_agents) && group.allowed_agents.includes(agentId));
    if (!isVisible) throw new Error('Voce nao tem permissao para criar servicos neste grupo');

    let latVal = latitude !== undefined ? parseFloat(latitude) : null;
    let lngVal = longitude !== undefined ? parseFloat(longitude) : null;
    let coordVal = coordinates;

    if (coordinates && (latVal === null || lngVal === null)) {
        const parts = String(coordinates).split(',');
        if (parts.length === 2) {
            latVal = parseFloat(parts[0].trim());
            lngVal = parseFloat(parts[1].trim());
        }
    } else if (latVal !== null && lngVal !== null && !coordinates) {
        coordVal = `${latVal},${lngVal}`;
    }

    const assignTo = assignToSelf ? agentId : null;

    const { rows } = await cenos_pool.query(
        `INSERT INTO service_notes (group_id, title, description, coordinates, latitude, longitude, address, marker_category_id, assigned_to, self_registered)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true) RETURNING *`,
        [group_id, title, description || null, coordVal || null, latVal, lngVal, address || null, marker_category_id || null, assignTo]
    );

    if (assignTo) {
        await cenos_pool.query(
            'INSERT INTO service_assignments (service_note_id, agent_id, assigned_by) VALUES ($1, $2, $3)',
            [rows[0].id, agentId, null]
        );
    }

    return rows[0];
}

async function listCreatableGroups(agentId) {
    await ensureServiceNotesTables();
    const { rows } = await cenos_pool.query(
        `SELECT * FROM service_groups
         WHERE allow_agent_creation = true
           AND (allow_all_agents = true
                OR (allowed_agents IS NOT NULL AND allowed_agents @> jsonb_build_array($1::text)))
         ORDER BY name`,
        [agentId]
    );
    return rows;
}

async function listVisibleGroups(agentId) {
    await ensureServiceNotesTables();
    const { rows } = await cenos_pool.query(
        `SELECT * FROM service_groups
         WHERE allow_all_agents = true
            OR (allowed_agents IS NOT NULL AND allowed_agents @> jsonb_build_array($1::text))
         ORDER BY name`,
        [agentId]
    );
    return rows;
}

async function listVisibleGroupsWithCounts(agentId) {
    await ensureServiceNotesTables();
    const { rows } = await cenos_pool.query(
        `SELECT sg.*,
                COUNT(sn.id) AS total_notes,
                COUNT(sn.id) FILTER (WHERE sn.status = 'CONCLUIDO') AS done_notes
         FROM service_groups sg
         LEFT JOIN service_notes sn ON sn.group_id = sg.id AND sn.archived = false
         WHERE sg.allow_all_agents = true
            OR (sg.allowed_agents IS NOT NULL AND sg.allowed_agents @> jsonb_build_array($1::text))
         GROUP BY sg.id
         ORDER BY sg.name`,
        [agentId]
    );
    return rows;
}

// ==========================================
// IMPORTACAO EM LOTE
// ==========================================

async function bulkInsertServiceNotes(groupId, notes) {
    await ensureServiceNotesTables();
    const client = await cenos_pool.connect();
    const inserted = [];
    try {
        await client.query('BEGIN');
        for (const note of notes) {
            let latVal = note.latitude !== undefined && note.latitude !== null ? parseFloat(note.latitude) : null;
            let lngVal = note.longitude !== undefined && note.longitude !== null ? parseFloat(note.longitude) : null;
            let coordVal = note.coordinates;

            if (note.coordinates && (latVal === null || lngVal === null)) {
                const parts = String(note.coordinates).split(',');
                if (parts.length === 2) {
                    latVal = parseFloat(parts[0].trim());
                    lngVal = parseFloat(parts[1].trim());
                }
            } else if (latVal !== null && lngVal !== null && !note.coordinates) {
                coordVal = `${latVal},${lngVal}`;
            }

            const { rows } = await client.query(
                `INSERT INTO service_notes (group_id, title, description, coordinates, latitude, longitude, address, custom_fields) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
                [groupId, note.title || 'Sem Titulo', note.description || null, coordVal || null, latVal, lngVal, note.address || null, note.custom_fields ? JSON.stringify(note.custom_fields) : null]
            );
            inserted.push(rows[0]);
        }
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
    return inserted;
}

// ==========================================
// CONSULTA AGENTE
// ==========================================

async function getAssignedNotes(agentId) {
    await ensureServiceNotesTables();
    const { rows } = await cenos_pool.query(
        `SELECT sn.*, mc.name as category_name, mc.color as category_color, sg.name as group_name, sg.completion_config
         FROM service_notes sn
         LEFT JOIN marker_categories mc ON sn.marker_category_id = mc.id
         LEFT JOIN service_groups sg ON sn.group_id = sg.id
         WHERE sn.archived = false AND sn.assigned_to = $1
         ORDER BY sn.status ASC, sn.created_at DESC`, [agentId]
    );
    return rows;
}

// ==========================================
// NOTAS DE GRUPO (Agente - visibilidade)
// ==========================================

async function getGroupNotesForAgent(groupId, agentId) {
    await ensureServiceNotesTables();

    const { rows: groups } = await cenos_pool.query(
        `SELECT * FROM service_groups WHERE id = $1`, [groupId]
    );
    const group = groups[0];
    if (!group) throw new Error('Grupo nao encontrado');

    const agentStr = String(agentId);
    const isPublic = group.allow_all_agents === true;
    const isAssigned = group.allowed_agents && group.allowed_agents.some(a => String(a) === agentStr);

    if (!isPublic && !isAssigned) throw new Error('Sem permissao para ver este grupo');

    if (isPublic) {
        const { rows } = await cenos_pool.query(
            `SELECT sn.*, mc.name as category_name, mc.color as category_color, sg.name as group_name, sg.completion_config
             FROM service_notes sn
             LEFT JOIN marker_categories mc ON sn.marker_category_id = mc.id
             LEFT JOIN service_groups sg ON sn.group_id = sg.id
             WHERE sn.archived = false AND sn.group_id = $1
             ORDER BY sn.created_at DESC`, [groupId]
        );
        return rows;
    }
    const notes = await getAssignedNotes(agentId);
    return notes.filter(n => Number(n.group_id) === Number(groupId));
}

// ==========================================
// BULK MOVE (mover notas entre grupos)
// ==========================================

async function bulkMove(serviceIds, targetGroupId) {
    await ensureServiceNotesTables();
    await cenos_pool.query('UPDATE service_notes SET group_id = $1, updated_at = NOW() WHERE id = ANY($2::int[])', [targetGroupId, serviceIds]);
}

// ==========================================
// CONCLUSAO MANUAL (Admin)
// ==========================================

async function adminCompleteNote(noteId, { adminId, completionData }) {
    await ensureServiceNotesTables();
    const { rows } = await cenos_pool.query(
        `UPDATE service_notes SET status = 'CONCLUIDO', completed_by = $1, completed_at = NOW(), completion_data = $2, updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [adminId, completionData ? JSON.stringify(completionData) : null, noteId]
    );
    return rows[0] || null;
}

// ==========================================
// RESTAURACAO (Admin)
// ==========================================

async function restoreServiceNoteCompletion(id) {
    await ensureServiceNotesTables();
    const { rows } = await cenos_pool.query(
        `UPDATE service_notes 
         SET status = 'PENDENTE', 
             completed_by = NULL, 
             completed_at = NULL, 
             completion_coordinates = NULL, 
             completion_data = NULL, 
             assigned_to = NULL,
             updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [id]
    );
    return rows[0] || null;
}

async function bulkRestore(serviceIds) {
    await ensureServiceNotesTables();
    await cenos_pool.query(
        `UPDATE service_notes 
         SET status = 'PENDENTE', 
             completed_by = NULL, 
             completed_at = NULL, 
             completion_coordinates = NULL, 
             completion_data = NULL, 
             assigned_to = NULL,
             updated_at = NOW()
         WHERE id = ANY($1::int[])`,
        [serviceIds]
    );
}

module.exports = {
    ensureServiceNotesTables,
    validateCoordinates,
    listServiceGroups, getServiceGroupById, createServiceGroup, updateServiceGroup, deleteServiceGroup,
    listCategoriesByGroup, createCategory, deleteCategory,
    listServiceNotes, getServiceNoteById, createServiceNote, updateServiceNote, deleteServiceNote,
    assignServiceNote, bulkAssign, bulkUpdateCategory, bulkDelete, bulkArchive, bulkUnarchive, bulkMove,
    completeServiceNote, adminCompleteNote, selfRegisterServiceNote,
    bulkInsertServiceNotes,
    getAssignedNotes,
    restoreServiceNoteCompletion, bulkRestore,
    createAgentServiceNote, listCreatableGroups, listVisibleGroups, listVisibleGroupsWithCounts,
    getGroupNotesForAgent,
};