const express = require('express');
const { validate } = require('../middlewares/validate');
const z = require('zod');

const router = express.Router();
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const {
    findAgentById,
    invalidateExistingLogoutPins,
    createLogoutPin,
    listLogoutPins,
} = require('../functions/database/appLogoutPins');

// POST /admin/logout-pins/generate
router.post('/generate', verifyToken(), verifyModule('app_pins'), validate(z.object({ agent_id: z.string().min(1) })), async (req, res) => {
    try {
        const { agent_id } = req.body;

        if (!agent_id) {
            return res.status(400).json({ error: 'agent_id é obrigatório' });
        }

        const agent = await findAgentById(agent_id);
        if (!agent) {
            return res.status(404).json({ error: 'Agente não encontrado' });
        }

        await invalidateExistingLogoutPins(agent.id);

        const pin = String(Math.floor(100000 + Math.random() * 900000));
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await createLogoutPin(agent.id, pin, expiresAt, req.user);

        res.json({
            pin,
            agent,
            expires_at: expiresAt.toISOString()
        });
    } catch (err) {
        console.error('[GENERATE_LOGOUT_PIN] Erro:', err);
        res.status(500).json({ error: 'Erro ao gerar PIN de logout' });
    }
});

// GET /admin/logout-pins
router.get('/', verifyToken(), verifyModule('app_pins'), async (req, res) => {
    try {
        const pins = await listLogoutPins(50, req.user);
        res.json(pins);
    } catch (err) {
        console.error('[LIST_LOGOUT_PINS] Erro:', err);
        res.status(500).json({ error: 'Erro ao listar PINs de logout' });
    }
});

module.exports = router;
