const express = require('express');
const router = express.Router();
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const { generateDashboardAdmin } = require('../functions/generateDashboard');
const { localizacoes_pi_pool } = require('../db');

const requireCompanyAdmin = verifyToken();
const requireSearchIn = verifyModule('search_in');

async function get_instalations({ query = [], type }) {
    if (!query || query.length === 0) return [];

    let column = 'instalacao';
    if (type === 'medidor') column = 'medidor';
    if (type === 'contacontrato') column = 'conta_contrato';

    const placeholders = query.map((_, i) => `$${i + 1}`).join(',');
    const sql = `
        SELECT * 
        FROM dados_instalacoes 
        WHERE ${column} IN (${placeholders})
    `;
    try {
        const { rows } = await localizacoes_pi_pool.query(sql, query);
        return rows;
    } catch (err) {
        console.error('Erro em get_instalations:', err);
        throw err;
    }
}


// Dashboard
router.get('/dashboard', requireCompanyAdmin, async (req, res) => {
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
router.post('/search_in', verifyToken, verifyModule('search_in'), async (req, res) => {
    try {
        const { type, queries } = req.body;

        const cleanQueries = queries.map(q => q.trim()).filter(Boolean);

        if (!cleanQueries.length) {
            return res.status(400).json({ error: 'Nenhuma query fornecida' });
        }
        if (cleanQueries.length > 10) {
            return res.status(400).json({ error: 'Limite de consulta excedido (máximo 10)' });
        }
        const results = await get_instalations({ query: cleanQueries, type });

        res.json(results);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;