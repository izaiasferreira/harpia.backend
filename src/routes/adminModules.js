const express = require('express');
const { validate } = require('../middlewares/validate');
const { userCreateSchema, userUpdateSchema, agentCreateSchema, agentUpdateSchema } = require('../db/schemas/users');
const { justificativaCreateSchema, justifyPendingCreateSchema, justificativaSchema, justifyPendingSchema } = require('../db/schemas/justify');
const { dailyReportCreateSchema, dailyReportSchema } = require('../db/schemas/dailyReport');
const { inventoryCreateSchema, inventorySchema } = require('../db/schemas/inventory');
const z = require('zod');

const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const { generateDashboardAdmin } = require('../functions/generateDashboard');
const {
    get_inventory_admin,
    update_inventory_admin,
    delete_inventory_admin,
    get_justify_admin,
    save_justify_admin,
    update_justify_admin,
    delete_justify_admin,
    get_pending_justifies_admin,
    update_pending_justify_admin,
    delete_pending_justify_admin,
    get_daily_reports_admin,
    update_daily_report_admin,
    delete_daily_report_admin,
    get_instalations_admin,
    get_users_agents_admin,
    get_users_agents_admin_paginated,
    get_users_only_login_paginated,
    create_user_agent_admin,
    update_user_agent_admin,
    delete_user_agent_admin,
    bulk_update_user_agents_admin,
    bulk_delete_user_agents_admin,
    get_justify_types_admin,
    get_user_agent_options,
    getUserAllowedStatePools
} = require('../functions/database/admin');
const { listModules } = require('../functions/modules');
const {
    getUserData,
    getLeiturasForAgent,
    checkJustifiedByInstallations,
    perdas,
    getLeiturasPendingForAgent,
    get_pending_justifies
} = require('../functions/postgresFunctions');

const {
    getLeiturasGeral
} = require('../functions/database/getLeiturasGeral');
const { parse_date, today } = require('../utils/dates');






const { processAgentImport } = require('../functions/database/agentImport');

// Dashboard
router.get('/dashboard', verifyToken(), async (req, res) => {
    try {
        const user = req.user;
        const [inventory, justify, justify_pending, daily_report, users_agents] = await Promise.all([
            get_inventory_admin({ user }),
            get_justify_admin({ user }),
            get_pending_justifies_admin({ user, status: 'pendente', page: 1, limit: 100000 }),
            get_daily_reports_admin({ user, page: 1, limit: 100000 }),
            get_users_agents_admin({ user })
        ]);
        const result = await generateDashboardAdmin({
            user,
            stats: {
                inventory,
                justify,
                justify_pending,
                daily_report,
                users_agents: users_agents?.filter(a => a.telegram_id != null && a.telegram_id !== "")
            }
        })
        res.json(result);
    } catch (error) {
        console.log(error)
        res.status(500).json({ error: error.message });
    }
});

router.get('/users_agents', verifyToken(), verifyModule('users_agents'), async (req, res) => {
    try {
        const { page, limit, search, regional, seccional, gestor, estado } = req.query;
        const user = req.user;
        const result = await get_users_agents_admin_paginated({ user, page, limit, search, regional, seccional, gestor, estado });
        res.json(result);
    } catch (error) {
        console.log(error)
        res.status(500).json({ error: error.message });
    }
});

router.get('/users_agents/only_login', verifyToken(), verifyModule('users_agents'), async (req, res) => {
    try {
        const { page, limit, search, estado } = req.query;
        const user = req.user;
        const result = await get_users_only_login_paginated({ user, page, limit, search, estado });
        res.json(result);
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: error.message });
    }
});

router.put('/users_agents/bulk', verifyToken(), verifyModule('bulk_update_user_agent'), async (req, res) => {
    try {
        const { ids, data } = req.body;
        const user = req.user;
        const result = await bulk_update_user_agents_admin({ ids, data, user });
        if (result.error) return res.status(400).json({ error: result.error });
        res.json(result);
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: error.message });
    }
});

router.delete('/users_agents/bulk', verifyToken(), verifyModule('users_agents'), async (req, res) => {
    try {
        const { ids, deleteLogin } = req.body;
        const user = req.user;
        const result = await bulk_delete_user_agents_admin({ ids, deleteLogin, user });
        if (result.error) return res.status(403).json({ error: result.error });
        res.json(result);
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/users_agents/profile', verifyToken(), verifyModule('users_agents'), async (req, res) => {
    const { id } = req.query;
    const user = req.user;
    const [userData, completed, pending, pending_justifies] = await Promise.all([
        getUserData({ id: id, state: user.estado }),
        getLeiturasForAgent({ state: user.estado, id, limit: 99999 }),
        getLeiturasPendingForAgent({ state: user.estado, id, limit: 99999 }),
        get_pending_justifies({ autor: id, status: 'pendente', page: 1, limit: 100 })
    ])
    const cnl = completed?.filter(r => r.ntlei && !r.ntlei.startsWith('A') && !['B09', 'B10', 'B15'].includes(r.ntlei)).length || 0;
    const perdas = completed?.filter(r => r.tem_perda === "PERDA" && r.perda_prevista_mensal && parseInt(r.perda_prevista_mensal) > 0).reduce((acc, r) => acc + parseInt(r.perda_prevista_mensal), 0) || 0;

    const completedCount = completed ? completed.length : 0;
    
    return res.json({
        user: {
            name: `${userData.id} -  ${userData.nome || 'Desconhecido'}`,
            role: userData.cargo || 'Desconhecido',
            location: userData.regional || 'Desconhecido',
            photo: userData.profilePicUrl || "https://api.izi.tec.br/files/assets/profile.png",
            stats: {
                level: userData.level || 0
            },
            summary: [
                { title: 'Pendências', value: pending?.length || 0 },
                { title: 'Concluídos', value: completedCount },
                { title: 'CNL Percentual', value: completedCount > 0 ? `${(((cnl || 0) / completedCount) * 100).toFixed(2)}%` : '0%' },
                { title: 'CNL Quantidade', value: cnl },
                { title: 'Perdas geradas', value: perdas },
                { title: 'Justificativas Pendentes', value: pending_justifies?.length || 0 },
            ]
        },
        goals: [
            { id: 1, title: 'Não ultrapassar a meta de CNL', completed: false },
            { id: 2, title: 'Ter 80% do CNL indevidos justificado', completed: false },
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

router.get('/users_agents/services', verifyToken(), verifyModule('users_agents'), async (req, res) => {
    try {
        const { id, page, date, filter, search } = req.query;
        if (!id) return res.status(400).json({ error: 'Parâmetro id é obrigatório' });

        const user = req.user;
        const atual_filter = filter || 'all';

        // Tratar data: se já está em DD.MM.YYYY, usar direto; senão usar parse_date
        let today_date = date ? parse_date(date) : today();

        const state = user.estado || 'pi';

        const result = await getLeiturasForAgent({
            state,
            id,
            date: today_date,
            page: page || 1,
            filter: atual_filter,
            search: search || ''
        });

        const data = Array.isArray(result) ? result : result?.data || [];
        if (data.length > 0) {
            const installations = data.map(r => r.instalacao);
            const justified = await checkJustifiedByInstallations(installations, state);

            const resultWithJustified = (Array.isArray(result) ? result : data).map(r => ({
                ...r,
                justificado: !!justified[r.instalacao]
            }));

            if (Array.isArray(result)) {
                return res.json(resultWithJustified);
            } else {
                return res.json({ ...result, data: resultWithJustified });
            }
        }

        res.json(result);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/services', verifyToken(), verifyModule('users_agents'), async (req, res) => {
    try {
        const { page, date, search } = req.query;
        const user = req.user;

        // Apply unified agent permission filter
        const allowedAgents = await get_users_agents_admin({ user, limit: 999999, page: 1 });
        const allowedAgentIds = allowedAgents.map(a => a.id).filter(Boolean);
        
        // If user has no access to any agents (and is not full admin), return empty array
        const isAdmin = user && (user.role || '').toLowerCase().includes('admin');
        if (!isAdmin && allowedAgentIds.length === 0) {
            return res.json([]);
        }

        // Buscar estados permitidos para o usuário (todos se for admin)
        const allowedPools = getUserAllowedStatePools(user);
        const states = allowedPools.map(p => p.state);

        // Tratar data: se já está em DD.MM.YYYY, usar direto; senão usar parse_date
        let today_date;
        if (date) {
            if (date.includes('.') && date.length >= 10) {
                today_date = date;
            } else {
                today_date = parse_date(date);
            }
        } else {
            today_date = today();
        }

        const result = await getLeiturasGeral({
            states,
            date: today_date,
            page: page || 1,
            search: search || '',
            allowedAgentIds: isAdmin ? null : allowedAgentIds // Admins see all without ID filter
        });

        res.json(result);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/perdas', verifyToken(), verifyModule('perdas'), async (req, res) => {
    try {
        const { dateinit, dateend, search } = req.query;
        const user = req.user;

        // Buscar estados permitidos para o usuário
        const allowedPools = getUserAllowedStatePools(user);
        const states = allowedPools.map(p => p.state);

        // Processar datas
        const todayStr = today();
        const init = dateinit ? (dateinit.includes('.') ? dateinit : parse_date(dateinit)) : todayStr;
        const end = dateend ? (dateend.includes('.') ? dateend : parse_date(dateend)) : todayStr;

        // Buscar perdas em todos os estados permitidos
        let allPerdas = [];
        for (const state of states) {
            try {
                const result = await perdas(state, 'all', init, end);
                allPerdas = allPerdas.concat(result);
            } catch (err) {
                console.log(`Error querying perdas for state ${state}:`, err.message);
            }
        }

        // Filtrar por busca textual se fornecido
        if (search && search.trim() !== '') {
            const searchLower = search.toLowerCase();
            allPerdas = allPerdas.filter(p =>
                (p.instalacao && p.instalacao.toLowerCase().includes(searchLower)) ||
                (p.regional && p.regional.toLowerCase().includes(searchLower)) ||
                (p.seccional && p.seccional.toLowerCase().includes(searchLower)) ||
                (p.nome_agente && p.nome_agente.toLowerCase().includes(searchLower)) ||
                (p.supervisor && p.supervisor.toLowerCase().includes(searchLower)) ||
                (p.ntlei && p.ntlei.toLowerCase().includes(searchLower)) ||
                (p.tem_perda && p.tem_perda.toLowerCase().includes(searchLower))
            );
        }

        res.json(allPerdas);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/users_agents/options', verifyToken(), verifyModule(['users_agents', 'checklists', 'permissions']), async (req, res) => {
    try {
        const { estado, regional, seccional } = req.query;
        console.log(estado)
        
        const result = await get_user_agent_options({
            estado: estado !== undefined ? estado : req.user.estado,
            regional,
            seccional,
            user: req.user
        });
        res.json(result);
    } catch (error) {
        console.log(error)
        res.status(500).json({ error: error.message });
    }
});

router.get('/users_agents/:id', verifyToken(), verifyModule('users_agents'), async (req, res) => {
    try {
        const user = req.user;
        const { id } = req.params;
        const result = await get_users_agents_admin({ user, ids: [id] });

        if (!result.length) return res.status(404).json({ error: 'Usuário não encontrado' });

        return res.json(result[0]);
    } catch (error) {
        console.log(error)
        res.status(500).json({ error: error.message });
    }
});

router.post('/users_agents/import', verifyToken(), verifyModule('create_user_agent'), upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
        }
        const user = req.user;
        const result = await processAgentImport(req.file.buffer, user);
        res.json(result);
    } catch (error) {
        console.error('[IMPORT AGENTS]', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/users_agents', verifyToken(), verifyModule('create_user_agent'), validate(agentCreateSchema), async (req, res) => {
    try {
        const { id, matricula, nome, estado, gestor, cargo, seccional, regional, status, situacao, processo } = req.body;
        const user = req.user;
        const result = await create_user_agent_admin({ id, matricula, nome, estado, gestor, cargo, seccional, regional, status, situacao, processo, user });
        res.json(result);
    } catch (error) {
        console.log(error)
        res.status(500).json({ error: error.message });
    }
});

router.put('/users_agents/:id', verifyToken(), verifyModule('update_user_agent'), validate(agentUpdateSchema), async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, gestor, cargo, seccional, regional, estado, status, situacao, matricula, processo } = req.body;
        const user = req.user;

        if (estado !== undefined || status !== undefined || situacao !== undefined) {
            const hasManageAgents = user.role.toLowerCase().includes('admin') || (user.modules || []).includes('manage_agents');
            if (!hasManageAgents) {
                const existing = await get_users_agents_admin({ user, ids: [id] });
                if (existing && existing.length > 0) {
                    const agent = existing[0];
                    const changedEstado = estado !== undefined && estado !== null && estado.toLowerCase() !== (agent.estado || '').toLowerCase();
                    const changedStatus = status !== undefined && status !== null && status !== agent.status;
                    const changedSituacao = situacao !== undefined && situacao !== null && situacao !== agent.situacao;
                    if (changedEstado || changedStatus || changedSituacao) {
                        return res.status(403).json({ error: 'Você não tem permissão (módulo manage_agents) para alterar o estado, status ou situação do colaborador.' });
                    }
                } else {
                    return res.status(404).json({ error: 'Usuário não encontrado' });
                }
            }
        }

        const isAdmin = user.role.toLowerCase().includes('admin');
        const updateData = { id, nome, gestor, cargo, seccional, regional, estado, status, situacao, processo, user };
        
        if (isAdmin && matricula !== undefined) {
            updateData.matricula = matricula;
        }

        const result = await update_user_agent_admin(updateData);
        res.json(result);
    } catch (error) {
        console.log(error)
        res.status(500).json({ error: error.message });
    }
});

router.delete('/users_agents/:id', verifyToken(), verifyModule('delete_user_agent'), async (req, res) => {
    try {
        const { id } = req.params;
        const { deleteLogin } = req.query;
        const user = req.user;
        const result = await delete_user_agent_admin({ id, user, deleteLogin: deleteLogin === 'true' });
        res.json(result);
    } catch (error) {
        console.log(error)
        res.status(500).json({ error: error.message });
    }
});


// Search installation
router.post('/search_in', verifyToken(), verifyModule('search_in'), validate(z.object({ type: z.string(), queries: z.array(z.string()) })), async (req, res) => {
    try {
        const { type, queries, estado } = req.body;
        const cleanQueries = queries.map(q => q.trim()).filter(Boolean);
        if (!cleanQueries.length) return res.status(400).json({ error: 'Nenhuma query fornecida' });
        if (cleanQueries.length > 10) return res.status(400).json({ error: 'Limite de consulta excedido (máximo 10)' });
        const results = await get_instalations_admin({ query: cleanQueries, type, user: req.user, estado });
        res.json(results);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

router.put('/search_in/:id', verifyToken(), verifyModule('update_search_in'), async (req, res) => {
    try {
        res.json({ message: 'Funcionalidade de atualização de instalação em desenvolvimento' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/justify', verifyToken(), verifyModule('justify'), async (req, res) => {
    try {
        const { instalacao, tipo, data_leit_prev, estado, page, limit, search } = req.query;
        const user = req.user;
        const result = await get_justify_admin({ instalacao, tipo, data_leit_prev, estado, page, limit, search, user });
        res.json(result);
    } catch (error) {
        console.log(error)
        res.status(500).json({ error: error.message });
    }
});


router.get('/justify/types', verifyToken(), verifyModule('justify'), async (req, res) => {
    try {
        const result = await get_justify_types_admin();
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/justify', verifyToken(), verifyModule('create_justify'), validate(justificativaCreateSchema), async (req, res) => {
    try {
        const result = await save_justify_admin(req.body);
        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/justify/:id', verifyToken(), verifyModule('update_justify'), validate(justificativaSchema.partial()), async (req, res) => {
    try {
        const result = await update_justify_admin(req.params.id, req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/justify/:id', verifyToken(), verifyModule('delete_justify'), async (req, res) => {
    try {
        console.log(req.params.id)
        const result = await delete_justify_admin(req.params.id);
        res.json(result);
    } catch (error) {
        console.log(error)
        res.status(500).json({ error: error.message });
    }
});

router.get('/justify_pending', verifyToken(), verifyModule('justify_pending'), async (req, res) => {
    try {
        const { autor, status, page, limit, estado, search } = req.query;
        const user = req.user;
        const result = await get_pending_justifies_admin({ state: estado, autor, status, page, limit, user, search });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


router.put('/justify_pending/:id', verifyToken(), verifyModule('update_justify_pending'), validate(justifyPendingSchema.partial()), async (req, res) => {
    try {
        const result = await update_pending_justify_admin(req.params.id, req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/justify_pending/:id', verifyToken(), verifyModule('delete_justify_pending'), async (req, res) => {
    try {
        const result = await delete_pending_justify_admin(req.params.id);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/daily_report', verifyToken(), verifyModule('daily_report'), async (req, res) => {
    try {
        const { autor, data, limit, page, search, estado, motivo } = req.query;
        const user = req.user;
        const reports = await get_daily_reports_admin({ autor, data, limit, page, includeAll: false, user, search, estado, motivo });
        res.json(reports);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/daily_report/:id', verifyToken(), verifyModule('update_daily_report'), validate(dailyReportSchema.partial()), async (req, res) => {
    try {
        const result = await update_daily_report_admin(req.params.id, req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/daily_report/:id', verifyToken(), verifyModule('delete_daily_report'), async (req, res) => {
    try {
        const result = await delete_daily_report_admin(req.params.id);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


router.get('/available_modules', verifyToken('COMPANY_ADMIN'), async (req, res) => {
    try {
        const modules = await listModules();
        res.json(modules);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;