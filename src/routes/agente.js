const express = require('express');
const router = express.Router();
require('dotenv').config();

const {
    getLeiturasForAgent,
    firstC12ForAgent,
    licacaoNovaC12ForAgent,
    fastC12ForAgent,
    get_instalations,
    get_predicted,
    lastUpdate,
    getLeiturasPendingForAgent,
    save_justify,
    get_justify,
    update_justify,
    delete_justify,
    get_instalations_matriz
} = require('../functions/postgresFunctions');
const { telegramAuth } = require('../middlewares/telegramAuth');
const { today, parse_date } = require('../utils/dates');

router.use(telegramAuth);

router.get('/agent_dashboard', async (req, res) => {
    try {
        const state = req.colaborador.estado || 'pi';
        const id = req.colaborador.id;
        const today_date = req.query.date || today();

        // Buscar dados reais em paralelo
        const [result, pending, licacao_nova_c12_rows, fast_c12_rows, first_c12_rows] = await Promise.all([
            getLeiturasForAgent({ state, id, date: today_date, limit: 99999 }),
            getLeiturasPendingForAgent({ state, id, date: today_date, limit: 99999 }),
            licacaoNovaC12ForAgent({ state, id, date: today_date }),
            fastC12ForAgent({ state, id, date: today_date }),
            firstC12ForAgent({ state, id, date: today_date })
        ]);

        const licacao_nova_c12 = licacao_nova_c12_rows.length || 0;
        const fast_c12 = fast_c12_rows.length || 0;
        const first_c12 = first_c12_rows.length || 0;

        const quant_leituras = result.length || 0;
        const cnl = result.filter(r => !r.ntlei.startsWith('A') && !['B09', 'B10', 'B15'].includes(r.ntlei)).length || 0;
        const perdas = result.filter(r => r.tem_perda === "PERDA" && parseInt(r.perda_prevista_mensal) > 0).reduce((acc, r) => acc + parseInt(r.perda_prevista_mensal), 0) || 0;
        const percent_cnl = quant_leituras > 0 ? (cnl / quant_leituras) * 100 : 0;
        const quant_c12 = result.filter(r => r.ntlei === 'C12').length || 0;
        const quant_c12_out_hour = result.filter(r => r.ntlei === 'C12' && parseInt(r.hora_conclusao.split(':')[0]) < 8).length || 0;

        const widgets = [
            {
                id: 'banner_promo',
                type: 'bannerCarousel',
                size: { colSpan: 3, rowSpan: 1 },
                data: {
                    autoSlideInterval: 5000,
                    banners: [
                        {
                            imageUrl: 'https://litter.catbox.moe/9yx97w.png',
                            action: { type: 'link', url: '' }
                        },
                        {
                            imageUrl: 'https://litter.catbox.moe/bcf1xn.png',
                            action: { type: 'link', url: '' }
                        }
                    ]
                },
            },
            {
                id: 'stat_leituras',
                type: 'statCard',
                size: { colSpan: 1, rowSpan: 1 },
                data: {
                    title: 'Leituras Realizadas',
                    value: String(quant_leituras),
                    // subtitle: 'Total hoje',
                    icon: 'BookCheck',
                    color: 'text-emerald-500 bg-emerald-50/10'
                },
                action: { type: 'link', url: '/services?filter=all' }
            },
            {
                id: 'stat_pendentes',
                type: 'statCard',
                size: { colSpan: 1, rowSpan: 1 },
                data: {
                    title: 'Leituras Pendentes',
                    value: String(pending.length),
                    icon: 'ClipboardList',
                    color: pending.length > 0 ? 'text-orange-600 bg-orange-50/10' : 'text-emerald-500 bg-emerald-50/10'
                },
                action: { type: 'link', url: '/services?filter=pending' }
            },
            {
                id: 'stat_perdas',
                type: 'statCard',
                size: { colSpan: 1, rowSpan: 1 },
                data: {
                    title: 'Perdas Geradas',
                    value: `${perdas} Kwh`,
                    icon: 'Zap',
                    color: perdas > 0 ? 'text-red-500 bg-red-50/10' : 'text-emerald-500 bg-emerald-50/10'
                },
                action: { type: 'link', url: '/perdas' }
            },
            {
                id: 'stat_cnl',
                type: 'statCard',
                size: { colSpan: 2, rowSpan: 1 },
                data: {
                    title: 'Quantidade de CNL',
                    value: String(cnl),
                    icon: 'UserX',
                    color: 'text-red-500 bg-red-50/10'
                },
                action: { type: 'link', url: '/services?filter=cnl' }
            },
            {
                id: 'stat_percent_cnl',
                type: 'statCard',
                size: { colSpan: 1, rowSpan: 1 },
                data: {
                    title: 'Percentual de CNL',
                    value: `${percent_cnl.toFixed(1)}%`,
                    icon: 'TrendingUp',
                    color: 'text-red-500 bg-red-50/10'
                },
                action: { type: 'link', url: '/services?filter=cnl' }
            },
            {
                id: 'stat_c12_hora',
                type: 'statCard',
                size: { colSpan: 1, rowSpan: 1 },
                data: {
                    title: 'C12 Fora de Horário',
                    value: String(quant_c12_out_hour),
                    subtitle: 'Antes das 08:00',
                    icon: 'Moon',
                    color: quant_c12_out_hour > 1 ? 'text-red-500 bg-red-50/10' : 'text-emerald-500 bg-emerald-50/10'
                },
                action: { type: 'link', url: '/services?filter=c12_out_time' }
            },
            {
                id: 'stat_c12',
                type: 'statCard',
                size: { colSpan: 2, rowSpan: 1 },
                data: {
                    title: 'Total de C12',
                    value: String(quant_c12),
                    icon: 'House',
                    color: 'text-emerald-500 bg-emerald-50/10'
                },
                action: { type: 'link', url: '/services?filter=c12' }
            },
            {
                id: 'stat_c12_nova',
                type: 'statCard',
                size: { colSpan: 1, rowSpan: 1 },
                data: {
                    title: 'C12 em Ligação Nova',
                    value: String(licacao_nova_c12),
                    icon: 'HousePlus',
                    color: licacao_nova_c12 > 0 ? 'text-red-500 bg-red-50/10' : 'text-emerald-500 bg-emerald-50/10'
                },
                action: { type: 'link', url: '/services?filter=c12_ligacao_nova' }
            },
            {
                id: 'stat_c12_fast',
                type: 'statCard',
                size: { colSpan: 1, rowSpan: 1 },
                data: {
                    title: 'C12 Rápido',
                    value: String(fast_c12),
                    icon: 'UserPlus',
                    color: fast_c12 > 0 ? 'text-red-500 bg-red-50/10' : 'text-emerald-500 bg-emerald-50/10'
                },
                action: { type: 'link', url: '/services?filter=fast_c12' }
            },
            {
                id: 'stat_first_c12',
                type: 'statCard',
                size: { colSpan: 1, rowSpan: 1 },
                data: {
                    title: 'C12 Entrante',
                    value: String(first_c12),
                    icon: 'SearchAlert',
                    color: first_c12 > 0 ? 'text-red-500 bg-red-50/10' : 'text-emerald-500 bg-emerald-50/10'
                },
                action: { type: 'link', url: '/services?filter=first_c12' }
            },
        ];

        res.json({
            layout: {
                columns: 3,
                gap: 12,
                baseRowHeight: 140
            },
            widgets
        });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/agent_statistics', async (req, res) => {
    try {
        const state = req.colaborador.estado || 'pi';
        const id = req.colaborador.id;
        const today_date = req.query.date || today();

        const [result, pending_count] = await Promise.all([
            getLeiturasForAgent({ state, id, date: today_date, limit: 99999 }),
            getLeiturasPendingForAgent({ state, id, date: today_date, limit: 99999, isCountOnly: true })
        ]);

        const quant_leituras = result.length || 0;
        const cnl = result.filter(r => !r.ntlei.startsWith('A') && !['B09', 'B10', 'B15'].includes(r.ntlei)).length || 0;
        const perdas = result.filter(r => r.tem_perda === "PERDA" && parseInt(r.perda_prevista_mensal) > 0).reduce((acc, r) => acc + parseInt(r.perda_prevista_mensal), 0) || 0;
        const percent_cnl = quant_leituras > 0 ? (cnl / quant_leituras) * 100 : 0;
        const quant_c12 = result.filter(r => r.ntlei === 'C12').length || 0;

        res.json([
            { title: "Leituras Realizadas", value: quant_leituras || 0, color: "#00c742ff", unity: '', filter: 'all' },
            { title: "Leituras Pendentes", value: pending_count || 0, color: pending_count > 0 ? "#ef9744ff" : "#00c742ff", unity: '', filter: 'pending' },
            { title: "Perdas Geradas", value: perdas || 0, color: perdas > 0 ? "#EF4444" : "#00c742ff", unity: 'Kwh', filter: 'perdas' },
            { title: "Quantidade de CNL", value: `${cnl}` || 0, color: "#EF4444", unity: '', filter: 'cnl' },
            { title: "Percentual de CNL", value: percent_cnl.toFixed(1) || 0, color: percent_cnl > 6 ? "#EF4444" : "#00c742ff", unity: '%', filter: 'cnl' },
            { title: "Quantidade de C12", value: quant_c12 || 0, color: "#00c742ff", unity: '', filter: 'c12' },
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
        if (cleanQueries.length > 10) {
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

router.get('/custom_links', async (req, res) => {
    try {
        const state = req.colaborador.estado || 'pi';
        const id = req.colaborador.id;
        if (state === 'pi') {
            return res.json([
                {
                    "id": "servicos-app",
                    "label": "Serviços",
                    "url": `https://service.izisolucoes.com.br/servicos/default/699e3e5914265fccd12f57ad?matricula=${id}`,
                    "emoji": "Smartphone",
                    "color": "text-blue-600"
                },
                {
                    "id": "busca-app",
                    "label": "Pesquisar Instalação",
                    "url": `/search`,
                    "emoji": "MapPinned",
                    "color": "text-green-600"
                },
            ]);
        }
        if (state === 'ma') {
            return res.json([]);
        }

        return res.json([]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/get_justify', async (req, res) => {
    try {
        const { tipo, instalacao, data_leit_prev } = req.query;
        const estado = req.colaborador.estado;
        const results = await get_justify({ estado, tipo, instalacao, data_leit_prev });
        const instalation_data = await get_instalations_matriz({ estado, instalacao, data_leit_prev });
        const has_justified = results.hasOwnProperty('id');
        res.json({ ...instalation_data, ...results, has_justified });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/create_justify', async (req, res) => {
    try {
        const {
            instalacao,
            tipo,
            motivo,
            justificativa,
            foto,
            quantidade,
            data_leit_prev
        } = req.body;
        const agent_id = req.colaborador.id;
        const state = req.colaborador.estado || 'pi';

        const justify_has_created = await get_justify({ instalacao, data_leit_prev, estado: state });
        if (justify_has_created && justify_has_created.id) {
            return res.status(400).json({ error: 'Justificativa já criada para esta instalação e data' });
        }
        const results = await save_justify({
            state,
            instalacao,
            tipo,
            motivo,
            justificativa,
            foto,
            quantidade,
            data_leit_prev,
            author: agent_id,
            created_at: new Date(),
            updated_at: new Date()
        });
        res.json(results);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

router.put('/update_justify', async (req, res) => {
    try {
        const { id, ...fields } = req.body;
        if (!id) {
            return res.status(400).json({ error: 'ID da justificativa é obrigatório' });
        }
        const estado = req.colaborador.estado || 'pi';
        const result = await update_justify({ id, estado, ...fields });
        if (!result) {
            return res.status(404).json({ error: 'Justificativa não encontrada' });
        }
        res.json(result);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

router.delete('/delete_justify/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const estado = req.colaborador.estado || 'pi';
        const result = await delete_justify({ id, estado });
        if (!result) {
            return res.status(404).json({ error: 'Justificativa não encontrada' });
        }
        res.json({ success: true, deleted: result });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});


module.exports = router;
