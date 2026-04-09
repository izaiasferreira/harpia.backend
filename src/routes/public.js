const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

const { getCalendarForAgent } = require('../functions/postgresFunctions');

const publicLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas requisições. Tente novamente em 1 minuto.' },
    validate: { xForwardedForHeader: false }
});

router.get('/health', publicLimiter, (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }), 
        atual_time: new Date().toString() 
    });
});

router.get('/calendar', publicLimiter, async (req, res) => {
    try {
        const state = req.query.state || 'pi';
        const result = await getCalendarForAgent({ state });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/feriados', publicLimiter, (req, res) => {
    const state = req.query.state;
    if (!state || state === 'pi') {
        return res.json(['03/04/2026', '21/04/2026']);
    }
    if (state === 'ma') {
        return res.json(['03/04/2026', '21/04/2026']);
    }
    res.json([]);
});

module.exports = router;
