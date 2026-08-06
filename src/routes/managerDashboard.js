const express = require('express');
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const { getManagerDashboardStats, getManagerDashboardPending, getManagerDashboardHistory } = require('../functions/database/checklistManagerDashboard');

const router = express.Router();

// Middleware to ensure the user has the correct module
router.use(verifyToken, verifyModule('manager_checklists'));

router.get('/stats', async (req, res) => {
    try {
        const { mes, ano, gestor_id } = req.query;
        if (!mes || !ano) {
            return res.status(400).json({ error: 'Mês e ano são obrigatórios' });
        }
        
        const stats = await getManagerDashboardStats({ 
            matricula: gestor_id || req.user.id, 
            mes, 
            ano 
        });
        res.json(stats);
    } catch (err) {
        console.error('Erro em /manager/dashboard/stats:', err.message);
        res.status(500).json({ error: 'Erro ao buscar estatísticas do dashboard' });
    }
});

router.get('/pending', async (req, res) => {
    try {
        const { mes, ano, gestor_id } = req.query;
        if (!mes || !ano) {
            return res.status(400).json({ error: 'Mês e ano são obrigatórios' });
        }
        
        const pending = await getManagerDashboardPending({ 
            matricula: gestor_id || req.user.id, 
            mes, 
            ano 
        });
        res.json(pending);
    } catch (err) {
        console.error('Erro em /manager/dashboard/pending:', err.message);
        res.status(500).json({ error: 'Erro ao buscar pendentes do dashboard' });
    }
});

router.get('/history', async (req, res) => {
    try {
        const { page = 1, limit = 50, gestor_id } = req.query;
        
        const history = await getManagerDashboardHistory({ 
            matricula: gestor_id || req.user.id, 
            page: parseInt(page), 
            limit: parseInt(limit) 
        });
        res.json(history);
    } catch (err) {
        console.error('Erro em /manager/dashboard/history:', err.message);
        res.status(500).json({ error: 'Erro ao buscar histórico do dashboard' });
    }
});

module.exports = router;
