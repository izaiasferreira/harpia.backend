const express = require('express');
const router = express.Router();
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const {
    createTrainingProject,
    getTrainingProjectById,
    listTrainingProjects,
    updateTrainingProject,
    deleteTrainingProject,
    updateTrainingFlow
} = require('../functions/database/trainingProjects');

router.post('/', verifyToken(), verifyModule('create_training_project'), async (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Nome é obrigatório' });
        }

        const project = await createTrainingProject({
            userId: req.user.id,
            name,
            description
        });

        res.status(201).json(project);
    } catch (error) {
        console.error('Erro ao criar projeto de treinamento:', error);
        res.status(500).json({ error: 'Erro interno ao criar projeto' });
    }
});

router.get('/', verifyToken(), verifyModule('training_projects'), async (req, res) => {
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

// Rota pública para visualização (sem token)
router.get('/public/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const project = await getTrainingProjectById(parseInt(id, 10));

        if (!project) {
            return res.status(404).json({ error: 'Projeto não encontrado' });
        }

        res.json(project);
    } catch (error) {
        console.error('Erro ao buscar projeto público:', error);
        res.status(500).json({ error: 'Erro interno ao buscar projeto' });
    }
});

router.get('/:id', verifyToken(), verifyModule('training_projects'), async (req, res) => {
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

router.put('/:id', verifyToken(), verifyModule('update_training_project'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description } = req.body;

        const project = await updateTrainingProject(parseInt(id, 10), { name, description });

        if (!project) {
            return res.status(404).json({ error: 'Projeto não encontrado' });
        }

        res.json(project);
    } catch (error) {
        console.error('Erro ao atualizar projeto:', error);
        res.status(500).json({ error: 'Erro interno ao atualizar projeto' });
    }
});

router.delete('/:id', verifyToken(), verifyModule('delete_training_project'), async (req, res) => {
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

router.put('/:id/flow', verifyToken(), verifyModule('update_training_project'), async (req, res) => {
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