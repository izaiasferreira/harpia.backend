const express = require('express');
const router = express.Router();
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const { getAgentsHeartbeat } = require('../functions/database/heartbeat');

// GET /admin/tracking/agents-v2 — lista agentes com heartbeat (online/last seen + localização)
router.get('/agents-v2', verifyToken(), verifyModule('tracking'), async (req, res) => {
    try {
        const agents = await getAgentsHeartbeat();
        res.json(agents);
    } catch (err) {
        console.error('[HEARTBEAT] Erro ao listar agentes:', err);
        res.status(500).json({ error: 'Erro ao listar heartbeats' });
    }
});

module.exports = router;
