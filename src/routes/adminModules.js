const express = require('express');
const router = express.Router();
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const { generateDashboardAdmin } = require('../functions/generateDashboard');
const {
    get_inventory_admin,
    get_justify_admin,
    get_pending_justifies_admin,
    get_daily_reports_admin,
    get_instalations_admin
} = require('../functions/database/admin');


async function listModules() {
    return AVAILABLE_MODULES.map(id => ({
        id,
        name: id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    }));
}



// Dashboard
router.get('/dashboard', verifyToken(), async (req, res) => {
    try {
        const user = req.user;
        const result = await generateDashboardAdmin(user)
        res.json(result);
    } catch (error) {
        console.log(error)
        res.status(500).json({ error: error.message });
    }
});

// Search installation
router.post('/search_in', verifyToken(), verifyModule('search_in'), async (req, res) => {
    try {
        const { type, queries } = req.body;

        const cleanQueries = queries.map(q => q.trim()).filter(Boolean);

        if (!cleanQueries.length) {
            return res.status(400).json({ error: 'Nenhuma query fornecida' });
        }
        if (cleanQueries.length > 10) {
            return res.status(400).json({ error: 'Limite de consulta excedido (máximo 10)' });
        }
        const results = await get_instalations_admin({ query: cleanQueries, type });

        res.json(results);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});


router.get('/justify', verifyToken(), verifyModule('justify'), async (req, res) => {
    try {
        const { instalacao, tipo, data_leit_prev, estado } = req.query;

        const result = await get_justify_admin({
            instalacao,
            tipo,
            data_leit_prev,
            estado
        });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/justify_pending', verifyToken(), verifyModule('justify_pending'), async (req, res) => {
    try {
        const { autor, status, page, limit, estado } = req.query;
        const user = req.user;

        const result = await get_pending_justifies_admin({
            state: estado,
            autor,
            status,
            page,
            limit,
            user
        });

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/daily_report', verifyToken(), verifyModule('daily_report'), async (req, res) => {
    try {
        const { autor, data, limit } = req.query;
        const user = req.user;

        const reports = await get_daily_reports_admin({ autor, data, limit, page: 1, includeAll: true, user });
        res.json(reports);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/inventory', verifyToken(), verifyModule('inventory'), async (req, res) => {
    try {
        const user = req.user;
        const result = await get_inventory_admin({ user });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;