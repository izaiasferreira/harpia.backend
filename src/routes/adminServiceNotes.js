const express = require('express');
const router = express.Router();
const multer = require('multer');
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const {
    listServiceGroups, getServiceGroupById, createServiceGroup, updateServiceGroup, deleteServiceGroup,
    listCategoriesByGroup, createCategory, deleteCategory,
    listServiceNotes, getServiceNoteById, createServiceNote, updateServiceNote, deleteServiceNote,
    assignServiceNote, bulkAssign, bulkUpdateCategory, bulkDelete, bulkArchive, bulkUnarchive, bulkMove,
    bulkInsertServiceNotes, adminCompleteNote,
} = require('../functions/database/serviceNotes');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ==========================================
// GRUPOS
// ==========================================

router.get('/groups', verifyToken(), verifyModule('service_notes'), async (req, res) => {
    try {
        const groups = await listServiceGroups();
        res.json(groups);
    } catch (err) {
        console.error('[SERVICE_NOTES] Erro listar grupos:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/groups/:id', verifyToken(), verifyModule('service_notes'), async (req, res) => {
    try {
        const group = await getServiceGroupById(req.params.id);
        if (!group) return res.status(404).json({ error: 'Grupo nao encontrado' });
        res.json(group);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/groups', verifyToken(), verifyModule('create_service_note'), async (req, res) => {
    try {
        const { name, description, completion_config } = req.body;
        if (!name) return res.status(400).json({ error: 'Nome obrigatorio' });
        const group = await createServiceGroup({ name, description, completion_config, created_by: req.user.id });
        res.status(201).json(group);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/groups/:id', verifyToken(), verifyModule('update_service_note'), async (req, res) => {
    try {
        const group = await updateServiceGroup(req.params.id, req.body);
        if (!group) return res.status(404).json({ error: 'Grupo nao encontrado' });
        res.json(group);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/groups/:id', verifyToken(), verifyModule('delete_service_note'), async (req, res) => {
    try {
        const group = await deleteServiceGroup(req.params.id);
        if (!group) return res.status(404).json({ error: 'Grupo nao encontrado' });
        res.json({ success: true, deleted: group });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// CATEGORIAS
// ==========================================

router.get('/groups/:id/categories', verifyToken(), verifyModule('service_notes'), async (req, res) => {
    try {
        const categories = await listCategoriesByGroup(req.params.id);
        res.json(categories);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/groups/:id/categories', verifyToken(), verifyModule('create_service_note'), async (req, res) => {
    try {
        const { name, color } = req.body;
        if (!name) return res.status(400).json({ error: 'Nome obrigatorio' });
        const cat = await createCategory({ group_id: req.params.id, name, color });
        res.status(201).json(cat);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/categories/:id', verifyToken(), verifyModule('delete_service_note'), async (req, res) => {
    try {
        const cat = await deleteCategory(req.params.id);
        if (!cat) return res.status(404).json({ error: 'Categoria nao encontrada' });
        res.json({ success: true, deleted: cat });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// NOTAS DE SERVICO
// ==========================================

router.get('/', verifyToken(), verifyModule('service_notes'), async (req, res) => {
    try {
        const { groupId, status, assignedTo, archived, unassigned, categoryId, createdFrom, createdTo, completedFrom, completedTo } = req.query;
        const notes = await listServiceNotes({
            groupId: groupId ? parseInt(groupId) : undefined,
            status: status || undefined,
            assignedTo: assignedTo || undefined,
            archived: archived === 'all' ? undefined : archived === 'true',
            unassigned: unassigned === 'true',
            categoryId: categoryId ? parseInt(categoryId) : undefined,
            createdFrom: createdFrom || undefined,
            createdTo: createdTo || undefined,
            completedFrom: completedFrom || undefined,
            completedTo: completedTo || undefined,
        });
        res.json(notes);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:id', verifyToken(), verifyModule('service_notes'), async (req, res) => {
    try {
        const note = await getServiceNoteById(req.params.id);
        if (!note) return res.status(404).json({ error: 'Nota nao encontrada' });
        res.json(note);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', verifyToken(), verifyModule('create_service_note'), async (req, res) => {
    try {
        const { group_id, title, description, coordinates, address, marker_category_id } = req.body;
        if (!group_id || !title) return res.status(400).json({ error: 'group_id e title obrigatorios' });
        const note = await createServiceNote({ group_id, title, description, coordinates, address, marker_category_id });
        res.status(201).json(note);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id', verifyToken(), verifyModule('update_service_note'), async (req, res) => {
    try {
        const note = await updateServiceNote(req.params.id, req.body);
        if (!note) return res.status(404).json({ error: 'Nota nao encontrada' });
        res.json(note);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', verifyToken(), verifyModule('delete_service_note'), async (req, res) => {
    try {
        const note = await deleteServiceNote(req.params.id);
        if (!note) return res.status(404).json({ error: 'Nota nao encontrada' });
        res.json({ success: true, deleted: note });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// ATRIBUICAO
// ==========================================

router.put('/:id/assign', verifyToken(), verifyModule('assign_service_notes'), async (req, res) => {
    try {
        const { userId } = req.body;
        await assignServiceNote(req.params.id, userId || null, req.user.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/bulk-assign', verifyToken(), verifyModule('assign_service_notes'), async (req, res) => {
    try {
        const { serviceIds, userId } = req.body;
        if (!serviceIds || !Array.isArray(serviceIds)) return res.status(400).json({ error: 'serviceIds obrigatorio (array)' });
        await bulkAssign(serviceIds, userId || null, req.user.id);
        res.json({ success: true, count: serviceIds.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/bulk-category', verifyToken(), verifyModule('update_service_note'), async (req, res) => {
    try {
        const { serviceIds, markerCategoryId } = req.body;
        if (!serviceIds || !Array.isArray(serviceIds)) return res.status(400).json({ error: 'serviceIds obrigatorio' });
        await bulkUpdateCategory(serviceIds, markerCategoryId || null);
        res.json({ success: true, count: serviceIds.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/bulk-delete', verifyToken(), verifyModule('delete_service_note'), async (req, res) => {
    try {
        const { serviceIds } = req.body;
        if (!serviceIds || !Array.isArray(serviceIds)) return res.status(400).json({ error: 'serviceIds obrigatorio' });
        await bulkDelete(serviceIds);
        res.json({ success: true, count: serviceIds.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/bulk-archive', verifyToken(), verifyModule('update_service_note'), async (req, res) => {
    try {
        const { serviceIds } = req.body;
        if (!serviceIds || !Array.isArray(serviceIds)) return res.status(400).json({ error: 'serviceIds obrigatorio' });
        await bulkArchive(serviceIds);
        res.json({ success: true, count: serviceIds.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/bulk-unarchive', verifyToken(), verifyModule('update_service_note'), async (req, res) => {
    try {
        const { serviceIds } = req.body;
        if (!serviceIds || !Array.isArray(serviceIds)) return res.status(400).json({ error: 'serviceIds obrigatorio' });
        await bulkUnarchive(serviceIds);
        res.json({ success: true, count: serviceIds.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/bulk-move', verifyToken(), verifyModule('update_service_note'), async (req, res) => {
    try {
        const { serviceIds, targetGroupId } = req.body;
        if (!serviceIds || !Array.isArray(serviceIds) || !targetGroupId) return res.status(400).json({ error: 'serviceIds e targetGroupId obrigatorios' });
        await bulkMove(serviceIds, targetGroupId);
        res.json({ success: true, count: serviceIds.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id/complete', verifyToken(), verifyModule('update_service_note'), async (req, res) => {
    try {
        const { completionData } = req.body;
        const note = await adminCompleteNote(req.params.id, { adminId: req.user.id, completionData });
        if (!note) return res.status(404).json({ error: 'Nota nao encontrada' });
        res.json(note);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// IMPORTACAO
// ==========================================

router.post('/import', verifyToken(), verifyModule('import_service_notes'), upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Arquivo obrigatorio' });
        const { groupId, coordinatesColumn } = req.body;
        if (!groupId) return res.status(400).json({ error: 'groupId obrigatorio' });

        const XLSX = require('xlsx');
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

        const titleKeys = ['title', 'titulo', 'nome'];
        const descKeys = ['description', 'descricao', 'obs'];
        const addrKeys = ['address', 'endereco'];

        const notes = rows.map(row => {
            const lowerRow = {};
            Object.keys(row).forEach(k => { lowerRow[k.toLowerCase().trim()] = row[k]; });

            const title = titleKeys.map(k => lowerRow[k]).find(v => v) || 'Sem Titulo';
            const description = descKeys.map(k => lowerRow[k]).find(v => v) || '';
            const address = addrKeys.map(k => lowerRow[k]).find(v => v) || '';
            const coordinates = coordinatesColumn ? row[coordinatesColumn] : undefined;

            return { title, description, address, coordinates: coordinates ? String(coordinates) : undefined, custom_fields: row };
        });

        const inserted = await bulkInsertServiceNotes(parseInt(groupId), notes);
        res.json({ success: true, imported: inserted.length });
    } catch (err) {
        console.error('[SERVICE_NOTES] Erro importacao:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;