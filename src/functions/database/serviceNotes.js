const { cenos_pool } = require('../../db');

// ==========================================
// DDL
// ==========================================

async function ensureServiceNotesTables() {
    await cenos_pool.query(`
        CREATE TABLE IF NOT EXISTS service_groups (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            completion_config JSONB NOT NULL DEFAULT '{}',
            created_by INTEGER,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS marker_categories (
            id SERIAL PRIMARY KEY,
            group_id INTEGER NOT NULL REFERENCES service_groups(id) ON DELETE CASCADE,
            name VARCHAR(100) NOT NULL,
            color VARCHAR(7) NOT NULL DEFAULT '#2563EB',
            created_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS service_notes (
            id SERIAL PRIMARY KEY,
            group_id INTEGER NOT NULL REFERENCES service_groups(id) ON DELETE CASCADE,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            coordinates VARCHAR(100),
            address TEXT,
            status VARCHAR(50) NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'CONCLUIDO')),
            assigned_to VARCHAR(50),
            completed_by VARCHAR(50),
            completed_at TIMESTAMP,
            completion_coordinates VARCHAR(100),
            completion_data JSONB,
            custom_fields JSONB,
            marker_category_id INTEGER REFERENCES marker_categories(id) ON DELETE SET NULL,
            self_registered BOOLEAN NOT NULL DEFAULT FALSE,
            archived BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS service_assignments (
            id SERIAL PRIMARY KEY,
            service_note_id INTEGER NOT NULL REFERENCES service_notes(id) ON DELETE CASCADE,
            agent_id VARCHAR(50) NOT NULL,
            assigned_by INTEGER,
            assigned_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_service_notes_group ON service_notes(group_id);
        CREATE INDEX IF NOT EXISTS idx_service_notes_assigned ON service_notes(assigned_to);
        CREATE INDEX IF NOT EXISTS idx_service_notes_status ON service_notes(status);
        CREATE INDEX IF NOT EXISTS idx_marker_categories_group ON marker_categories(group_id);
    `);
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

async function createServiceGroup({ name, description, completion_config, created_by }) {
    await ensureServiceNotesTables();
    const { rows } = await cenos_pool.query(
        `INSERT INTO service_groups (name, description, completion_config, created_by) VALUES ($1, $2, $3, $4) RETURNING *`,
        [name, description || null, JSON.stringify(completion_config || {}), created_by || null]
    );
    return rows[0];
}

async function updateServiceGroup(id, { name, description, completion_config }) {
    await ensureServiceNotesTables();
    const updates = [];
    const params = [];
    let idx = 1;
    if (name !== undefined) { updates.push(`name = $${idx}`); params.push(name); idx++; }
    if (description !== undefined) { updates.push(`description = $${idx}`); params.push(description); idx++; }
    if (completion_config !== undefined) { updates.push(`completion_config = $${idx}`); params.push(JSON.stringify(completion_config)); idx++; }
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
    const { rows } = await cenos_pool.query(
        `INSERT INTO marker_categories (group_id, name, color) VALUES ($1, $2, $3) RETURNING *`,
        [group_id, name, color || '#2563EB']
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
    let query = 'SELECT sn.*, mc.name as category_name, mc.color as category_color FROM service_notes sn LEFT JOIN marker_categories mc ON sn.marker_category_id = mc.id WHERE 1=1';
    const params = [];
    let idx = 1;
    if (archived !== undefined) { query += ` AND sn.archived = $${idx}`; params.push(archived); idx++; }
    if (groupId) { query += ` AND sn.group_id = $${idx}`; params.push(groupId); idx++; }
    if (status) { query += ` AND sn.status = $${idx}`; params.push(status); idx++; }
    if (assignedTo) { query += ` AND sn.assigned_to = $${idx}`; params.push(assignedTo); idx++; }
    if (unassigned) { query += ' AND sn.assigned_to IS NULL'; }
    else if (assignedTo === '__any__') { query += ' AND sn.assigned_to IS NOT NULL'; }
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

async function createServiceNote({ group_id, title, description, coordinates, address, marker_category_id, custom_fields }) {
    await ensureServiceNotesTables();
    const validCoords = validateCoordinates(coordinates);
    const { rows } = await cenos_pool.query(
        `INSERT INTO service_notes (group_id, title, description, coordinates, address, marker_category_id, custom_fields)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [group_id, title, description || null, validCoords || null, address || null, marker_category_id || null, custom_fields ? JSON.stringify(custom_fields) : null]
    );
    return rows[0];
}

async function updateServiceNote(id, fields) {
    await ensureServiceNotesTables();
    const allowed = ['title', 'description', 'coordinates', 'address', 'marker_category_id', 'status'];
    const updates = [];
    const params = [];
    let idx = 1;
    for (const key of allowed) {
        if (fields[key] !== undefined) {
            if (key === 'coordinates') {
                updates.push(`coordinates = $${idx}`);
                params.push(validateCoordinates(fields[key]) || null);
            } else {
                updates.push(`${key} = $${idx}`);
                params.push(fields[key]);
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
        `UPDATE service_notes SET status = 'CONCLUIDO', completed_by = $1, completed_at = $2, completion_coordinates = $3, completion_data = $4, updated_at = NOW()
         WHERE id = $5 AND assigned_to = $1 RETURNING *`,
        [agentId, completedAt || new Date().toISOString(), validCoords || null, completionData ? JSON.stringify(completionData) : null, noteId]
    );
    return rows[0] || null;
}

async function selfRegisterServiceNote({ groupId, agentId, title, coordinates, completionData, completedAt }) {
    await ensureServiceNotesTables();
    const validCoords = validateCoordinates(coordinates);
    const { rows } = await cenos_pool.query(
        `INSERT INTO service_notes (group_id, title, coordinates, status, assigned_to, completed_by, completed_at, completion_coordinates, completion_data, self_registered)
         VALUES ($1, $2, $3, 'CONCLUIDO', $4, $4, $5, $3, $6, true) RETURNING *`,
        [groupId, title || 'Auto-registro', validCoords || null, agentId, completedAt || new Date().toISOString(), completionData ? JSON.stringify(completionData) : null]
    );
    return rows[0];
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
            const validCoords = validateCoordinates(note.coordinates);
            const { rows } = await client.query(
                `INSERT INTO service_notes (group_id, title, description, coordinates, address, custom_fields) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                [groupId, note.title || 'Sem Titulo', note.description || null, validCoords || null, note.address || null, note.custom_fields ? JSON.stringify(note.custom_fields) : null]
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
         WHERE sn.assigned_to = $1 AND sn.archived = false
         ORDER BY sn.status ASC, sn.created_at DESC`, [agentId]
    );
    return rows;
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
};