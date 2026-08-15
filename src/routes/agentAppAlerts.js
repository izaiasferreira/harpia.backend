const express = require('express');
const router = express.Router();
const { telegramAuth } = require('../middlewares/telegramAuth');
const { getAlertsForAgent, recordView } = require('../functions/database/appAlerts');

// GET /agent/app-alerts — retorna alertas elegíveis para o agente autenticado
router.get('/', telegramAuth, async (req, res) => {
    try {
        const agentId = req.colaborador.id;
        const agentEstado = req.colaborador.estado;
        const alerts = await getAlertsForAgent(agentId, agentEstado);
        res.json(alerts);
    } catch (err) {
        console.error('[AGENT_APP_ALERTS] GET /', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /agent/app-alerts/:id/view — registra visualização
router.post('/:id/view', telegramAuth, async (req, res) => {
    try {
        const agentId = req.colaborador.id;
        const alertId = req.params.id;
        await recordView(alertId, agentId);
        res.json({ success: true });
    } catch (err) {
        console.error('[AGENT_APP_ALERTS] POST view', err);
        // Falha silenciosa — não impede o agente de usar o app
        res.json({ success: false });
    }
});

module.exports = router;
