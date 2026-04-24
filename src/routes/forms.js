const express = require('express');
const router = express.Router();
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const {
    createForm,
    getFormById,
    listForms,
    updateForm,
    deleteForm,
    getFormResponses,
    getFormStats,
    exportFormResponsesToCsv
} = require('../functions/database/forms');

router.post('/', verifyToken(), verifyModule('create_form'), async (req, res) => {
    try {
        const { title, description, coverUrl, settings, structure } = req.body;

        console.log(req.body);
        
        if (!title) {
            return res.status(400).json({ error: 'Título é obrigatório' });
        }

        const form = await createForm({
            userId: req.user.id,
            title,
            description,
            coverUrl,
            settings,
            structure
        });

        res.status(201).json(form);
    } catch (error) {
        console.error('Erro ao criar formulário:', error);
        res.status(500).json({ error: 'Erro interno ao criar formulário' });
    }
});

router.get('/', verifyToken(), verifyModule('forms'), async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;

        let result = await listForms(req.user.id, page, limit);
        
        result.data = result.data.map(form => {
            form.isActive = form.is_active;
            delete form.is_active;
            
            return form;
        });

        res.json(result);
    } catch (error) {
        console.error('Erro ao listar formulários:', error);
        res.status(500).json({ error: 'Erro interno ao listar formulários' });
    }
});

router.get('/:id', verifyToken(), verifyModule('forms'), async (req, res) => {
    try {
        const { id } = req.params;
        const form = await getFormById(parseInt(id, 10));

        if (!form) {
            return res.status(404).json({ error: 'Formulário não encontrado' });
        }

        res.json(form);
    } catch (error) {
        console.error('Erro ao buscar formulário:', error);
        res.status(500).json({ error: 'Erro interno ao buscar formulário' });
    }
});

router.put('/:id', verifyToken(), verifyModule('update_form'), async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, coverUrl, isActive, settings, structure } = req.body;

        console.log(req.body);

        const form = await updateForm(parseInt(id, 10), {
            title,
            description,
            coverUrl,
            isActive,
            settings,
            structure
        });

        if (!form) {
            return res.status(404).json({ error: 'Formulário não encontrado' });
        }

        res.json(form);
    } catch (error) {
        console.error('Erro ao atualizar formulário:', error);
        res.status(500).json({ error: 'Erro interno ao atualizar formulário' });
    }
});

router.delete('/:id', verifyToken(), verifyModule('delete_form'), async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await deleteForm(parseInt(id, 10));

        if (!deleted) {
            return res.status(404).json({ error: 'Formulário não encontrado' });
        }

        res.json({ success: true, deleted });
    } catch (error) {
        console.error('Erro ao deletar formulário:', error);
        res.status(500).json({ error: 'Erro interno ao deletar formulário' });
    }
});

router.get('/:id/responses', verifyToken(), verifyModule('forms'), async (req, res) => {
    try {
        const { id } = req.params;
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;

        const result = await getFormResponses(parseInt(id, 10), page, limit);
        res.json(result);
    } catch (error) {
        console.error('Erro ao buscar respostas:', error);
        res.status(500).json({ error: 'Erro interno ao buscar respostas' });
    }
});

router.get('/:id/stats', verifyToken(), verifyModule('forms'), async (req, res) => {
    try {
        const { id } = req.params;
        const stats = await getFormStats(parseInt(id, 10));

        if (!stats) {
            return res.status(404).json({ error: 'Formulário não encontrado' });
        }

        res.json(stats);
    } catch (error) {
        console.error('Erro ao buscar estatísticas:', error);
        res.status(500).json({ error: 'Erro interno ao buscar estatísticas' });
    }
});

router.get('/:id/export', verifyToken(), verifyModule('forms'), async (req, res) => {
    try {
        const { id } = req.params;
        const format = req.query.format || 'csv';

        const exportData = await exportFormResponsesToCsv(parseInt(id, 10));

        if (!exportData) {
            return res.status(404).json({ error: 'Formulário não encontrado' });
        }

        if (format === 'csv') {
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${exportData.filename}"`);
            return res.send('\ufeff' + exportData.csv);
        }

        res.json(exportData);
    } catch (error) {
        console.error('Erro ao exportar respostas:', error);
        res.status(500).json({ error: 'Erro interno ao exportar respostas' });
    }
});

module.exports = router;