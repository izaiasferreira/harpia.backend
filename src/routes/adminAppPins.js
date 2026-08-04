const express = require('express');
const { validate } = require('../middlewares/validate');
const z = require('zod');

const router = express.Router();
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const {
    findAgentById,
    invalidateExistingPins,
    invalidateAgentSessions,
    createPin,
    listPins,
    deletePinById,
    generateBulkPins,
    getSessionHistory,
} = require('../functions/database/appPins');

// GET /admin/agent/:id/session_history
router.get('/:id/session_history', verifyToken(), verifyModule('app_pins'), async (req, res) => {
    try {
        const { id } = req.params;
        const history = await getSessionHistory(id);
        res.json(history);
    } catch (err) {
        console.error('[GET_SESSION_HISTORY] Erro:', err);
        res.status(500).json({ error: 'Erro ao buscar histórico de sessões' });
    }
});

// POST /admin/agent/generate_app_pin
router.post('/generate_app_pin', verifyToken(), verifyModule('app_pins'), validate(z.object({ agent_id: z.string().min(1) })), async (req, res) => {
    try {
        const { agent_id } = req.body;

        if (!agent_id) {
            return res.status(400).json({ error: 'agent_id é obrigatório' });
        }

        const agent = await findAgentById(agent_id);
        if (!agent) {
            return res.status(404).json({ error: 'Agente não encontrado' });
        }

        await invalidateExistingPins(agent.id);
        await invalidateAgentSessions(agent.id);

        const pin = String(Math.floor(100000 + Math.random() * 900000));
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

        await createPin(agent.id, pin, expiresAt, req.user);

        res.json({
            pin,
            agent,
            expires_at: expiresAt.toISOString()
        });
    } catch (err) {
        console.error('[GENERATE_PIN] Erro:', err);
        res.status(500).json({ error: 'Erro ao gerar PIN' });
    }
});

// POST /admin/agent/invalidate_session
router.post('/invalidate_session', verifyToken(), verifyModule('app_pins'), validate(z.object({ agent_id: z.string().min(1) })), async (req, res) => {
    try {
        const { agent_id } = req.body;
        const agent = await findAgentById(agent_id);
        if (!agent) {
            return res.status(404).json({ error: 'Agente não encontrado' });
        }

        await invalidateAgentSessions(agent.id, req.user);

        res.json({ success: true, message: 'Sessão invalidada com sucesso.' });
    } catch (err) {
        console.error('[INVALIDATE_SESSION] Erro:', err);
        res.status(500).json({ error: 'Erro ao invalidar sessão' });
    }
});

// POST /admin/agent/generate_app_pins_bulk
router.post('/generate_app_pins_bulk', verifyToken('COMPANY_ADMIN'), verifyModule('app_pins'), validate(z.object({ agent_ids: z.array(z.string().min(1)).min(1) })), async (req, res) => {
    try {
        const { agent_ids } = req.body;
        const results = await generateBulkPins(agent_ids);
        res.json({ results });
    } catch (err) {
        console.error('[GENERATE_BULK_PINS] Erro:', err);
        res.status(500).json({ error: 'Erro ao gerar PINs em massa' });
    }
});

// GET /admin/agent/app_pins
router.get('/app_pins', verifyToken(), verifyModule('app_pins'), async (req, res) => {
    try {
        const pins = await listPins(50, req.user);
        res.json(pins);
    } catch (err) {
        console.error('[LIST_PINS] Erro:', err);
        res.status(500).json({ error: 'Erro ao listar PINs' });
    }
});

// DELETE /admin/agent/app_pins/:id
router.delete('/app_pins/:id', verifyToken(), verifyModule('app_pins'), async (req, res) => {
    try {
        const { id } = req.params;
        await deletePinById(id);
        res.json({ success: true });
    } catch (err) {
        console.error('[DELETE_PIN] Erro:', err);
        res.status(500).json({ error: 'Erro ao deletar PIN' });
    }
});

module.exports = router;
