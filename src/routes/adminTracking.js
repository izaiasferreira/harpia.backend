const express = require('express');

const router = express.Router();
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const {
    getAgentsLastPositionUnified,
    getAgentTrailUnified,
    getAgentTrailWithStops,
    getSpeedViolationsFromUnified,
} = require('../functions/database/trackingUnified');
const {
    get_accidents_admin,
    resolve_accident,
    reopen_accident,
    add_accident_evidencia,
    get_accident_evidencias,
    get_accident_by_id,
    delete_accident_admin,
} = require('../functions/database/accidents');
const { cenos_pool } = require('../db');

// GET /admin/tracking/agents — lista agentes com última posição (tabela unificada)
router.get('/agents', verifyToken(), verifyModule('tracking_live'), async (req, res) => {
    try {
        const agents = await getAgentsLastPositionUnified(req.user);
        res.json(agents);
    } catch (err) {
        console.error('[TRACKING] Erro ao listar agentes:', err);
        res.status(500).json({ error: 'Erro ao listar posições' });
    }
});

// GET /admin/tracking/agent/:id/trail — trajeto de um agente (tabela unificada)
router.get('/agent/:id/trail', verifyToken(), verifyModule('tracking_history'), async (req, res) => {
    try {
        const { id } = req.params;
        const { from, to } = req.query;
        const trail = await getAgentTrailUnified(id, from || null, to || null);
        res.json(trail);
    } catch (err) {
        console.error('[TRACKING] Erro ao buscar trajeto:', err);
        res.status(500).json({ error: 'Erro ao buscar trajeto' });
    }
});

// GET /admin/tracking/agent/:id/trail-extended — trajeto + paradas detectadas
router.get('/agent/:id/trail-extended', verifyToken(), verifyModule('tracking_history'), async (req, res) => {
    try {
        const { id } = req.params;
        const { from, to } = req.query;
        const result = await getAgentTrailWithStops(id, from || null, to || null);
        res.json(result);
    } catch (err) {
        console.error('[TRACKING] Erro ao buscar trajeto extendido:', err);
        res.status(500).json({ error: 'Erro ao buscar trajeto' });
    }
});

// GET /admin/tracking/speed_violations — lista infrações (tabela unificada)
router.get('/speed_violations', verifyToken(), verifyModule('tracking_speed'), async (req, res) => {
    try {
        const { agent_id, from, to } = req.query;
        const violations = await getSpeedViolationsFromUnified({
            agentId: agent_id || null,
            dateFrom: from || null,
            dateTo: to || null,
        }, req.user);
        res.json(violations);
    } catch (err) {
        console.error('[TRACKING] Erro ao listar violações:', err);
        res.status(500).json({ error: 'Erro ao listar violações de velocidade' });
    }
});

// DELETE /admin/tracking/speed_violations/:id — exclui infração (admin only)
router.delete('/speed_violations/:id', verifyToken('COMPANY_ADMIN'), async (req, res) => {
    try {
        const { id } = req.params;
        const { rows } = await cenos_pool.query(
            `DELETE FROM tracking_session_points WHERE id = $1 AND is_speed_violation = TRUE RETURNING id`,
            [id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Infração não encontrada' });
        }
        res.json({ success: true, id: rows[0].id });
    } catch (err) {
        console.error('[TRACKING] Erro ao deletar violação:', err);
        res.status(500).json({ error: 'Erro ao deletar violação de velocidade' });
    }
});

// GET /admin/tracking/global-config — configurações globais de tracking
router.get('/global-config', verifyToken(), verifyModule('tracking_settings'), async (req, res) => {
    try {
        const { rows } = await cenos_pool.query(
            `SELECT key, value, updated_at FROM tracking_global_config ORDER BY key`
        );
        const config = {};
        rows.forEach(r => { config[r.key] = r.value; });
        res.json(config);
    } catch (err) {
        console.error('[TRACKING] Erro ao buscar config global:', err);
        res.status(500).json({ error: 'Erro ao buscar configurações globais' });
    }
});

// PUT /admin/tracking/global-config — atualizar configuração global de tracking
router.put('/global-config', verifyToken(), verifyModule('tracking_settings'), async (req, res) => {
    try {
        const { key, value } = req.body;
        if (!key || value == null) {
            return res.status(400).json({ error: 'key e value são obrigatórios' });
        }
        await cenos_pool.query(`
            INSERT INTO tracking_global_config (key, value, updated_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        `, [key, String(value)]);
        res.json({ success: true });
    } catch (err) {
        console.error('[TRACKING] Erro ao salvar config global:', err);
        res.status(500).json({ error: 'Erro ao salvar configuração global' });
    }
});

// GET /admin/tracking/agent-config/:agentId — configuração de tracking por agente
router.get('/agent-config/:agentId', verifyToken(), verifyModule('tracking_settings'), async (req, res) => {
    try {
        const { agentId } = req.params;
        const { rows } = await cenos_pool.query(
            `SELECT agent_id, speed_limit_kmh, updated_at, updated_by FROM tracking_agent_config WHERE agent_id = $1`,
            [agentId]
        );
        res.json(rows[0] || null);
    } catch (err) {
        console.error('[TRACKING] Erro ao buscar config do agente:', err);
        res.status(500).json({ error: 'Erro ao buscar configuração do agente' });
    }
});

// PUT /admin/tracking/agent-config/:agentId — atualizar configuração de tracking por agente
router.put('/agent-config/:agentId', verifyToken(), verifyModule('tracking_settings'), async (req, res) => {
    try {
        const { agentId } = req.params;
        const { speedLimitKmh } = req.body;
        const updatedBy = req.user?.id || null;

        if (speedLimitKmh != null) {
            const limit = Number(speedLimitKmh);
            if (isNaN(limit) || limit < 1 || limit > 300) {
                return res.status(400).json({ error: 'speedLimitKmh deve ser entre 1 e 300' });
            }
            await cenos_pool.query(`
                INSERT INTO tracking_agent_config (agent_id, speed_limit_kmh, updated_at, updated_by)
                VALUES ($1, $2, NOW(), $3)
                ON CONFLICT (agent_id) DO UPDATE SET
                    speed_limit_kmh = EXCLUDED.speed_limit_kmh,
                    updated_at = NOW(),
                    updated_by = EXCLUDED.updated_by
            `, [agentId, limit, updatedBy]);
        }

        res.json({ success: true });
    } catch (err) {
        console.error('[TRACKING] Erro ao salvar config do agente:', err);
        res.status(500).json({ error: 'Erro ao salvar configuração do agente' });
    }
});

// DELETE /admin/tracking/accidents/:id — excluir acidente
router.delete('/accidents/:id', verifyToken('COMPANY_ADMIN'), async (req, res) => {
    try {
        const { id } = req.params;
        const result = await delete_accident_admin(id, req.user);
        if (!result) return res.status(404).json({ error: 'Acidente não encontrado' });
        res.json({ success: true, message: 'Acidente excluído com sucesso', deleted: result });
    } catch (err) {
        console.error('[ACCIDENTS] Erro ao excluir:', err);
        res.status(500).json({ error: 'Erro ao excluir acidente' });
    }
});

module.exports = router;

// ─── Acidentes ─────────────────────────────────────────────────────────────────

// GET /admin/tracking/accidents — lista acidentes
router.get('/accidents', verifyToken(), verifyModule('tracking_falls'), async (req, res) => {
    try {
        const { estado, status, search, page, limit } = req.query;
        const result = await get_accidents_admin({
            user: req.user,
            estado: estado || null,
            status: status || null,
            search: search || null,
            page: page ? parseInt(page) : 1,
            limit: limit ? parseInt(limit) : 50,
        });
        res.json(result);
    } catch (err) {
        console.error('[ACCIDENTS] Erro ao listar:', err);
        res.status(500).json({ error: 'Erro ao listar acidentes' });
    }
});

// GET /admin/tracking/accidents/:id — obtém um acidente com evidências
router.get('/accidents/:id', verifyToken(), verifyModule('tracking_falls'), async (req, res) => {
    try {
        const { id } = req.params;
        const accident = await get_accident_by_id(parseInt(id));
        if (!accident) return res.status(404).json({ error: 'Acidente não encontrado' });
        const evidencias = await get_accident_evidencias(parseInt(id));
        res.json({ ...accident, evidencias });
    } catch (err) {
        console.error('[ACCIDENTS] Erro ao obter:', err);
        res.status(500).json({ error: 'Erro ao obter acidente' });
    }
});

// POST /admin/tracking/accidents/:id/resolve — marcar como tratado
router.post('/accidents/:id/resolve', verifyToken(), verifyModule('tracking_falls'), async (req, res) => {
    try {
        const { id } = req.params;
        const { descricao_solucao, evidencias } = req.body;

        if (!descricao_solucao || !descricao_solucao.trim()) {
            return res.status(400).json({ error: 'Descrição da solução é obrigatória' });
        }
        if (!evidencias || !Array.isArray(evidencias) || evidencias.length === 0) {
            return res.status(400).json({ error: 'Pelo menos uma foto de evidência é obrigatória' });
        }

        const resolved = await resolve_accident({
            id: parseInt(id),
            user: req.user,
            descricao_solucao: descricao_solucao.trim(),
        });
        if (!resolved) return res.status(404).json({ error: 'Acidente não encontrado' });

        for (const ev of evidencias) {
            if (ev.nome_arquivo && ev.tipo && ev.caminho) {
                await add_accident_evidencia({
                    accident_id: parseInt(id),
                    nome_arquivo: ev.nome_arquivo,
                    tipo: ev.tipo,
                    caminho: ev.caminho,
                });
            }
        }

        const evidencias_result = await get_accident_evidencias(parseInt(id));
        res.json({ ...resolved, evidencias: evidencias_result });
    } catch (err) {
        console.error('[ACCIDENTS] Erro ao resolver:', err);
        res.status(500).json({ error: 'Erro ao resolver acidente' });
    }
});

// POST /admin/tracking/accidents/:id/reopen — reabrir acidente
router.post('/accidents/:id/reopen', verifyToken(), verifyModule('tracking_falls'), async (req, res) => {
    try {
        const { id } = req.params;
        const result = await reopen_accident(parseInt(id));
        if (!result) return res.status(404).json({ error: 'Acidente não encontrado' });
        res.json(result);
    } catch (err) {
        console.error('[ACCIDENTS] Erro ao reabrir:', err);
        res.status(500).json({ error: 'Erro ao reabrir acidente' });
    }
});