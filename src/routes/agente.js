const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { 
    getLeiturasForAgent, 
    getCalendarForAgent, 
    firstC12ForAgent, 
    licacaoNovaC12ForAgent, 
    fastC12ForAgent, 
    getAgentTelegramId,
    get_instalations, 
    get_predicted
} = require('../functions/postgresFunctions');
const { checkToken } = require('../functions/middlewares');
const { today, parse_date } = require('../utils/dates');



router.get('/agent_statistics', async (req, res) => {
    if (!checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const id = req.query.id;
        const today_date = req.query.date || today();
        const result = await getLeiturasForAgent({ state, id, date: today_date, limit: 99999 });
        const quant_leituras = result.length || 0;
        const cnl = result.filter(r => !r.ntlei.startsWith('A') && !['B09', 'B10', 'B15'].includes(r.ntlei)).length || 0;
        const perdas = result.filter(r => r.tem_perda === "PERDA" && parseInt(r.perda_prevista_mensal) > 0).reduce((acc, r) => acc + parseInt(r.perda_prevista_mensal), 0) || 0;
        const percent_cnl = (cnl / quant_leituras) * 100 || 0;
        const quant_c12 = result.filter(r => r.ntlei === 'C12').length || 0;
        const quant_c12_out_hour = result.filter(r => r.ntlei === 'C12' && parseInt(r.hora_conclusao.split(':')[0]) < 8).length || 0;
        const licacao_nova_c12 = (await licacaoNovaC12ForAgent({ state, id, date: today_date })).length;

        res.json([
            { title: "Leituras Realizadas", value: quant_leituras || 0, color: "#00c742ff", unity: '', filter: 'all' },
            { title: "Perdas Geradas", value: perdas || 0, color: perdas > 0 ? "#EF4444" : "#00c742ff", unity: 'Kwh', filter: 'perdas' },
            { title: "Quantidade de CNL", value: `${cnl}` || 0, color: "#EF4444", unity: '', filter: 'cnl' },
            { title: "Percentual de CNL", value: percent_cnl.toFixed(1) || 0, color: percent_cnl > 6 ? "#EF4444" : "#00c742ff", unity: '%', filter: 'cnl' },
            { title: "Quantidade de C12", value: quant_c12 || 0, color: "#00c742ff", unity: '', filter: 'c12' },
            { title: "C12 Fora de Horário", value: quant_c12_out_hour || 0, color: quant_c12_out_hour > 1 ? "#EF4444" : "#00c742ff", unity: '', filter: 'c12_out_time' },
            { title: "C12 em Ligação Nova", value: licacao_nova_c12 || 0, color: licacao_nova_c12 > 0 ? "#EF4444" : "#00c742ff", unity: '', filter: 'c12_ligacao_nova' },
        ]);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/agent_statistics_more', async (req, res) => {
    if (!checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const id = req.query.id;
        const today_date = req.query.date || today();

        const fast_c12 = (await fastC12ForAgent({ state, id, date: today_date })).length;

        const first_c12 = (await firstC12ForAgent({ state, id, date: today_date })).length;

        res.json([
            { title: "C12 Rápidos", value: fast_c12 || 0, color: fast_c12 > 1 ? "#EF4444" : "#00c742ff", unity: '', filter: 'fast_c12' },
            { title: "C12 Entrante", value: first_c12 || 0, color: first_c12 > 1 ? "#EF4444" : "#00c742ff", unity: '', filter: 'first_c12' },
        ]);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/agent_services', async (req, res) => {
    if (!checkToken(req, res)) return;
    try {
        const { page, date, filter, id, state } = req.query;
        const atual_filter = filter || 'all';
        const today_date = date ? parse_date(date) : today();
        const result = await getLeiturasForAgent({ state: state || 'pi', id, date: today_date, page: page || 1, filter: atual_filter });
        res.json(result);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/agent_telegram_id', async (req, res) => {
    if (!checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const id = req.query.id;
        const result = await getAgentTelegramId({ state, id });
        if (result.length === 0) {
            res.json({ telegram_id: null });
            return;
        }
        res.json({ telegram_id: result[0].telegram_id });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/search_in', async (req, res) => {
    if (!checkToken(req, res)) return;
    try {
        const { type, queries } = req.body;
        const state = req.query.state || 'pi';

        const cleanQueries = queries.map(q => q.trim()).filter(Boolean);

        if (!cleanQueries.length) {
            res.status(400).json({ error: 'Nenhuma query fornecida' });
            return;
        }
        const results = await get_instalations({ state, query: cleanQueries, type });
        res.json(results);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/predicted', async (req, res) => {
    if (!checkToken(req, res)) return;
    try {
        const { id, state, status, page, limit } = req.query;

        if (!id) {
            res.status(400).json({ error: 'ID é obrigatório' });
            return;
        }
        const results = await get_predicted({ state, id, status, page, limit });
        res.json(results);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/calendar', async (req, res) => {
    if (!checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const result = await getCalendarForAgent({ state });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/feriados', async (req, res) => {
    if (!checkToken(req, res)) return;
    try {
        const { state } = req.query;
        if (!state || state === 'pi') {
            return res.json(['03/04/2026', '21/04/2026']);
        }

        if (state === 'ma') {
            return res.json(['03/04/2026', '21/04/2026']);
        }

        res.json([]);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
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

module.exports = router;
