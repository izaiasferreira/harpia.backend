const express = require('express');
const { validate } = require('../middlewares/validate');
const { justifyCreateSchema } = require('../db/schemas/justify');
const { dailyReportSchema } = require('../db/schemas/dailyReport');
const { inventoryCreateSchema } = require('../db/schemas/inventory');
const { securityReportCreateSchema, securityCheckCreateSchema } = require('../db/schemas/security');

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
    getWeeklyCNLStats,
    checkJustifiedByInstallations,
    respond_pending_justify,
    get_pending_justify_by_id,
    get_pending_justifies,
    save_daily_report,
    get_daily_reports,
    get_daily_report_today,
    get_inventory_by_agent,
    save_inventory,
    create_security_report,
    getUserData,
    updateProfilePic,
    addBadgeToProfile,
    get_security_reports,
    save_security_check,
    get_security_checks,
    get_security_check_today,
    getLeiturasForAgentInDateInterval
} = require('../functions/postgresFunctions');
const { minioClient, CONFIG, ensureBucketExists, getFileUrl, compressImage } = require('../functions/minio');
const { telegramAuth } = require('../middlewares/telegramAuth');
const { today, parse_date } = require('../utils/dates');
const multer = require('multer');
const { generateDashboard } = require('../functions/generateDashboard');
const { generateCustomLinks } = require('../functions/generateCustomLinks');
const { get_instalation_matriz } = require('../functions/database/commom');
const { getCeneducForAgent, completeCeneducCard, checkCeneducCardResourceCompleted, recordTrainingCompletion } = require('../functions/database/ceneduc');
const { completeTrainingAndAssignBadge } = require('../functions/database/trainingProjects');

const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }
});



router.get('/profile', telegramAuth, async (req, res) => {
    const user = req.colaborador
    const userData = await getUserData({ id: user.id, state: user.estado });
    return res.json({
        user: {
            name: userData.nome || 'Desconhecido',
            role: userData.cargo || 'Desconhecido',
            location: userData.regional || 'Desconhecido',
            photo: userData.profilePicUrl || "https://api.izi.tec.br/files/assets/profile.png",
            stats: {
                level: 0
            }
        },
        goals: [
            { id: 1, title: 'Não ultrapassar a meta de CNL', completed: false },
            { id: 2, title: 'Ter 80% do CNL indevidos justificado', completed: false },
            { id: 3, title: 'Ter 0 perdas por troca de apontamento', completed: false },
            { id: 4, title: 'Ter 90% de perdas justificadas', completed: false },
            { id: 5, title: 'Ao menos 1 reporte de segurança por etapa', completed: false },
            { id: 6, title: 'Fazer checklist de segurança 1 vez por semana', completed: false },
            { id: 7, title: 'Ter 80% do diário de bordo respondido', completed: false },
            { id: 8, title: 'Ter inventário atualizado pelo menos 1 vez ao mês', completed: false },
            { id: 9, title: 'Ter 1 erro de leitura a cada 5000 leituras', completed: false }
        ],
        badges: Array.isArray(userData.badges) ? userData.badges : []
    });
})

router.post('/profile/upload', telegramAuth, upload.single('photo'), async (req, res) => {
    try {
        const user = req.colaborador;
        let photoBuffer;
        let mimeType = 'image/jpeg';
        let extension = 'jpg';

        if (req.file) {
            photoBuffer = req.file.buffer;
            mimeType = req.file.mimetype;
            extension = mimeType.split('/')[1] || 'jpg';
        } else if (req.body.photo) {
            const matches = req.body.photo.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                mimeType = matches[1];
                photoBuffer = Buffer.from(matches[2], 'base64');
                extension = mimeType.split('/')[1] || 'jpg';
            } else {
                photoBuffer = Buffer.from(req.body.photo, 'base64');
            }
        } else {
            return res.status(400).json({ error: 'Nenhuma foto enviada' });
        }

        // Upload para o Minio
        await ensureBucketExists();
        const fileName = `profiles/${user.id}_${new Date().getTime()}.jpg`;

        // Comprime a imagem
        const compressedData = await compressImage(photoBuffer, mimeType);

        await minioClient.putObject(
            CONFIG.bucket,
            fileName,
            compressedData,
            { 'Content-Type': mimeType }
        );

        const fileUrl = getFileUrl(fileName);

        // Atualiza no banco de dados
        await updateProfilePic(user.id, fileUrl);

        const userData = await getUserData({ id: user.id, state: user.estado });
        return res.json({
            user: {
                name: userData.nome,
                role: userData.cargo,
                location: userData.regional,
                photo: fileUrl || "https://api.izi.tec.br/files/assets/profile.png",
                stats: {
                    level: 0
                }
            },
            goals: [
                { id: 1, title: 'Não ultrapassar a meta de CNL', completed: false },
                { id: 2, title: 'Ter 80% do CNL indevidos justificado', completed: false },
                { id: 3, title: 'Ter 0 perdas por troca de apontamento', completed: false },
                { id: 4, title: 'Ter 90% de perdas justificadas', completed: false },
                { id: 5, title: 'Ao menos 1 reporte de segurança por etapa', completed: false },
                { id: 6, title: 'Fazer checklist de segurança 1 vez por semana', completed: false },
                { id: 7, title: 'Ter 80% do diário de bordo respondido', completed: false },
                { id: 8, title: 'Ter inventário atualizado pelo menos 1 vez ao mês', completed: false },
                { id: 9, title: 'Ter 1 erro de leitura a cada 5000 leituras', completed: false }
            ],
            badges: Array.isArray(userData.badges) ? userData.badges : []
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: err.message });
    }
});

router.get('/badge', telegramAuth, async (req, res) => {
    try {
        const user = req.colaborador;
        const badgeId = req.query.badge;

        if (!badgeId) {
            return res.status(400).json({ error: 'Parâmetro badge é obrigatório' });
        }

        const updatedBadges = await addBadgeToProfile(user.id, badgeId);

        return res.json({
            success: true,
            badges: updatedBadges
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: err.message });
    }
});

router.get('/ceneduc', telegramAuth, async (req, res) => {
    try {
        const state = req.colaborador.estado || null;
        const id = req.colaborador.id;
        const result = await getCeneducForAgent(state, id);
        res.json(result);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
})

router.post('/ceneduc/complete/:id', telegramAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const agentId = req.colaborador.id;

        const result = await completeCeneducCard(parseInt(id, 10), agentId);
        res.json(result);
    } catch (err) {
        console.log(err);
        res.status(400).json({ error: err.message });
    }
})

router.get('/ceneduc/check/:id', telegramAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const agentId = req.colaborador.id;

        const completed = await checkCeneducCardResourceCompleted(parseInt(id, 10), agentId);
        res.json({ completed });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
})

router.get('/agent_dashboard', telegramAuth, async (req, res) => {
    try {
        const state = req.colaborador.estado || 'pi';
        const id = req.colaborador.id;
        let chosed_date = req.query.date || today();

        if(chosed_date.includes('/')) {
            chosed_date = chosed_date.replaceAll('/', '.')
        }
        
        const todayStr = today();
        const firstMonthDay = '01.' + chosed_date.split('.')[1] + '.' + chosed_date.split('.')[2];
        
        const [_, monthPart, yearPart] = chosed_date.split('.');
        const lastDayNum = new Date(Number(yearPart), Number(monthPart), 0).getDate();
        let lastMonthDay = String(lastDayNum).padStart(2, '0') + '.' + monthPart + '.' + yearPart;

        const parseDate = (dStr) => {
            const [d, m, y] = dStr.split('.');
            return new Date(Number(y), Number(m) - 1, Number(d));
        };

        if (parseDate(lastMonthDay) > parseDate(todayStr)) {
            lastMonthDay = todayStr;
        }

        // Buscar dados reais em paralelo
        const [
            month_result,
            result,
            pending,
            licacao_nova_c12_rows,
            fast_c12_rows,
            first_c12_rows,
            weekly_cnl_stats,
            pending_justifies
        ] = await Promise.all([
            getLeiturasForAgentInDateInterval({ state, id, initDate: firstMonthDay, endDate: lastMonthDay, limit: 99999 }),
            getLeiturasForAgent({ state, id, date: chosed_date, limit: 99999 }),
            getLeiturasPendingForAgent({ state, id, date: chosed_date, limit: 99999 }),
            licacaoNovaC12ForAgent({ state, id, date: chosed_date }),
            fastC12ForAgent({ state, id, date: chosed_date }),
            firstC12ForAgent({ state, id, date: chosed_date }),
            getWeeklyCNLStats({ state, id, date: chosed_date }),
            get_pending_justifies({ autor: id, status: 'pendente', page: 1, limit: 100 })
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

        const month_leituras = month_result.filter(r => r.ntlei.startsWith('A') ||['B09', 'B10', 'B15'].includes(r.ntlei)).length || 0;
        const month_cnl = month_result.filter(r => !r.ntlei.startsWith('A') && !['B09', 'B10', 'B15'].includes(r.ntlei)).length || 0;
        const month_total_leituras = month_result.length || 0;
        const month_percent_cnl = month_total_leituras > 0 ? (month_cnl / month_total_leituras) * 100 : 0;


        const layout = generateDashboard({
            state,
            id,
            today_date: chosed_date,
            stats: {
                month_leituras,
                month_cnl,
                month_total_leituras,
                month_percent_cnl,
                quant_leituras,
                pending,
                licacao_nova_c12,
                fast_c12,
                first_c12,
                weekly_cnl_stats,
                hourly_dataset,
                total_time_fmt,
                pause_time_fmt,
                work_time_fmt,
                cnl,
                perdas,
                percent_cnl,
                quant_c12,
                quant_c12_out_hour,
                pending_justifies
            }
        });
        res.json(layout);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/agent_services', telegramAuth, async (req, res) => {
    try {
        const { page, date, filter } = req.query;
        const atual_filter = filter || 'all';
        const today_date = date ? parse_date(date) : today();
        const state = req.colaborador.estado || 'pi';
        const id = req.colaborador.id;
        const result = await getLeiturasForAgent({ state, id, date: today_date, page: page || 1, filter: atual_filter });

        // Verificar justificativas
        const data = Array.isArray(result) ? result : result?.data || [];
        if (data.length > 0) {
            const installations = data.map(r => r.instalacao);
            const justified = await checkJustifiedByInstallations(installations, state);

            const resultWithJustified = (Array.isArray(result) ? result : data).map(r => ({
                ...r,
                justificado: !!justified[r.instalacao]
            }));

            if (Array.isArray(result)) {
                res.json(resultWithJustified);
            } else {
                res.json({ ...result, data: resultWithJustified });
            }
            return;
        }

        res.json(result);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/search_in', telegramAuth, async (req, res) => {
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

router.get('/instalation_details', telegramAuth, async (req, res) => {
    try {
        const { instalacao } = req.query;
        const estado = req?.colaborador?.estado || 'pi';

        if (!instalacao) {
            res.status(400).json({ error: 'Instalação não fornecida' });
            return;
        }

        const results = await get_instalation_matriz({ estado, instalacao: [instalacao] });
        if (results.length === 0) {
            res.status(404).json({ error: 'Instalação não encontrada' });
            return;
        }
        let result = {
            "instalacao": results[0].instalacao,
            "unidade_leitura": results[0].unidade_leitura,
            "tipo": results[0].tipo,
            "status_ds": results[0].status_ds == 'LG' ? 'LIGADO' : 'DESLIGADO',
            "etapa": results[0].etapa,
            "cidade": results[0].cidade,
            "seccional": results[0].seccional,
            "regional": results[0].regional,
            "latitude": null,
            "longitude": null,
            "ntlei_historico": results[0].ntlei_historico || [],
            "estado": estado
        }

        console.log(result, estado);
        res.json({ ...result });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/predicted', telegramAuth, async (req, res) => {
    try {
        const { status, page, limit } = req.query;
        const state = req.colaborador.estado || 'pi';
        const id = req.colaborador.id;
        const results = await get_predicted({ state, id, status, page, limit });

        // Verificar justificativas
        const data = Array.isArray(results) ? results : results?.data || [];
        if (data.length > 0) {
            const installations = data.map(r => r.instalacao);
            const justified = await checkJustifiedByInstallations(installations, state);

            const resultWithJustified = (Array.isArray(results) ? results : data).map(r => ({
                ...r,
                justificado: !!justified[r.instalacao]
            }));

            if (Array.isArray(results)) {
                res.json(resultWithJustified);
            } else {
                res.json({ ...results, data: resultWithJustified });
            }
            return;
        }

        res.json(results);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/last_update_agent', telegramAuth, async (req, res) => {
    try {
        const state = req.colaborador.estado || 'pi';
        const result = await lastUpdate(state);
        res.json(result.find(r => r.title === 'abap2_hora'));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/agent_data', telegramAuth, async (req, res) => {
    try {
        res.json({
            id: req.colaborador.id,
            estado: req.colaborador.estado
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/custom_links', telegramAuth, async (req, res) => {
    try {
        const state = req.colaborador.estado || 'pi';
        const id = req.colaborador.id;
        const links = generateCustomLinks({ state, id, user: req.colaborador });
        return res.json(links);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/get_justify', telegramAuth, async (req, res) => {
    try {
        const { tipo, instalacao, data_leit_prev } = req.query;
        const estado = req.colaborador.estado;
        const results = await get_justify({ estado, tipo, instalacao, data_leit_prev });

        var instalation_data = await get_instalation_matriz({
            estado,
            instalacao: [instalacao.trim()],
            data_leit_prev
        });


        if (!instalation_data.length) return res.status(404).json({ error: 'Instalação não encontrada' });

        instalation_data = instalation_data[0];
        delete instalation_data['tipo'];

        const has_justified = results.hasOwnProperty('id');

        res.json({ ...instalation_data, ...results, has_justified });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/create_justify', telegramAuth, validate(justifyCreateSchema), async (req, res) => {
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

router.put('/update_justify', telegramAuth, async (req, res) => {
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

router.delete('/delete_justify/:id', telegramAuth, async (req, res) => {
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
router.put('/justify_pending/:id/respond', telegramAuth, async (req, res) => {
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
router.get('/justify_pending/:id', telegramAuth, async (req, res) => {
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
router.get('/justify_pending', telegramAuth, async (req, res) => {
    try {
        const estado = req.colaborador.estado || 'pi';
        const autor = req.query.autor || req.colaborador.id;
        const status = req.query.status || 'pendente';
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;

        const result = await get_pending_justifies({ state: estado, autor, status, page, limit });
        res.json(result);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

// daily_report - criar reporte diário (1 por dia)
router.post('/daily_report', telegramAuth, validate(dailyReportSchema), async (req, res) => {
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
router.get('/daily_report', telegramAuth, async (req, res) => {
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
router.get('/daily_report/check_today', telegramAuth, async (req, res) => {
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


router.get('/inventory', telegramAuth, async (req, res) => {
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


router.post('/inventory', telegramAuth, validate(inventoryCreateSchema), async (req, res) => {
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

        const required = [
            { campo: 'pda_imei_1', valor: pda_imei_1, nome: 'IMEI 1 do PDA' },
            { campo: 'pda_numero_serie', valor: pda_numero_serie, nome: 'Número de série do PDA' },
            { campo: 'pda_marca', valor: pda_marca, nome: 'Marca do PDA' },
            { campo: 'pda_modelo', valor: pda_modelo, nome: 'Modelo do PDA' },
            { campo: 'impressora_numero_serie', valor: impressora_numero_serie, nome: 'Número de série da impressora' },
            { campo: 'impressora_marca', valor: impressora_marca, nome: 'Marca da impressora' },
            { campo: 'impressora_modelo', valor: impressora_modelo, nome: 'Modelo da impressora' },
            { campo: 'pda_versao_android', valor: pda_versao_android, nome: 'Versão do Android' }
        ];

        const faltantes = required.filter(o => !o.valor || o.valor.trim() === '');
        if (faltantes.length > 0) {
            return res.status(400).json({
                error: 'Campos obrigatórios não preenchidos',
                campos: faltantes.map(f => f.nome)
            });
        }

        const result = await save_inventory({
            state: estado,
            agente: agente.toUpperCase(),
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

router.post('/security_report', telegramAuth, validate(securityReportCreateSchema), async (req, res) => {
    try {
        const autor = req.colaborador.id;
        const { motivo, observacao, latitude, longitude } = req.body;

        if (!motivo) {
            return res.status(400).json({ error: 'Motivo é obrigatório' });
        }

        const result = await create_security_report({
            autor,
            motivo,
            observacao,
            latitude,
            longitude,
            estado: req.colaborador.estado || 'pi'
        });

        res.status(201).json(result);
    } catch (err) {
        console.error('Erro ao criar reporte de segurança:', err);
        res.status(500).json({ error: err.message });
    }
});

// security_check - confirmação de check (1 por dia)
router.post('/security_check', telegramAuth, validate(securityCheckCreateSchema), async (req, res) => {
    try {
        const autor = req.colaborador.id;
        const estado = req.colaborador.estado || 'pi';
        const { latitude, longitude } = req.body;

        const result = await save_security_check({
            autor,
            latitude,
            longitude,
            state: estado
        });

        res.status(201).json(result);
    } catch (err) {
        console.error('Erro ao salvar confirmação de segurança:', err);
        res.status(500).json({ error: err.message });
    }
});

// security_check - listar confirmações
router.get('/security_check', telegramAuth, async (req, res) => {
    try {
        const autor = req.query.autor || req.colaborador.id;
        const estado = req.colaborador.estado || 'pi';
        const { data, limit } = req.query;

        const result = await get_security_checks({
            state: estado,
            autor,
            data,
            limit
        });

        res.json(result);
    } catch (err) {
        console.error('Erro ao buscar confirmações de segurança:', err);
        res.status(500).json({ error: err.message });
    }
});

// security_check - verificar se já existe confirmação hoje
router.get('/security_check/check_today', telegramAuth, async (req, res) => {
    try {
        const autor = req.colaborador.id;
        const estado = req.colaborador.estado || 'pi';

        const result = await get_security_check_today({
            state: estado,
            autor
        });

        res.json({
            hasCheckToday: !!result,
            data: result
        });
    } catch (err) {
        console.error('Erro ao verificar confirmação de segurança de hoje:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/security_report', telegramAuth, async (req, res) => {
    try {
        const user = req.colaborador;


        const result = await get_security_reports({
            user
        });

        res.status(201).json(result);
    } catch (err) {
        console.error('Erro ao criar reporte de segurança:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/upload_agent', telegramAuth, upload.single('file'), async (req, res) => {
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

        let fileBuffer = req.file.buffer;
        let originalSize = fileBuffer.length;

        if (['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(req.file.mimetype)) {
            fileBuffer = await compressImage(fileBuffer, req.file.mimetype);
            console.log(`Imagem comprimida: ${originalSize} -> ${fileBuffer.length} bytes (${Math.round((1 - fileBuffer.length / originalSize) * 100)}% redução)`);
        }

        await minioClient.putObject(CONFIG.bucket, fullPath, fileBuffer);

        res.json({
            success: true,
            fileName: fullPath,
            url: getFileUrl(fullPath),
            size: fileBuffer.length,
            originalSize: originalSize,
            compression: originalSize !== fileBuffer.length ? Math.round((1 - fileBuffer.length / originalSize) * 100) + '%' : null,
            mimetype: req.file.mimetype
        });

    } catch (err) {
        console.error('Erro no upload_agent:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/training/:id/complete', telegramAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const agentId = req.colaborador.id;

        const result = await completeTrainingAndAssignBadge(parseInt(id, 10), agentId);

        await recordTrainingCompletion(parseInt(id, 10), agentId).catch(() => { });

        res.json(result);
    } catch (error) {
        console.error('Erro ao completar treinamento:', error);
        if (error.message.includes('não encontrado') || error.message.includes('não possui badge')) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Erro interno ao completar treinamento' });
    }
});

// --- Tracking: sync batch de pontos, violações e incidentes ---

const {
    insertTrackingPoints,
    insertTrackingPointsExtended,
    insertSpeedViolations,
    insertFallIncident,
    insertAlertLogs,
} = require('../functions/database/tracking');

const { upsertFcmToken } = require('../functions/database/fcmTokens');

// POST /agent/fcm-token — registrar token FCM do dispositivo
router.post('/fcm-token', telegramAuth, async (req, res) => {
    try {
        const agentId = req.colaborador.id;
        const { token, deviceInfo } = req.body;

        if (!token) {
            return res.status(400).json({ error: 'token é obrigatório' });
        }

        await upsertFcmToken(agentId, token, deviceInfo || null);
        res.json({ success: true });
    } catch (err) {
        console.error('[FCM_TOKEN] Erro:', err);
        res.status(500).json({ error: 'Erro ao registrar token' });
    }
});

router.post('/tracking/sync', telegramAuth, async (req, res) => {
    try {
        const agentId = req.colaborador.id;
        const { points, violations, incidents, alerts } = req.body;

        if (points && points.length > 0) {
            await insertTrackingPoints(agentId, points);
        }

        if (violations && violations.length > 0) {
            await insertSpeedViolations(agentId, violations);
        }

        if (incidents && incidents.length > 0) {
            for (const incident of incidents) {
                await insertFallIncident(agentId, incident);
            }
        }

        if (alerts && alerts.length > 0) {
            await insertAlertLogs(agentId, alerts);
        }

        res.json({
            success: true,
            synced: {
                points: points?.length || 0,
                violations: violations?.length || 0,
                incidents: incidents?.length || 0,
                alerts: alerts?.length || 0,
            }
        });
    } catch (err) {
        console.error('[TRACKING_SYNC] Erro:', err);
        res.status(500).json({ error: 'Erro ao sincronizar dados de rastreamento' });
    }
});

// POST /agent/tracking/sync-v2 — sync batch com deviceInfo (bateria, rede, dispositivo)
router.post('/tracking/sync-v2', telegramAuth, async (req, res) => {
    try {
        const agentId = req.colaborador.id;
        const { points, violations, incidents, alerts, deviceInfo } = req.body;

        if (points && points.length > 0) {
            await insertTrackingPointsExtended(agentId, points, deviceInfo || null);
        }

        if (violations && violations.length > 0) {
            await insertSpeedViolations(agentId, violations);
        }

        if (incidents && incidents.length > 0) {
            for (const incident of incidents) {
                await insertFallIncident(agentId, incident);
            }
        }

        if (alerts && alerts.length > 0) {
            await insertAlertLogs(agentId, alerts);
        }

        res.json({
            success: true,
            synced: {
                points: points?.length || 0,
                violations: violations?.length || 0,
                incidents: incidents?.length || 0,
                alerts: alerts?.length || 0,
            }
        });
    } catch (err) {
        console.error('[TRACKING_SYNC_V2] Erro:', err);
        res.status(500).json({ error: 'Erro ao sincronizar dados de rastreamento' });
    }
});

const {
    insertUnifiedPoints,
    getAgentSpeedLimit,
    upsertAgentSpeedLimit,
    getGlobalSpeedLimit,
    getSpeedViolationsFromUnified,
} = require('../functions/database/trackingUnified');

// POST /agent/tracking/sync-unified — ponto unificado com status do dispositivo
// Atualiza last_heartbeat_at automaticamente (tanto nativo quanto web)
router.post('/tracking/sync-unified', telegramAuth, async (req, res) => {
    try {
        const agentId = req.colaborador.id;
        const { points } = req.body;

        if (!points || !Array.isArray(points) || points.length === 0) {
            return res.status(400).json({ error: 'points é obrigatório' });
        }
        console.log('SYNC_UNIFIED - points from', agentId)
        console.log('SYNC_UNIFIED - points first', points[0])
        console.log('SYNC_UNIFIED - points last', points[points.length - 1])

        const speedLimit = await getAgentSpeedLimit(agentId);
        const result = await insertUnifiedPoints(agentId, points, speedLimit);

        // Atualizar heartbeat com o último ponto recebido (sempre online quando sync)
        const lastPoint = points[points.length - 1];
        await updateHeartbeat(agentId, lastPoint.lat, lastPoint.lng);
        const response = {
            synced: result.inserted,
            violations: result.violations,
            speedLimitApplied: speedLimit,
        }
        console.log('SYNC_UNIFIED - response', response)
        res.json(response);
    } catch (err) {
        console.error('[SYNC_UNIFIED] Erro:', err);
        res.status(500).json({ error: 'Erro ao sincronizar dados unificados' });
    }
});

// GET /agent/tracking/config — configurações de tracking do agente
router.get('/tracking/config', telegramAuth, async (req, res) => {
    try {
        const agentId = req.colaborador.id;
        const [agentLimit, globalLimit] = await Promise.all([
            getAgentSpeedLimit(agentId),
            getGlobalSpeedLimit(),
        ]);
        res.json({
            agentSpeedLimit: agentLimit,
            globalSpeedLimit: globalLimit,
        });
    } catch (err) {
        console.error('[TRACKING_CONFIG GET] Erro:', err);
        res.status(500).json({ error: 'Erro ao buscar configurações' });
    }
});

// PUT /agent/tracking/config — atualizar configuração de tracking do agente
router.put('/tracking/config', telegramAuth, async (req, res) => {
    try {
        const agentId = req.colaborador.id;
        const { speedLimitKmh } = req.body;

        if (speedLimitKmh != null) {
            const limit = Number(speedLimitKmh);
            if (isNaN(limit) || limit < 1 || limit > 300) {
                return res.status(400).json({ error: 'speedLimitKmh deve ser entre 1 e 300' });
            }
            await upsertAgentSpeedLimit(agentId, limit, agentId);
        }

        res.json({ success: true });
    } catch (err) {
        console.error('[TRACKING_CONFIG PUT] Erro:', err);
        res.status(500).json({ error: 'Erro ao salvar configuração' });
    }
});

// GET /admin/tracking/speed-violations — listar violações da tabela unificada
router.get('/admin/tracking/speed-violations', async (req, res) => {
    try {
        const { agentId, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
        const offset = (parseInt(page) - 1) * Math.min(parseInt(limit), 200);
        const filters = { agentId, dateFrom, dateTo };
        const [rows, totalResult] = await Promise.all([
            getSpeedViolationsFromUnified(filters),
            cenos_pool.query(`SELECT COUNT(*) FROM tracking_session_points WHERE is_speed_violation = TRUE`),
        ]);
        res.json({ data: rows.slice(offset, offset + parseInt(limit)), total: Number(totalResult.rows[0].count) });
    } catch (err) {
        console.error('[SPEED_VIOLATIONS] Erro:', err);
        res.status(500).json({ error: 'Erro ao buscar violações' });
    }
});

// --- Heartbeat (nativo) ---
const { updateHeartbeat } = require('../functions/database/heartbeat');

// POST /agent/tracking/heartbeat — nativo envia presença + localização
router.post('/tracking/heartbeat', telegramAuth, async (req, res) => {
    try {
        const agentId = req.colaborador.id;
        const { lat, lng } = req.body;

        if (lat == null || lng == null) {
            return res.status(400).json({ error: 'lat e lng são obrigatórios' });
        }

        await updateHeartbeat(agentId, lat, lng);

        res.json({ success: true });
    } catch (err) {
        console.error('[HEARTBEAT] Erro:', err);
        res.status(500).json({ error: 'Erro ao registrar heartbeat' });
    }
});

// --- Notificações ---
const {
    getAgentNotifications,
    markNotificationsRead,
    markAllNotificationsRead
} = require('../functions/database/notifications');

// GET /agent/notifications — lista paginada
router.get('/notifications', telegramAuth, async (req, res) => {
    try {
        const agentId = req.colaborador.id;
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const unreadOnly = req.query.unread_only === 'true';

        const result = await getAgentNotifications(agentId, page, limit, unreadOnly);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[AGENT NOTIFICATIONS] Erro:', err.message);
        res.status(500).json({ error: 'Erro ao buscar notificações' });
    }
});

// POST /agent/notifications/read — marca como lidas
router.post('/notifications/read', telegramAuth, async (req, res) => {
    try {
        const agentId = req.colaborador.id;
        const { ids, all } = req.body;

        if (all) {
            await markAllNotificationsRead(agentId);
        } else if (ids && Array.isArray(ids) && ids.length > 0) {
            await markNotificationsRead(agentId, ids);
        } else {
            return res.status(400).json({ error: 'ids ou all é obrigatório' });
        }

        res.json({ success: true });
    } catch (err) {
        console.error('[AGENT NOTIFICATIONS] Erro ao marcar lidas:', err.message);
        res.status(500).json({ error: 'Erro ao marcar notificações como lidas' });
    }
});

module.exports = router;
