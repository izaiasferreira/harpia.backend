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
    get_instalations_matriz,
    getWeeklyCNLStats,
    respond_pending_justify,
    get_pending_justify_by_id,
    get_pending_justifies,
    save_daily_report,
    get_daily_reports,
    get_daily_report_today,
    delete_daily_report,
    get_inventory_by_agent,
    save_inventory
} = require('../functions/postgresFunctions');
const { minioClient, BUCKET_NAME, ensureBucketExists, getPublicUrl } = require('../functions/minio');
const { telegramAuth } = require('../middlewares/telegramAuth');
const { today, parse_date } = require('../utils/dates');
const multer = require('multer');

const storage = multer.memoryStorage();
const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }
});

router.use(telegramAuth);

router.get('/agent_dashboard', async (req, res) => {
    try {
        const state = req.colaborador.estado || 'pi';
        const id = req.colaborador.id;
        const today_date = req.query.date || today();

        // Buscar dados reais em paralelo
        const [result, pending, licacao_nova_c12_rows, fast_c12_rows, first_c12_rows, weekly_cnl_stats] = await Promise.all([
            getLeiturasForAgent({ state, id, date: today_date, limit: 99999 }),
            getLeiturasPendingForAgent({ state, id, date: today_date, limit: 99999 }),
            licacaoNovaC12ForAgent({ state, id, date: today_date }),
            fastC12ForAgent({ state, id, date: today_date }),
            firstC12ForAgent({ state, id, date: today_date }),
            getWeeklyCNLStats({ state, id, date: today_date })
        ]);
        const licacao_nova_c12 = licacao_nova_c12_rows.length || 0;
        const fast_c12 = fast_c12_rows.length || 0;
        const first_c12 = first_c12_rows.length || 0;

        const hourly_map = {};
        result.forEach(r => {
            if (r.hora_conclusao) {
                const hour = r.hora_conclusao.split(':')[0] + 'h';
                hourly_map[hour] = (hourly_map[hour] || 0) + 1;
            }
        });

        const hourly_dataset = Object.keys(hourly_map)
            .sort((a, b) => parseInt(a) - parseInt(b))
            .map(hour => ({ label: hour, value: parseInt(hourly_map[hour]) }));

        const total_segundos = result.reduce((acc, r) => acc + (r.tempo_segundos || 0), 0);
        const pausa_segundos = result.filter(r => (r.tempo_segundos || 0) > 1200).reduce((acc, r) => acc + r.tempo_segundos, 0);
        const efetivo_segundos = total_segundos - pausa_segundos;

        const format_time = (s) => {
            const h = Math.floor(s / 3600);
            const m = Math.floor((s % 3600) / 60);
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        };

        const total_time_fmt = format_time(total_segundos);
        const pause_time_fmt = format_time(pausa_segundos);
        const work_time_fmt = format_time(efetivo_segundos);

        const quant_leituras = result.length || 0;
        const cnl = result.filter(r => !r.ntlei.startsWith('A') && !['B09', 'B10', 'B15'].includes(r.ntlei)).length || 0;
        const perdas = result.filter(r => r.tem_perda === "PERDA" && parseInt(r.perda_prevista_mensal) > 0).reduce((acc, r) => acc + parseInt(r.perda_prevista_mensal), 0) || 0;
        const percent_cnl = quant_leituras > 0 ? (cnl / quant_leituras) * 100 : 0;
        const quant_c12 = result.filter(r => r.ntlei === 'C12').length || 0;
        const quant_c12_out_hour = result.filter(r => r.ntlei === 'C12' && parseInt(r.hora_conclusao.split(':')[0]) < 8).length || 0;

        let widgets = [
            {
                id: 'banner_promo',
                type: 'bannerCarousel',
                size: { colSpan: 3, rowSpan: 1 },
                data: {
                    autoSlideInterval: 5000,
                    banners: [
                        {
                            imageUrl: 'https://litter.catbox.moe/7qafg3.png',
                            action: { type: 'link', url: '/inventory' }
                        },
                        {
                            imageUrl: 'https://litter.catbox.moe/22q59u.png',
                            action: { type: 'link', url: `https://forms.cattalk.com.br/form/satisfacao-ceneged-bot?id=${id}` }
                        },
                        {
                            imageUrl: 'https://litter.catbox.moe/z9zjpw.png',
                            action: { type: 'link', url: '' }
                        },
                        state === 'pi' && {
                            imageUrl: 'https://litter.catbox.moe/y62ct7.png',
                            action: { type: 'link', url: '/search' }
                        }
                    ]
                },
            },
            {
                id: 'stat_leituras',
                type: 'statCard',
                size: { colSpan: 1, rowSpan: 1 },
                data: {
                    title: 'Leituras',
                    value: String(quant_leituras),
                    icon: 'BookCheck',
                    color: 'text-emerald-500 bg-emerald-50/10'
                },
                action: { type: 'link', url: '/services?filter=all' }
            },
            {
                id: 'stat_pendencias',
                type: 'statCard',
                size: { colSpan: 1, rowSpan: 1 },
                data: {
                    title: 'Pendências',
                    value: String(pending.length),
                    icon: 'AlertTriangle',
                    color: 'text-red-500 bg-red-50/10'
                },
                action: { type: 'link', url: '/services?filter=all' }
            },
            {
                id: 'stat_perdas',
                type: 'statCard',
                size: { colSpan: 1, rowSpan: 1 },
                data: {
                    title: 'Perdas Geradas',
                    value: `${perdas} Kwh`,
                    icon: 'Zap',
                    color: 'text-yellow-500 bg-yellow-50/10'
                },
                action: { type: 'link', url: '/perdas' }
            },
            {
                id: 'chart_producao_hora',
                type: 'chartCard',
                size: { colSpan: 3, rowSpan: 1 },
                data: {
                    chartType: 'bar',
                    title: 'Leituras por Hora',
                    dataset: hourly_dataset
                },
            },
            {
                id: 'stat_total_time',
                type: 'statCard',
                size: { colSpan: 1, rowSpan: 1 },
                data: {
                    title: 'Tempo Total de Trabalho',
                    value: total_time_fmt,
                    icon: 'Clock',
                    color: 'text-blue-500 bg-blue-50/10'
                },
                action: { type: 'link', url: '/services?filter=all' }
            },
            {
                id: 'stat_pause_time',
                type: 'statCard',
                size: { colSpan: 1, rowSpan: 1 },
                data: {
                    title: 'Tempo em Pausa',
                    value: pause_time_fmt,
                    icon: 'CirclePause',
                    color: 'text-blue-500 bg-blue-50/10'
                }
            },
            {
                id: 'stat_work_time',
                type: 'statCard',
                size: { colSpan: 1, rowSpan: 1 },
                data: {
                    title: 'Tempo Efetivo',
                    value: work_time_fmt,
                    icon: 'ClockCheck',
                    color: 'text-blue-500 bg-blue-50/10'
                }
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
                id: 'chart_cnl_semana',
                type: 'chartCard',
                size: { colSpan: 3, rowSpan: 1 },
                data: {
                    chartType: 'bar',
                    title: 'CNL da semana',
                    dataset:
                        weekly_cnl_stats['labels'].map((label, i) => {
                            return {
                                label: label,
                                value: parseInt(weekly_cnl_stats['series'][i])
                            }
                        })
                },
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
                    color: 'text-red-500 bg-red-50/10'
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
                    color: 'text-red-500 bg-red-50/10'
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
                    color: 'text-red-500 bg-red-50/10'
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
                    color: 'text-red-500 bg-red-50/10'
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
                    color: 'text-red-500 bg-red-50/10'
                },
                action: { type: 'link', url: '/services?filter=first_c12' }
            },
        ];

        //caso o id não comece com letra, adicionar um alerta
        if (!id.match(/^[a-zA-Z]/)) {
            widgets.unshift({
                id: 'alert_1',
                type: 'alertCard',
                size: { colSpan: 3, rowSpan: 1 },
                data: {
                    title: "Atenção",
                    message: "Identificamos que seu cadastro está incorreto. Feche essa página e digite /cadastro para se cadastrar novamente.",
                    severity: "warning"
                },
            });
        }

        if (['F26469341', 'T30088', 'T54295'].includes(id)) {
            widgets.unshift({
                id: 'alert_2',
                type: 'alertCard',
                size: { colSpan: 3, rowSpan: 1 },
                data: {
                    title: "OBRIGADO!",
                    message: "Seu comentário de melhoria na pesquisa de satisfação foi ouvido e aprovado! Já estamos trabalhando nisso. Agradecemos a sua sugestão!",
                    severity: "success"
                },
            });
        }

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

const links = [
    {
        "id": "servicos-app",
        "label": "Serviços",
        "description": "Meus serviços atribuídos",
        "url": 'https://service.izisolucoes.com.br/servicos/default/699e3e5914265fccd12f57ad?matricula=${id}',
        "emoji": "Smartphone",
        "color": "text-blue-600",
        "states": ['pi']
    },
    {
        "id": "busca-app",
        "label": "Pesquisar Instalação",
        "description": "Encontre instalações",
        "url": `/search`,
        "emoji": "MapPinned",
        "color": "text-green-600",
        "states": ['pi']
    },
    {
        "id": "inventario-app",
        "label": "Inventário",
        "description": "Cadastre os equipamentos",
        "url": `/inventory`,
        "emoji": "Box",
        "color": "text-yellow-600",
        "states": ['pi', 'ma']
    },
    {
        "id": "daily-report-app",
        "label": "Diário de bordo",
        "description": "Como foi seu dia?",
        "url": `/daily-report`,
        "emoji": "Newspaper",
        "color": "text-blue-600",
        "states": ['pi', 'ma']
    },
]

router.get('/custom_links', async (req, res) => {
    try {
        const state = req.colaborador.estado || 'pi';
        const id = req.colaborador.id;
        const links_filtered = links.filter(link => link.states.includes(state));
        links_filtered.forEach(link => {
            link.url = link.url.replace('${id}', id);
        });
        return res.json(links_filtered);
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

// justify_pending - responder justificativa pré-criada
router.put('/justify_pending/:id/respond', async (req, res) => {
    try {
        const { id } = req.params;
        const estado = req.colaborador.estado || 'pi';
        const { motivo, observacao, foto } = req.body;

        const existing = await get_pending_justify_by_id({ id, estado });
        if (!existing) {
            return res.status(404).json({ error: 'Justificativa não encontrada' });
        }

        if (existing.status === 'respondido') {
            return res.status(409).json({ error: 'Justificativa já foi respondida' });
        }

        const result = await respond_pending_justify({
            id,
            estado,
            motivo,
            observacao,
            foto
        });

        res.json(result);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

// justify_pending - consultar por ID
router.get('/justify_pending/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const estado = req.colaborador.estado || 'pi';

        const result = await get_pending_justify_by_id({ id, estado });
        if (!result) {
            return res.status(404).json({ error: 'Justificativa não encontrada' });
        }
        res.json(result);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

// justify_pending - listar justificativas (por autor e/ou status)
router.get('/justify_pending', async (req, res) => {
    try {
        const estado = req.colaborador.estado || 'pi';
        const autor = req.query.autor || req.colaborador.id;
        const status = req.query.status;

        const result = await get_pending_justifies({ state: estado, autor, status });
        res.json(result);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

// daily_report - criar reporte diário (1 por dia)
router.post('/daily_report', async (req, res) => {
    try {
        const estado = req.colaborador.estado || 'pi';
        const autor = req.colaborador.id;
        const { nota, motivo, observacao, foto } = req.body;

        if (!nota || nota < 1 || nota > 5) {
            return res.status(400).json({ error: 'Nota deve ser entre 1 e 5 estrelas' });
        }

        const existingToday = await get_daily_report_today({ state: estado, autor });
        if (existingToday) {
            return res.status(409).json({
                error: 'Já existe um report diário para hoje',
                existing: existingToday
            });
        }

        const result = await save_daily_report({
            state: estado,
            autor,
            nota,
            motivo,
            observacao,
            foto
        });

        res.status(201).json(result);
    } catch (err) {
        if (err.message.includes('Já existe')) {
            return res.status(409).json({ error: err.message });
        }
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

// daily_report - listar reportes (por autor e/ou data)
router.get('/daily_report', async (req, res) => {
    try {
        const estado = req.colaborador.estado || 'pi';
        const autor = req.query.autor || req.colaborador.id;
        const data = req.query.data;
        const limit = parseInt(req.query.limit) || 10;

        console.log({ state: estado, autor, data, limit })

        const result = await get_daily_reports({ state: estado, autor, data, limit });
        res.json(result);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

// daily_report - verificar se já existe reporte hoje
router.get('/daily_report/check_today', async (req, res) => {
    try {
        const estado = req.colaborador.estado || 'pi';
        const autor = req.colaborador.id;

        const result = await get_daily_report_today({ state: estado, autor });
        res.json({ hasReportToday: !!result, data: result });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});


router.get('/inventory', async (req, res) => {
    try {
        const estado = req.colaborador.estado || 'pi';
        const agente = req.query.agente || req.colaborador.id;

        const result = await get_inventory_by_agent({ agente, estado });
        if (!result) {
            return res.status(404).json({ error: 'Nenhum inventário encontrado para este agente' });
        }
        res.json(result);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});


router.post('/inventory', async (req, res) => {
    try {
        const estado = req.colaborador.estado || 'pi';
        const {
            agente,
            pda_imei_1,
            pda_imei_2,
            pda_numero_serie,
            pda_marca,
            pda_modelo,
            pda_numero_chip,
            pda_versao_android,
            pda_versao_bluetooth,
            impressora_numero_serie,
            impressora_marca,
            impressora_modelo
        } = req.body;

        if (!agente) {
            return res.status(400).json({ error: 'Agente é obrigatório' });
        }

        const result = await save_inventory({
            state: estado,
            agente,
            pda_imei_1,
            pda_imei_2,
            pda_numero_serie,
            pda_marca,
            pda_modelo,
            pda_numero_chip,
            pda_versao_android,
            pda_versao_bluetooth,
            impressora_numero_serie,
            impressora_modelo,
            impressora_marca
        });

        res.status(201).json(result);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/upload_agent', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        }

        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
        
        if (!allowedTypes.includes(req.file.mimetype)) {
            return res.status(400).json({ error: 'Tipo de arquivo não permitido' });
        }

        await ensureBucketExists();

        const timestamp = Date.now();
        const ext = req.file.originalname.split('.').pop();
        const agentId = req.colaborador.id;
        const fileName = `${timestamp}-${agentId}-${Math.random().toString(36).substring(7)}.${ext}`;
        const fullPath = `agents/${agentId}/${fileName}`;

        await minioClient.putObject(BUCKET_NAME, fullPath, req.file.buffer);

        res.json({
            success: true,
            fileName: fullPath,
            url: getPublicUrl(fullPath),
            size: req.file.size,
            mimetype: req.file.mimetype
        });

    } catch (err) {
        console.error('Erro no upload_agent:', err);
        res.status(500).json({ error: err.message });
    }
});


module.exports = router;
