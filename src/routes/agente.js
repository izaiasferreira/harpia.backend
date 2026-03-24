const express = require('express');
const router = express.Router();
const { getLeiturasForAgent, getCalendarForAgent, firstC12ForAgent, licacaoNovaC12ForAgent, fastC12ForAgent, getAgentTelegramId } = require('../functions/postgresFunctions');
const { checkToken } = require('../functions/middlewares');
const { today, parse_date } = require('../utils/dates');



router.get('/agent_statistics', async (req, res) => {
    if (!checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const id = req.query.id;
        const today_date = req.query.date || today();
        const result = await getLeiturasForAgent({ state, id, date: today_date, limit: 99999 });
        const quant_leituras = result.length;
        const cnl = result.filter(r => !r.ntlei.startsWith('A') && !['B09', 'B10', 'B15'].includes(r.ntlei)).length;
        const meta_cnl = quant_leituras * 0.06;
        const perdas = result.filter(r => r.tem_perda === "PERDA" && parseInt(r.perda_prevista_mensal) > 0).reduce((acc, r) => acc + parseInt(r.perda_prevista_mensal), 0)
        const percent_cnl = (cnl / quant_leituras) * 100;
        const quant_c12 = result.filter(r => r.ntlei === 'C12').length;
        const quant_c12_out_hour = result.filter(r => r.ntlei === 'C12' && parseInt(r.hora_conclusao.split(':')[0]) < 8).length;
   

        res.json([
            { title: "Leituras Realizadas", value: quant_leituras || 0, color: "#00c742ff", unity: '' },
            { title: "Perdas Geradas", value: perdas || 0, color: perdas > 0 ? "#EF4444" : "#00c742ff", unity: 'Kwh' },
            { title: "CNL", value: `${cnl}/${meta_cnl.toFixed(0)}` || 0, color: meta_cnl < cnl ? "#EF4444" : "#00c742ff", unity: '' },
            { title: "Percentual de CNL", value: percent_cnl.toFixed(1) || 0, color: percent_cnl > 6 ? "#EF4444" : "#00c742ff", unity: '%' },
            { title: "Qtd. de C12", value: quant_c12 || 0, color: "#00c742ff", unity: '' },
            { title: "C12 Fora de Horário", value: quant_c12_out_hour || 0, color: quant_c12_out_hour > 1 ? "#EF4444" : "#00c742ff", unity: '' }
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
        const licacao_nova_c12 = (await licacaoNovaC12ForAgent({ state, id, date: today_date })).length;
        const first_c12 = (await firstC12ForAgent({ state, id, date: today_date })).length;

        res.json([
            { title: "C12 Rápidos", value: fast_c12 || 0, color: fast_c12 > 1 ? "#EF4444" : "#00c742ff", unity: '' },
            { title: "C12 em Ligação Nova", value: licacao_nova_c12 || 0, color: licacao_nova_c12 > 1 ? "#EF4444" : "#00c742ff", unity: '' },
            { title: "C12 Entrante", value: first_c12 || 0, color: first_c12 > 1 ? "#EF4444" : "#00c742ff", unity: '' },
        ]);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/agent_services', async (req, res) => {
    if (!checkToken(req, res)) return;
    try {
        const { page, date } = req.body;
        const state = req.query.state || 'pi';
        const id = req.query.id;
        const today_date = date ? parse_date(date) : today();
        console.log(today_date, date);
        const result = await getLeiturasForAgent({ state, id, date: today_date, page: page || 1 });
        res.json(result);
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

module.exports = router;
