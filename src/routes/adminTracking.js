const express = require('express');
const router = express.Router();
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const {
    ensureTrackingTables,
    getAgentsLastPosition,
    getAgentTrail,
    getSpeedViolations,
    getFallIncidents,
    updateFallIncidentStatus,
    getAlertLogs,
} = require('../functions/database/tracking');

// GET /admin/tracking/agents — lista agentes com última posição
router.get('/agents', verifyToken(), verifyModule('tracking'), async (req, res) => {
    try {
        await ensureTrackingTables();
        const agents = await getAgentsLastPosition();
        res.json(agents);
    } catch (err) {
        console.error('[TRACKING] Erro ao listar agentes:', err);
        res.status(500).json({ error: 'Erro ao listar posições' });
    }
});

// GET /admin/tracking/agent/:id/trail — trajeto de um agente
router.get('/agent/:id/trail', verifyToken(), verifyModule('tracking'), async (req, res) => {
    try {
        await ensureTrackingTables();
        const { id } = req.params;
        const { from, to } = req.query;
        const trail = await getAgentTrail(id, from || null, to || null);
        res.json(trail);
    } catch (err) {
        console.error('[TRACKING] Erro ao buscar trajeto:', err);
        res.status(500).json({ error: 'Erro ao buscar trajeto' });
    }
});

// GET /admin/tracking/speed_violations — lista infrações de velocidade
router.get('/speed_violations', verifyToken(), verifyModule('tracking'), async (req, res) => {
    try {
        await ensureTrackingTables();
        const { agent_id, from, to } = req.query;
        const violations = await getSpeedViolations({
            agentId: agent_id || null,
            dateFrom: from || null,
            dateTo: to || null,
        });
        res.json(violations);
    } catch (err) {
        console.error('[TRACKING] Erro ao listar violações:', err);
        res.status(500).json({ error: 'Erro ao listar violações de velocidade' });
    }
});

// GET /admin/tracking/fall_incidents — lista incidentes de queda
router.get('/fall_incidents', verifyToken(), verifyModule('tracking'), async (req, res) => {
    try {
        await ensureTrackingTables();
        const { status, agent_id, from } = req.query;
        const incidents = await getFallIncidents({
            status: status || null,
            agentId: agent_id || null,
            dateFrom: from || null,
        });
        res.json(incidents);
    } catch (err) {
        console.error('[TRACKING] Erro ao listar incidentes:', err);
        res.status(500).json({ error: 'Erro ao listar incidentes de queda' });
    }
});

// PUT /admin/tracking/fall_incidents/:id — validar/rejeitar incidente
router.put('/fall_incidents/:id', verifyToken(), verifyModule('tracking'), async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;

        if (!['confirmed', 'false_positive'].includes(status)) {
            return res.status(400).json({ error: 'Status deve ser "confirmed" ou "false_positive"' });
        }

        const incident = await updateFallIncidentStatus(id, status, notes);
        if (!incident) {
            return res.status(404).json({ error: 'Incidente não encontrado' });
        }

        res.json(incident);
    } catch (err) {
        console.error('[TRACKING] Erro ao atualizar incidente:', err);
        res.status(500).json({ error: 'Erro ao atualizar incidente' });
    }
});

// GET /admin/tracking/alerts — log de alertas para auditoria
router.get('/alerts', verifyToken(), verifyModule('tracking'), async (req, res) => {
    try {
        await ensureTrackingTables();
        const { agent_id, type, from, to } = req.query;
        const alerts = await getAlertLogs({
            agentId: agent_id || null,
            type: type || null,
            dateFrom: from || null,
            dateTo: to || null,
        });
        res.json(alerts);
    } catch (err) {
        console.error('[TRACKING] Erro ao listar alertas:', err);
        res.status(500).json({ error: 'Erro ao listar alertas' });
    }
});

module.exports = router;
