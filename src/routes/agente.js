const express = require('express');
const router = express.Router();
require('dotenv').config();

const { 
    getLeiturasForAgent, 
    getCalendarForAgent, 
    firstC12ForAgent, 
    licacaoNovaC12ForAgent, 
    fastC12ForAgent, 
    get_instalations, 
    get_predicted,
    lastUpdate
} = require('../functions/postgresFunctions');
const { telegramAuth } = require('../middlewares/telegramAuth');
const { today, parse_date } = require('../utils/dates');

router.use(telegramAuth);

router.get('/agent_statistics', async (req, res) => {
    try {
        console.log(req.colaborador);
        const state = req.colaborador.estado || 'pi';
        const id = req.colaborador.id;
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
    try {
        const state = req.colaborador.estado || 'pi';
        const id = req.colaborador.id;
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
    try {
        const { page, date, filter } = req.query;
        const atual_filter = filter || 'all';
        const today_date = date ? parse_date(date) : today();
        const state = req.colaborador.estado || 'pi';
        const id = req.colaborador.id;
        const result = await getLeiturasForAgent({ state, id, date: today_date, page: page || 1, filter: atual_filter });
        res.json(result);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/search_in', async (req, res) => {
    try {
        const { type, queries } = req.body;
        const state = req.colaborador.estado || 'pi';

        const cleanQueries = queries.map(q => q.trim()).filter(Boolean);

        if (!cleanQueries.length) {
            res.status(400).json({ error: 'Nenhuma query fornecida' });
            return;
        }
        if(cleanQueries.length > 10) {
            res.status(400).json({ error: 'Limite de consulta excedido (máximo 10)' });
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
    try {
        const { status, page, limit } = req.query;
        const state = req.colaborador.estado || 'pi';
        const id = req.colaborador.id;

        const results = await get_predicted({ state, id, status, page, limit });
        res.json(results);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/last_update_agent', async (req, res) => {
    try {
        const state = req.colaborador.estado || 'pi';
        const result = await lastUpdate(state);
        res.json(result.find(r => r.title === 'abap2_hora'));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/agent_data', async (req, res) => {
    try {
        res.json({
            id: req.colaborador.id,
            estado: req.colaborador.estado
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
