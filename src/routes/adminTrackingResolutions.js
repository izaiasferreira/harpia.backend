const express = require('express');
const router = express.Router();
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const {
    resolveSpeedViolation,
    updateSpeedViolationResolution,
    deleteSpeedViolationResolution,
    listSpeedViolationResolutions,
    getSpeedViolationsResolvable,
    getSpeedViolationMonthlyStats,
} = require('../functions/database/trackingResolutions');

// GET /admin/tracking/speed_violations/all
// Todas as violações de um intervalo (sem limite) com status de resolução embutido.
router.get('/speed_violations/all', verifyToken(), verifyModule('tracking_speed'), async (req, res) => {
    try {
        const { agent_id, from, to } = req.query;
        const violations = await getSpeedViolationsResolvable({
            agentId: agent_id || null,
            dateFrom: from || null,
            dateTo: to || null,
        }, req.user);
        res.json(violations);
    } catch (err) {
        console.error('[TRACKING] Erro ao listar violações completas:', err);
        res.status(500).json({ error: 'Erro ao listar violações de velocidade' });
    }
});

// GET /admin/tracking/speed_violations/resolutions
// Histórico de resoluções (filtro por agente e intervalo de data).
router.get('/speed_violations/resolutions', verifyToken(), verifyModule('tracking_speed'), async (req, res) => {
    try {
        const { agent_id, from, to } = req.query;
        const resolutions = await listSpeedViolationResolutions({
            agentId: agent_id || null,
            dateFrom: from || null,
            dateTo: to || null,
        }, req.user);
        res.json(resolutions);
    } catch (err) {
        console.error('[TRACKING] Erro ao listar resoluções:', err);
        res.status(500).json({ error: 'Erro ao listar resoluções de velocidade' });
    }
});

// GET /admin/tracking/speed_violations/stats
// Estatísticas mensais. "1 infração" = 1 par [agente + data].
router.get('/speed_violations/stats', verifyToken(), verifyModule('tracking_speed'), async (req, res) => {
    try {
        const { month } = req.query;
        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
            return res.status(400).json({ error: 'Mês inválido. Use o formato YYYY-MM' });
        }
        const stats = await getSpeedViolationMonthlyStats({ month, user: req.user });
        res.json(stats);
    } catch (err) {
        console.error('[TRACKING] Erro ao buscar estatísticas mensais:', err);
        res.status(500).json({ error: 'Erro ao buscar estatísticas de velocidade' });
    }
});

// POST /admin/tracking/speed_violations/resolve
// Resolve TODAS as infrações de um agente em uma data (1 foto + veredito + descrição).
router.post('/speed_violations/resolve', verifyToken(), verifyModule('resolve_speed_violation'), async (req, res) => {
    try {
        const { agent_id, date, is_valid, description, photo_url, violation_ids } = req.body;

        if (!agent_id) return res.status(400).json({ error: 'Agente é obrigatório' });
        if (!date) return res.status(400).json({ error: 'Data é obrigatória' });
        if (typeof is_valid !== 'boolean') return res.status(400).json({ error: 'Veredito (is_valid) é obrigatório' });
        if (!description || !description.trim()) return res.status(400).json({ error: 'Descrição do que foi feito é obrigatória' });
        if (!photo_url || !photo_url.trim()) return res.status(400).json({ error: 'Foto de evidência é obrigatória' });
        if (!Array.isArray(violation_ids) || violation_ids.length === 0) {
            return res.status(400).json({ error: 'Lista de pontos solucionados (violation_ids) é obrigatória' });
        }

        const normalizedIds = [...new Set(violation_ids.map(Number).filter(n => Number.isInteger(n) && n > 0))];
        if (normalizedIds.length === 0) {
            return res.status(400).json({ error: 'violation_ids inválidos' });
        }

        const resolution = await resolveSpeedViolation({
            agentId: agent_id.trim().toUpperCase(),
            date,
            isValid: is_valid,
            description: description.trim(),
            photoUrl: photo_url.trim(),
            violationIds: normalizedIds,
            user: req.user,
        });
        res.status(201).json(resolution);
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Já existe resolução para este agente nesta data' });
        }
        console.error('[TRACKING] Erro ao resolver violação:', err);
        res.status(500).json({ error: 'Erro ao resolver violação de velocidade' });
    }
});

// PUT /admin/tracking/speed_violations/resolutions/:id
// Edita uma resolução existente (grava quem editou).
router.put('/speed_violations/resolutions/:id', verifyToken(), verifyModule('update_speed_violation_resolution'), async (req, res) => {
    try {
        const { id } = req.params;
        const { is_valid, description, photo_url, violation_ids } = req.body;

        if (typeof is_valid !== 'boolean') return res.status(400).json({ error: 'Veredito (is_valid) é obrigatório' });
        if (!description || !description.trim()) return res.status(400).json({ error: 'Descrição é obrigatória' });
        if (!photo_url || !photo_url.trim()) return res.status(400).json({ error: 'Foto de evidência é obrigatória' });

        let normalizedIds = null;
        if (violation_ids !== undefined) {
            if (!Array.isArray(violation_ids) || violation_ids.length === 0) {
                return res.status(400).json({ error: 'Lista de pontos solucionados (violation_ids) é obrigatória' });
            }
            normalizedIds = [...new Set(violation_ids.map(Number).filter(n => Number.isInteger(n) && n > 0))];
            if (normalizedIds.length === 0) {
                return res.status(400).json({ error: 'violation_ids inválidos' });
            }
        }

        const resolution = await updateSpeedViolationResolution({
            id,
            isValid: is_valid,
            description: description.trim(),
            photoUrl: photo_url.trim(),
            violationIds: normalizedIds,
            user: req.user,
        });
        if (!resolution) return res.status(404).json({ error: 'Resolução não encontrada' });
        res.json(resolution);
    } catch (err) {
        console.error('[TRACKING] Erro ao editar resolução:', err);
        res.status(500).json({ error: 'Erro ao editar resolução de velocidade' });
    }
});

// DELETE /admin/tracking/speed_violations/resolutions/:id
// Exclui uma resolução (libera o agente+data de volta para resolver).
router.delete('/speed_violations/resolutions/:id', verifyToken(), verifyModule('delete_speed_violation_resolution'), async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await deleteSpeedViolationResolution(id);
        if (!deleted) return res.status(404).json({ error: 'Resolução não encontrada' });
        res.json({ success: true, id: deleted.id });
    } catch (err) {
        console.error('[TRACKING] Erro ao excluir resolução:', err);
        res.status(500).json({ error: 'Erro ao excluir resolução de velocidade' });
    }
});

module.exports = router;
