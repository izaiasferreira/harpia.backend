const express = require('express');
const router = express.Router();
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const {
    createTrainingProject,
    getTrainingProjectById,
    listTrainingProjects,
    updateTrainingProject,
    deleteTrainingProject,
    updateTrainingFlow,
    completeTrainingAndAssignBadge
} = require('../functions/database/trainingProjects');

router.post('/', verifyToken(), verifyModule('create_training'), async (req, res) => {
    try {
        const { name, description, badge_id } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Nome é obrigatório' });
        }

        const project = await createTrainingProject({
            userId: req.user.id,
            name,
            description,
            badge_id
        });

        res.status(201).json(project);
    } catch (error) {
        console.error('Erro ao criar projeto de treinamento:', error);
        res.status(500).json({ error: 'Erro interno ao criar projeto' });
    }
});

router.get('/', verifyToken(), verifyModule('trainings'), async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;

        const result = await listTrainingProjects(req.user.id, page, limit);
        res.json(result);
    } catch (error) {
        console.error('Erro ao listar projetos:', error);
        res.status(500).json({ error: 'Erro interno ao listar projetos' });
    }
});

router.get('/:id', verifyToken(), verifyModule('trainings'), async (req, res) => {
    try {
        const { id } = req.params;
        const project = await getTrainingProjectById(parseInt(id, 10));

        if (!project) {
            return res.status(404).json({ error: 'Projeto não encontrado' });
        }

        res.json(project);
    } catch (error) {
        console.error('Erro ao buscar projeto:', error);
        res.status(500).json({ error: 'Erro interno ao buscar projeto' });
    }
});

router.put('/:id', verifyToken(), verifyModule('update_training'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, badge_id } = req.body;

        const project = await updateTrainingProject(parseInt(id, 10), { name, description, badge_id });

        if (!project) {
            return res.status(404).json({ error: 'Projeto não encontrado' });
        }

        res.json(project);
    } catch (error) {
        console.error('Erro ao atualizar projeto:', error);
        res.status(500).json({ error: 'Erro interno ao atualizar projeto' });
    }
});

router.delete('/:id', verifyToken(), verifyModule('delete_training'), async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await deleteTrainingProject(parseInt(id, 10));

        if (!deleted) {
            return res.status(404).json({ error: 'Projeto não encontrado' });
        }

        res.json({ success: true, deleted });
    } catch (error) {
        console.error('Erro ao deletar projeto:', error);
        res.status(500).json({ error: 'Erro interno ao deletar projeto' });
    }
});

router.post('/:id/complete', verifyToken(), verifyModule('update_training'), async (req, res) => {
    try {
        const { id } = req.params;
        const { agent_id } = req.body;

        if (!agent_id) {
            return res.status(400).json({ error: 'agent_id é obrigatório' });
        }

        const result = await completeTrainingAndAssignBadge(parseInt(id, 10), agent_id);
        res.json(result);
    } catch (error) {
        console.error('Erro ao completar treinamento:', error);
        if (error.message.includes('não encontrado') || error.message.includes('não possui badge')) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Erro interno ao completar treinamento' });
    }
});

router.put('/:id/flow', verifyToken(), verifyModule('update_training'), async (req, res) => {
    try {
        const { id } = req.params;
        const { flow_data } = req.body;

        if (!flow_data) {
            return res.status(400).json({ error: 'Dados do fluxo são obrigatórios' });
        }

        const project = await updateTrainingFlow(parseInt(id, 10), flow_data);

        if (!project) {
            return res.status(404).json({ error: 'Projeto não encontrado' });
        }

        res.json(project);
    } catch (error) {
        console.error('Erro ao atualizar fluxo do projeto:', error);
        res.status(500).json({ error: 'Erro interno ao atualizar fluxo' });
    }
});

module.exports = router;