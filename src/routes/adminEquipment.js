const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const {
    list_equipment,
    get_equipment_stats,
    get_equipment_by_id,
    get_equipment_by_agent,
    create_equipment,
    update_equipment,
    delete_equipment,
    get_equipment_history_full,
    create_equipment_request,
    list_pending_requests,
    approve_equipment_request,
    reject_equipment_request,
    EQUIPMENT_STATUS,
    EQUIPMENT_CONDICAO,
} = require('../functions/database/equipment');

// Todas as rotas requerem token válido
router.use(verifyToken());

// GET /admin/equipment/agents/search — buscar agentes (nome, matrícula/id) para associação
router.get('/agents/search', verifyModule('assign_equipment'), async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.trim().length < 2) {
            return res.json([]);
        }
        const { sinergia_pool } = require('../db');
        const term = `%${q.trim().toUpperCase()}%`;
        const { rows } = await sinergia_pool.query(`
            SELECT "ID" AS id, "Nome" AS nome, "regional", "seccional", estado
            FROM colaboradores
            WHERE "ID" LIKE $1 OR UPPER("Nome") LIKE $1
            LIMIT 15
        `, [term]);
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── Listagem e consulta ──────────────────────────────────────────────────────

// GET /admin/equipment — lista todos os equipamentos com filtros e paginação
router.get('/', verifyModule('equipments'), async (req, res) => {
    try {
        const { estado, tipo, status, condicao, search, page, limit } = req.query;
        const result = await list_equipment({ 
            estado, tipo, status, condicao, search, page, limit, 
            userRole: req.user.role, 
            userPermissions: req.user.permissions 
        });
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /admin/equipment/stats — estatísticas gerais de inventário
router.get('/stats', verifyModule('equipments'), async (req, res) => {
    try {
        const stats = await get_equipment_stats();
        res.json(stats);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /admin/equipment/options — valores possíveis para filtros/selects + config completa dos tipos
router.get('/options', verifyModule('equipments'), async (req, res) => {
    try {
        const { getEquipmentTypes } = require('../functions/database/equipmentTypes');
        const tiposConfig = await getEquipmentTypes();
        const tiposIds = Object.keys(tiposConfig);
        res.json({ tipos: tiposIds, tiposConfig, status: EQUIPMENT_STATUS, condicoes: EQUIPMENT_CONDICAO });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /admin/equipment/requests — lista solicitações pendentes de agentes
router.get('/requests', verifyModule('approve_equipment_request'), async (req, res) => {
    try {
        const { estado, page, limit } = req.query;
        const result = await list_pending_requests({ 
            estado, page, limit, 
            userRole: req.user.role, 
            userPermissions: req.user.permissions 
        });
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /admin/equipment/agent/:agente — equipamentos de um agente específico
router.get('/agent/:agente', verifyModule('equipments'), async (req, res) => {
    try {
        const data = await get_equipment_by_agent(req.params.agente);
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /admin/equipment/:id — detalhes de um equipamento
router.get('/:id', verifyModule('equipments'), async (req, res) => {
    try {
        const data = await get_equipment_by_id(req.params.id);
        if (!data) return res.status(404).json({ error: 'Equipamento não encontrado' });
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /admin/equipment/:id/history — histórico de associações + solicitações
router.get('/:id/history', verifyModule('view_equipment_history'), async (req, res) => {
    try {
        const data = await get_equipment_history_full(req.params.id);
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── CRUD de Equipamentos ─────────────────────────────────────────────────────

// POST /admin/equipment — cadastrar novo equipamento
router.post('/', verifyModule('create_equipment'), async (req, res) => {
    try {
        const data = await create_equipment({ 
            ...req.body, 
            criado_por: req.user?.id ? String(req.user.id) : null 
        });
        res.status(201).json(data);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// PUT /admin/equipment/:id — editar equipamento
router.put('/:id', verifyModule('update_equipment'), async (req, res) => {
    try {
        let updateData = req.body;
        if (req.user?.role !== 'COMPANY_ADMIN') {
            const allowedFields = ['condicao', 'status', 'estado', 'regional', 'seccional'];
            updateData = {};
            allowedFields.forEach(f => {
                if (req.body[f] !== undefined) {
                    updateData[f] = req.body[f];
                }
            });
        }
        const data = await update_equipment(req.params.id, updateData);
        res.json(data);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// DELETE /admin/equipment/:id — excluir equipamento
router.delete('/:id', verifyModule('delete_equipment'), async (req, res) => {
    try {
        const data = await delete_equipment(req.params.id);
        res.json(data);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// ─── Associações ─────────────────────────────────────────────────────────────

// POST /admin/equipment/:id/assign — criar solicitação de associação de equipamento a agente
router.post('/:id/assign', verifyModule('request_equipment_assignment'), upload.single('foto'), async (req, res) => {
    try {
        const { agente, observacao, latitude, longitude } = req.body;
        if (!agente) return res.status(400).json({ error: 'Agente é obrigatório' });
        if (!req.file) return res.status(400).json({ error: 'Foto de comprovação é obrigatória' });

        const data = await create_equipment_request({
            equipment_id: req.params.id,
            agente,
            foto_buffer: req.file.buffer,
            foto_mime: req.file.mimetype,
            latitude: latitude ? parseFloat(latitude) : null,
            longitude: longitude ? parseFloat(longitude) : null,
            observacao_agente: observacao || null,
        });
        res.status(201).json(data);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// POST /admin/equipment/:id/unassign — desassociar equipamento
// POST /admin/equipment/:id/unassign — solicitar devolução de equipamento
router.post('/:id/unassign', verifyModule('unassign_equipment'), upload.single('foto'), async (req, res) => {
    try {
        const { agente, observacao, latitude, longitude } = req.body;
        if (!agente) return res.status(400).json({ error: 'Agente é obrigatório' });
        if (!req.file) return res.status(400).json({ error: 'Foto de comprovação é obrigatória' });

        const data = await create_equipment_request({
            equipment_id: req.params.id,
            agente,
            foto_buffer: req.file.buffer,
            foto_mime: req.file.mimetype,
            latitude: latitude ? parseFloat(latitude) : null,
            longitude: longitude ? parseFloat(longitude) : null,
            observacao_agente: observacao || null,
            tipo_solicitacao: 'devolucao',
        });
        res.json(data);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// ─── Aprovação de Solicitações ────────────────────────────────────────────────

// POST /admin/equipment/requests/:id/approve
router.post('/requests/:id/approve', verifyModule('approve_equipment_request'), async (req, res) => {
    try {
        const data = await approve_equipment_request({
            request_id:        req.params.id,
            aprovado_por:      req.user?.id,
            aprovado_por_nome: req.user?.nome || req.user?.name,
        });
        res.json(data);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// POST /admin/equipment/requests/:id/reject
router.post('/requests/:id/reject', verifyModule('approve_equipment_request'), async (req, res) => {
    try {
        const { observacao_admin } = req.body;
        const data = await reject_equipment_request({
            request_id:          req.params.id,
            rejeitado_por:       req.user?.id,
            rejeitado_por_nome:  req.user?.nome || req.user?.name,
            observacao_admin,
        });
        res.json(data);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

module.exports = router;
