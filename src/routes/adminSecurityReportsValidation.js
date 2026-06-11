const express = require('express');
const router = express.Router();
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const { cenos_pool } = require('../db');
const {
    resolve_security_report,
    reabrir_security_report,
    add_evidencia,
    get_evidencias,
    get_dashboard_stats,
} = require('../functions/database/adminSecurityReportsValidation');

router.get('/dashboard', verifyToken(), verifyModule('security_reports'), async (req, res) => {
    try {
        const { estado } = req.query;
        const result = await get_dashboard_stats({ user: req.user, estado });
        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/:id/resolver', verifyToken(), verifyModule('resolve_security_report'), async (req, res) => {
    try {
        const { id } = req.params;
        const { descricao_solucao, evidencias } = req.body;

        if (!descricao_solucao || !descricao_solucao.trim()) {
            return res.status(400).json({ error: 'Descrição da solução é obrigatória' });
        }

        // Evidência obrigatória apenas se não for "Sem Risco"
        let isSemRisco = false;
        try {
            const { rows } = await cenos_pool.query('SELECT motivo FROM security_report WHERE id = $1', [id]);
            if (rows.length > 0 && rows[0].motivo === 'Sem Risco') isSemRisco = true;
        } catch (_) {}

        if (!isSemRisco && (!evidencias || !Array.isArray(evidencias) || evidencias.length === 0)) {
            return res.status(400).json({ error: 'Adicione pelo menos uma evidência (foto ou documento)' });
        }

        const result = await resolve_security_report({
            id,
            user: req.user,
            descricao_solucao: descricao_solucao.trim(),
        });

        if (evidencias && Array.isArray(evidencias) && evidencias.length > 0) {
            for (const ev of evidencias) {
                if (ev.nome_arquivo && ev.tipo && ev.caminho) {
                    await add_evidencia({
                        report_id: parseInt(id),
                        nome_arquivo: ev.nome_arquivo,
                        tipo: ev.tipo,
                        caminho: ev.caminho,
                    });
                }
            }
        }

        const evidenciasResult = await get_evidencias(parseInt(id));

        res.json({
            success: true,
            report: result,
            evidencias: evidenciasResult,
        });
    } catch (error) {
        console.error(error);
        const status = error.message.includes('permissão') || error.message.includes('não encontrado') || error.message.includes('obrigatória') ? 400 : 500;
        res.status(status).json({ error: error.message });
    }
});

router.post('/:id/reabrir', verifyToken(), verifyModule('resolve_security_report'), async (req, res) => {
    try {
        const { id } = req.params;
        const result = await reabrir_security_report({ id, user: req.user });
        res.json({ success: true, report: result });
    } catch (error) {
        console.error(error);
        const status = error.message.includes('permissão') || error.message.includes('não encontrado') ? 400 : 500;
        res.status(status).json({ error: error.message });
    }
});

router.get('/:id/evidencias', verifyToken(), verifyModule('security_reports'), async (req, res) => {
    try {
        const { id } = req.params;
        const result = await get_evidencias(parseInt(id));
        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/:id/evidencias', verifyToken(), verifyModule('resolve_security_report'), async (req, res) => {
    try {
        const { id } = req.params;
        const { nome_arquivo, tipo, caminho } = req.body;

        if (!nome_arquivo || !tipo || !caminho) {
            return res.status(400).json({ error: 'nome_arquivo, tipo e caminho são obrigatórios' });
        }

        const result = await add_evidencia({
            report_id: parseInt(id),
            nome_arquivo,
            tipo,
            caminho,
        });

        res.status(201).json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
