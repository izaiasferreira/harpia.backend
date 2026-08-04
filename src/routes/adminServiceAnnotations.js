const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const {
    create_service_annotation,
    get_service_annotations_admin,
    get_service_annotation_by_id,
    resolve_service_annotation,
    reopen_service_annotation,
    delete_service_annotation,
    archive_service_annotation,
    unarchive_service_annotation,
} = require('../functions/database/serviceAnnotations');
const { processServiceAnnotationImport } = require('../functions/database/serviceAnnotationImport');
const { serviceAnnotationResolveSchema } = require('../db/schemas/serviceAnnotations');
const { validate } = require('../middlewares/validate');

// GET /admin/service_annotations — lista anotações de serviço
router.get('/', verifyToken(), verifyModule('service_annotations'), async (req, res) => {
    try {
        const { estado, status, search, page, limit } = req.query;
        const result = await get_service_annotations_admin({
            user: req.user,
            estado: estado || null,
            status: status || null,
            search: search || null,
            page: page ? parseInt(page) : 1,
            limit: limit ? parseInt(limit) : 50,
        });
        res.json(result);
    } catch (err) {
        console.error('[SERVICE ANNOTATIONS] Erro ao listar:', err);
        res.status(500).json({ error: 'Erro ao listar anotações de serviço' });
    }
});

// POST /admin/service_annotations — criar anotação de serviço (admin)
router.post('/', verifyToken(), verifyModule('create_service_annotation'), async (req, res) => {
    try {
        const { tipo, identificacao_tipo, identificacao_valor, descricao, latitude, longitude, estado, regional, seccional, foto, expires_at } = req.body;
        if (!tipo) return res.status(400).json({ error: 'Tipo é obrigatório' });
        if (!descricao || !descricao.trim()) return res.status(400).json({ error: 'Descrição é obrigatória' });
        if (!estado || !regional || !seccional) {
            return res.status(400).json({ error: 'Estado, regional e seccional são obrigatórios' });
        }
        const autor = req.user.nome || req.user.id;
        const result = await create_service_annotation({
            autor, tipo, identificacao_tipo, identificacao_valor, descricao, latitude, longitude, estado, regional, seccional, foto, expires_at
        });
        res.json(result);
    } catch (err) {
        console.error('[ADMIN CREATE SERVICE ANNOTATION] Erro ao criar:', err);
        res.status(500).json({ error: err.message || 'Erro ao criar anotação de serviço' });
    }
});

// POST /admin/service_annotations/import — importação em massa de anotações (XLSX)
router.post('/import', verifyToken(), verifyModule('create_service_annotation'), upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
        }
        const result = await processServiceAnnotationImport(req.file.buffer, req.user);
        res.json(result);
    } catch (err) {
        console.error('[IMPORT SERVICE ANNOTATIONS]', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /admin/service_annotations/:id — obtém uma anotação com evidências
router.get('/:id', verifyToken(), verifyModule('service_annotations'), async (req, res) => {
    try {
        const { id } = req.params;
        const annotation = await get_service_annotation_by_id(parseInt(id));
        if (!annotation) return res.status(404).json({ error: 'Anotação não encontrada' });
        res.json(annotation);
    } catch (err) {
        console.error('[SERVICE ANNOTATIONS] Erro ao obter:', err);
        res.status(500).json({ error: 'Erro ao obter anotação' });
    }
});

// POST /admin/service_annotations/:id/resolve — marcar como tratada
router.post('/:id/resolve', verifyToken(), verifyModule('resolve_service_annotation'), validate(serviceAnnotationResolveSchema), async (req, res) => {
    try {
        const { id } = req.params;
        const { descricao_solucao, evidencias } = req.body;

        const resolved = await resolve_service_annotation({
            id: parseInt(id),
            resolvido_por: req.user.id,
            resolvido_por_nome: req.user.nome || req.user.id,
            descricao_solucao,
            evidencias: evidencias || [],
        });

        if (!resolved) return res.status(404).json({ error: 'Anotação não encontrada' });
        res.json(resolved);
    } catch (err) {
        console.error('[SERVICE ANNOTATIONS] Erro ao resolver:', err);
        res.status(500).json({ error: 'Erro ao resolver anotação' });
    }
});

// POST /admin/service_annotations/:id/reopen — reabrir anotação
router.post('/:id/reopen', verifyToken(), verifyModule('resolve_service_annotation'), async (req, res) => {
    try {
        const { id } = req.params;
        const reopened = await reopen_service_annotation(parseInt(id));
        if (!reopened) return res.status(404).json({ error: 'Anotação não encontrada' });
        res.json(reopened);
    } catch (err) {
        console.error('[SERVICE ANNOTATIONS] Erro ao reabrir:', err);
        res.status(500).json({ error: 'Erro ao reabrir anotação' });
    }
});

// POST /admin/service_annotations/:id/archive — arquivar anotação (some dos agentes)
router.post('/:id/archive', verifyToken(), verifyModule('delete_service_annotation'), async (req, res) => {
    try {
        const { id } = req.params;
        const archived = await archive_service_annotation(parseInt(id));
        if (!archived) return res.status(404).json({ error: 'Anotação não encontrada' });
        res.json(archived);
    } catch (err) {
        console.error('[SERVICE ANNOTATIONS] Erro ao arquivar:', err);
        res.status(500).json({ error: 'Erro ao arquivar anotação' });
    }
});

// POST /admin/service_annotations/:id/unarchive — desarquivar anotação (volta para os agentes)
router.post('/:id/unarchive', verifyToken(), verifyModule('delete_service_annotation'), async (req, res) => {
    try {
        const { id } = req.params;
        const unarchived = await unarchive_service_annotation(parseInt(id));
        if (!unarchived) return res.status(404).json({ error: 'Anotação não encontrada' });
        res.json(unarchived);
    } catch (err) {
        console.error('[SERVICE ANNOTATIONS] Erro ao desarquivar:', err);
        res.status(500).json({ error: 'Erro ao desarquivar anotação' });
    }
});

// DELETE /admin/service_annotations/:id — excluir anotação
router.delete('/:id', verifyToken(), verifyModule('delete_service_annotation'), async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await delete_service_annotation(parseInt(id));
        if (!deleted) return res.status(404).json({ error: 'Anotação não encontrada' });
        res.json({ success: true, id: parseInt(id) });
    } catch (err) {
        console.error('[SERVICE ANNOTATIONS] Erro ao excluir:', err);
        res.status(500).json({ error: 'Erro ao excluir anotação' });
    }
});

module.exports = router;
