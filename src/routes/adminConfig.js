const express = require('express');
const router = express.Router();
const {
    listEtapas,
    updateEtapa,
    listFeriados,
    addFeriado,
    deleteFeriado
} = require('../functions/database/configs');
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');

/**
 * GET /admin/config/etapas
 * Lista todas as etapas do estado selecionado
 */
router.get('/etapas', verifyToken(), verifyModule('configs'), async (req, res) => {
    try {
        const state = req.query.state || req.user.estado || 'pi';
        const etapas = await listEtapas(state);
        res.json(etapas);
    } catch (error) {
        console.error('[GET ETAPAS] Erro:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /admin/config/etapas
 * Atualiza a data de uma etapa específica no estado selecionado
 */
router.put('/etapas', verifyToken(), verifyModule('configs'), async (req, res) => {
    try {
        const state = req.query.state || req.user.estado || 'pi';
        const { etapa, data } = req.body;

        if (!etapa || !data) {
            return res.status(400).json({ error: 'Etapa e Data são obrigatórios.' });
        }

        const result = await updateEtapa(state, etapa, data);
        if (!result) {
            return res.status(404).json({ error: 'Etapa não encontrada no banco desse estado.' });
        }

        res.json({ success: true, updated: result });
    } catch (error) {
        console.error('[PUT ETAPA] Erro:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /admin/config/feriados
 * Lista todos os feriados do estado selecionado
 */
router.get('/feriados', verifyToken(), verifyModule('configs'), async (req, res) => {
    try {
        const state = req.query.state || req.user.estado || 'pi';
        const feriados = await listFeriados(state);
        res.json(feriados);
    } catch (error) {
        console.error('[GET FERIADOS] Erro:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /admin/config/feriados
 * Adiciona um feriado na base de dados do estado selecionado
 */
router.post('/feriados', verifyToken(), verifyModule('configs'), async (req, res) => {
    try {
        const state = req.query.state || req.user.estado || 'pi';
        const { date } = req.body;

        if (!date) {
            return res.status(400).json({ error: 'Data do feriado é obrigatória.' });
        }

        // Simples validação de formato DD/MM/YYYY
        const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
        if (!dateRegex.test(date)) {
            return res.status(400).json({ error: 'Formato de data inválido. Deve ser DD/MM/YYYY.' });
        }

        const result = await addFeriado(state, date);
        res.status(201).json(result);
    } catch (error) {
        console.error('[POST FERIADO] Erro:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /admin/config/feriados/:id
 * Remove um feriado da base de dados do estado selecionado
 */
router.delete('/feriados/:id', verifyToken(), verifyModule('configs'), async (req, res) => {
    try {
        const state = req.query.state || req.user.estado || 'pi';
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({ error: 'ID do feriado é obrigatório.' });
        }

        const success = await deleteFeriado(state, id);
        if (!success) {
            return res.status(404).json({ error: 'Feriado não encontrado ou já excluído.' });
        }

        res.json({ success: true, message: 'Feriado excluído com sucesso.' });
    } catch (error) {
        console.error('[DELETE FERIADO] Erro:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
