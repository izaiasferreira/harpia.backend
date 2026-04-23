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
    checkJustifiedByInstallations,
    respond_pending_justify,
    get_pending_justify_by_id,
    get_pending_justifies,
    save_daily_report,
    get_daily_reports,
    get_daily_report_today,
    get_inventory_by_agent,
    save_inventory,
    create_security_report
} = require('../functions/postgresFunctions');
const { minioClient, CONFIG, ensureBucketExists, getFileUrl, compressImage } = require('../functions/minio');
const { telegramAuth } = require('../middlewares/telegramAuth');
const { today, parse_date } = require('../utils/dates');
const multer = require('multer');
const { generateDashboard } = require('../functions/generateDashboard');
const { generateCustomLinks } = require('../functions/generateCustomLinks');

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
        const [
            result,
            pending,
            licacao_nova_c12_rows,
            fast_c12_rows,
            first_c12_rows,
            weekly_cnl_stats,
            pending_justifies
        ] = await Promise.all([
            getLeiturasForAgent({ state, id, date: today_date, limit: 99999 }),
            getLeiturasPendingForAgent({ state, id, date: today_date, limit: 99999 }),
            licacaoNovaC12ForAgent({ state, id, date: today_date }),
            fastC12ForAgent({ state, id, date: today_date }),
            firstC12ForAgent({ state, id, date: today_date }),
            getWeeklyCNLStats({ state, id, date: today_date }),
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

        
        const layout = generateDashboard({
            state,
            id,
            today_date,
            stats: {
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

router.get('/agent_services', async (req, res) => {
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
        const links = generateCustomLinks({ state, id });
        return res.json(links);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/get_justify', async (req, res) => {
    try {
        const { tipo, instalacao, data_leit_prev } = req.query;
        const estado = req.colaborador.estado;
        const results = await get_justify({ estado, tipo, instalacao, data_leit_prev });

        var instalation_data = await get_instalations_matriz({ estado, instalacao, data_leit_prev });
        delete instalation_data['tipo'];

        console.log(instalation_data);



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

router.post('/security_report', async (req, res) => {
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


module.exports = router;
