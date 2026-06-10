const express = require('express');
const router = express.Router();
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const {
    createToken,
    listTokens,
    revokeToken,
    unrevokeToken,
    deleteToken,
    getUsageLogs
} = require('../functions/database/apiTokens');

// GET /admin/api-tokens — listar todos os tokens (só admin real)
router.get('/', verifyToken(), verifyModule('admin'), async (req, res) => {
    try {
        const tokens = await listTokens();
        res.json({ data: tokens });
    } catch (err) {
        console.error('[API TOKENS] Erro ao listar:', err.message);
        res.status(500).json({ error: 'Erro ao listar tokens' });
    }
});

// POST /admin/api-tokens — criar novo token
router.post('/', verifyToken(), verifyModule('admin'), async (req, res) => {
    try {
        const { label, expiresAt } = req.body;
        if (!label || !label.trim()) {
            return res.status(400).json({ error: 'label é obrigatório' });
        }

        const result = await createToken({
            createdBy: req.user.id,
            createdByName: req.user.nome || req.user.email,
            label: label.trim(),
            expiresAt: expiresAt || null
        });

        res.status(201).json(result);
    } catch (err) {
        console.error('[API TOKENS] Erro ao criar:', err.message);
        res.status(500).json({ error: 'Erro ao criar token' });
    }
});

// POST /admin/api-tokens/:id/revoke — revogar token
router.post('/:id/revoke', verifyToken(), verifyModule('admin'), async (req, res) => {
    try {
        const result = await revokeToken(parseInt(req.params.id), req.user.id);
        if (!result) return res.status(404).json({ error: 'Token não encontrado ou já revogado' });
        res.json(result);
    } catch (err) {
        console.error('[API TOKENS] Erro ao revogar:', err.message);
        res.status(500).json({ error: 'Erro ao revogar token' });
    }
});

// POST /admin/api-tokens/:id/unrevoke — reativar token revogado
router.post('/:id/unrevoke', verifyToken(), verifyModule('admin'), async (req, res) => {
    try {
        const result = await unrevokeToken(parseInt(req.params.id));
        if (!result) return res.status(404).json({ error: 'Token não encontrado' });
        res.json(result);
    } catch (err) {
        console.error('[API TOKENS] Erro ao reativar:', err.message);
        res.status(500).json({ error: 'Erro ao reativar token' });
    }
});

// DELETE /admin/api-tokens/:id — excluir token
router.delete('/:id', verifyToken(), verifyModule('admin'), async (req, res) => {
    try {
        const result = await deleteToken(parseInt(req.params.id));
        if (!result) return res.status(404).json({ error: 'Token não encontrado' });
        res.json({ success: true });
    } catch (err) {
        console.error('[API TOKENS] Erro ao excluir:', err.message);
        res.status(500).json({ error: 'Erro ao excluir token' });
    }
});

// GET /admin/api-tokens/:id/usage — logs de uso do token
router.get('/:id/usage', verifyToken(), verifyModule('admin'), async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const result = await getUsageLogs(parseInt(req.params.id), page, limit);
        res.json(result);
    } catch (err) {
        console.error('[API TOKENS] Erro ao buscar uso:', err.message);
        res.status(500).json({ error: 'Erro ao buscar logs de uso' });
    }
});

module.exports = router;
