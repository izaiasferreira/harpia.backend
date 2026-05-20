const express = require('express');
const router = express.Router();
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const {
    ensureAppPinsTable,
    findAgentById,
    invalidateExistingPins,
    createPin,
    listPins,
    deletePinById,
} = require('../functions/database/appPins');

// POST /admin/agent/generate_app_pin
router.post('/generate_app_pin', verifyToken(), verifyModule('app_pins'), async (req, res) => {
    try {
        const { agent_id } = req.body;

        if (!agent_id) {
            return res.status(400).json({ error: 'agent_id é obrigatório' });
        }

        const agent = await findAgentById(agent_id);
        if (!agent) {
            return res.status(404).json({ error: 'Agente não encontrado' });
        }

        await ensureAppPinsTable();
        await invalidateExistingPins(agent.id);

        const pin = String(Math.floor(100000 + Math.random() * 900000));
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

        await createPin(agent.id, pin, expiresAt);

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

// GET /admin/agent/app_pins
router.get('/app_pins', verifyToken(), verifyModule('app_pins'), async (req, res) => {
    try {
        await ensureAppPinsTable();
        const pins = await listPins();
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
