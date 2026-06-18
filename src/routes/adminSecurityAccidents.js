const express = require('express');
const router = express.Router();
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const {
    get_accidents_admin,
    resolve_accident,
    reopen_accident,
    add_accident_evidencia,
    get_accident_evidencias,
    get_accident_by_id,
    delete_accident_admin,
} = require('../functions/database/accidents');

// GET /admin/security_reports/accidents — lista acidentes
router.get('/', verifyToken(), verifyModule('security_reports'), async (req, res) => {
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
        console.error('[SECURITY ACCIDENTS] Erro ao listar:', err);
        res.status(500).json({ error: 'Erro ao listar acidentes' });
    }
});

// GET /admin/security_reports/accidents/:id — obtém um acidente com evidências
router.get('/:id', verifyToken(), verifyModule('security_reports'), async (req, res) => {
    try {
        const { id } = req.params;
        const accident = await get_accident_by_id(parseInt(id));
        if (!accident) return res.status(404).json({ error: 'Acidente não encontrado' });
        const evidencias = await get_accident_evidencias(parseInt(id));
        res.json({ ...accident, evidencias });
    } catch (err) {
        console.error('[SECURITY ACCIDENTS] Erro ao obter:', err);
        res.status(500).json({ error: 'Erro ao obter acidente' });
    }
});

// POST /admin/security_reports/accidents/:id/resolve — marcar como tratado
router.post('/:id/resolve', verifyToken(), verifyModule('security_reports'), async (req, res) => {
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
        console.error('[SECURITY ACCIDENTS] Erro ao resolver:', err);
        res.status(500).json({ error: 'Erro ao resolver acidente' });
    }
});

// POST /admin/security_reports/accidents/:id/reopen — reabrir acidente
router.post('/:id/reopen', verifyToken(), verifyModule('security_reports'), async (req, res) => {
    try {
        const { id } = req.params;
        const result = await reopen_accident(parseInt(id));
        if (!result) return res.status(404).json({ error: 'Acidente não encontrado' });
        res.json(result);
    } catch (err) {
        console.error('[SECURITY ACCIDENTS] Erro ao reabrir:', err);
        res.status(500).json({ error: 'Erro ao reabrir acidente' });
    }
});

// DELETE /admin/security_reports/accidents/:id — excluir acidente
router.delete('/:id', verifyToken(), verifyModule('delete_security_report'), async (req, res) => {
    try {
        const { id } = req.params;
        const result = await delete_accident_admin(id, req.user);
        if (!result) return res.status(404).json({ error: 'Acidente não encontrado' });
        res.json({ message: 'Acidente excluído com sucesso' });
    } catch (err) {
        console.error('[SECURITY ACCIDENTS] Erro ao excluir:', err);
        res.status(500).json({ error: 'Erro ao excluir acidente' });
    }
});

module.exports = router;
