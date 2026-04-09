const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
require('dotenv').config();

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


router.get('/metabase_geral', async (req, res) => {
    try {
        const METABASE_SITE_URL = process.env.METABASE_SITE_URL;
        const METABASE_SECRET_KEY = process.env.METABASE_SECRET_KEY_GERAL;

        const payload = {
            resource: { dashboard: 4 },
            params: {},
            exp: Math.round(Date.now() / 1000) + (60 * 60) 
        };
        
        const token = jwt.sign(payload, METABASE_SECRET_KEY);
        const metabaseUrl = METABASE_SITE_URL + "/embed/dashboard/" + token + "#bordered=true&titled=true";
        
        res.redirect(metabaseUrl);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

// router.get('/metabase_hourly', async (req, res) => {
//     try {
//         const METABASE_SITE_URL = process.env.METABASE_SITE_URL;
//         const METABASE_SECRET_KEY = process.env.METABASE_SECRET_KEY_TEST;

//         const payload = {
//             resource: { dashboard: 4 },
//             params: {},
//             exp: Math.round(Date.now() / 1000) + (60 * 60) 
//         };
        
//         const token = jwt.sign(payload, METABASE_SECRET_KEY);
//         const metabaseUrl = METABASE_SITE_URL + "/embed/dashboard/" + token + "#bordered=true&titled=true";
        
//         res.redirect(metabaseUrl);
//     } catch (err) {
//         console.log(err);
//         res.status(500).json({ error: err.message });
//     }
// });

module.exports = router;
