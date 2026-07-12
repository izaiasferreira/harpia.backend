const express = require('express');
const router = express.Router();
const multer = require('multer');
const { telegramAuth } = require('../middlewares/telegramAuth');
const {
    get_equipment_by_agent,
    create_equipment_request,
    unassign_equipment,
    list_available_equipment,
} = require('../functions/database/equipment');

// Multer em memória — igual ao profile upload
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(telegramAuth);

// GET /agent/equipment/mine — equipamentos do agente logado
router.get('/mine', async (req, res) => {
    try {
        const agente = req.colaborador?.id;
        if (!agente) return res.status(401).json({ error: 'Não autenticado' });
        const data = await get_equipment_by_agent(agente);
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /agent/equipment/available — equipamentos disponíveis para solicitar
router.get('/available', async (req, res) => {
    try {
        const agente = req.colaborador;
        const { tipo, search, page, limit } = req.query;
        const estado = req.query.estado || agente?.estado;
        const data = await list_available_equipment({ tipo, estado, search, page, limit });
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /agent/equipment/:id/request — solicitar equipamento com foto + GPS obrigatórios
// Content-Type: multipart/form-data
// Campos: foto (file), latitude (text), longitude (text), observacao (text, opcional)
router.post('/:id/request', upload.single('foto'), async (req, res) => {
    try {
        const agente = req.colaborador;
        if (!agente) return res.status(401).json({ error: 'Não autenticado' });

        // Valida foto obrigatória
        if (!req.file) {
            return res.status(400).json({ error: 'Foto de comprovação é obrigatória' });
        }

        const { latitude, longitude, observacao } = req.body;

        const data = await create_equipment_request({
            equipment_id:     req.params.id,
            agente:           agente.id,
            foto_buffer:      req.file.buffer,
            foto_mime:        req.file.mimetype,
            latitude:         latitude ? parseFloat(latitude) : null,
            longitude:        longitude ? parseFloat(longitude) : null,
            observacao_agente: observacao || null,
        });

        res.status(201).json(data);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// POST /agent/equipment/:id/unassign — solicitar devolução de equipamento
router.post('/:id/unassign', upload.single('foto'), async (req, res) => {
    try {
        const agente = req.colaborador;
        if (!agente) return res.status(401).json({ error: 'Não autenticado' });

        if (!req.file) {
            return res.status(400).json({ error: 'Foto de comprovação é obrigatória' });
        }

        const { latitude, longitude, observacao } = req.body;

        const data = await create_equipment_request({
            equipment_id:     req.params.id,
            agente:           agente.id,
            foto_buffer:      req.file.buffer,
            foto_mime:        req.file.mimetype,
            latitude:         latitude ? parseFloat(latitude) : null,
            longitude:        longitude ? parseFloat(longitude) : null,
            observacao_agente: observacao || null,
            tipo_solicitacao: 'devolucao',
        });
        res.json(data);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

module.exports = router;
