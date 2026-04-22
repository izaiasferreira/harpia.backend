const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const { generateDashboardAdmin } = require('../functions/generateDashboard');
const {
    get_inventory_admin,
    save_inventory_admin,
    update_inventory_admin,
    delete_inventory_admin,
    get_justify_admin,
    save_justify_admin,
    update_justify_admin,
    delete_justify_admin,
    get_pending_justifies_admin,
    create_pending_justify_admin,
    update_pending_justify_admin,
    delete_pending_justify_admin,
    get_daily_reports_admin,
    create_daily_report_admin,
    update_daily_report_admin,
    delete_daily_report_admin,
    get_instalations_admin,
    get_users_agents_admin,
    create_user_agent_admin,
    update_user_agent_admin,
    delete_user_agent_admin,
    send_message_to_agent,
    get_justify_types_admin,
    get_user_agent_options
} = require('../functions/database/admin');
const { listModules } = require('../functions/modules');






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
                users_agents
            }
        })
        res.json(result);
    } catch (error) {
        console.log(error)
        res.status(500).json({ error: error.message });
    }
});

// users_agents result example
// [
// {
//     "id": "T47384",
//     "telegram_id": "7136458344",
//     "estado": "pi",
//     "Nome": "MAURICIO PINTO RODRIGUES",
//     "seccional": "UAC TERESINA",
//     "regional": "METROPOLITANA",
//     "setor": "COBRANÇA",
//     "cargo": "AGENTE COMERCIAL MOTOCICLISTA",
//     "gestor": "DIOGO VICTOR SOARES MOURA",
//     "matricula": "017865"
// }
// ]
router.get('/users_agents', verifyToken(), verifyModule('users_agents'), async (req, res) => {
    try {
        const { page, limit, search, regional, seccional, gestor, estado } = req.query;
        const user = req.user;
        const result = await get_users_agents_admin({ user, page, limit, search, regional, seccional, gestor, estado });
        res.json(result);
    } catch (error) {
        console.log(error)
        res.status(500).json({ error: error.message });
    }
});

router.get('/users_agents/options', verifyToken(), verifyModule('users_agents'), async (req, res) => {
    try {
        const { estado } = req.query;
        const result = await get_user_agent_options({ estado: estado || req.user.estado });
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

router.post('/users_agents', verifyToken(), verifyModule('create_user_agent'), async (req, res) => {
    try {
        const { id, matricula, nome, estado, gestor, cargo, seccional, regional } = req.body;
        const user = req.user;
        const result = await create_user_agent_admin({ id, matricula, nome, estado, gestor, cargo, seccional, regional, user });
        res.json(result);
    } catch (error) {
        console.log(error)
        res.status(500).json({ error: error.message });
    }
});

router.put('/users_agents/:id', verifyToken(), verifyModule('update_user_agent'), async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, gestor, cargo, seccional, regional } = req.body;
        const user = req.user;
        const result = await update_user_agent_admin({ id, nome, gestor, cargo, seccional, regional, user });
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

router.post('/send_message_user_agent', verifyToken(), verifyModule('send_message_user_agent'), upload.single('file'), async (req, res) => {
    try {
        const { id, text, file: fileUrl, webAppButtonText, webAppButtonUrl, options } = req.body;
        const file = req.file; // From multer
        const user = req.user;
        const result = await send_message_to_agent({ 
            id, 
            text, 
            file: file || fileUrl, 
            webAppButtonText, 
            webAppButtonUrl, 
            options, 
            user 
        });
        res.json(result);
    } catch (error) {
        console.log(error)
        res.status(500).json({ error: error.message });
    }
});

// Search installation
router.post('/search_in', verifyToken(), verifyModule('search_in'), async (req, res) => {
    try {
        const { type, queries } = req.body;
        const cleanQueries = queries.map(q => q.trim()).filter(Boolean);
        if (!cleanQueries.length) return res.status(400).json({ error: 'Nenhuma query fornecida' });
        if (cleanQueries.length > 10) return res.status(400).json({ error: 'Limite de consulta excedido (máximo 10)' });
        const results = await get_instalations_admin({ query: cleanQueries, type });
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
        const result = await get_justify_admin({ instalacao, tipo, data_leit_prev, estado, page, limit, search });
        res.json(result);
    } catch (error) {
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

router.post('/justify', verifyToken(), verifyModule('create_justify'), async (req, res) => {
    try {
        const result = await save_justify_admin(req.body);
        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/justify/:id', verifyToken(), verifyModule('update_justify'), async (req, res) => {
    try {
        const result = await update_justify_admin(req.params.id, req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/justify/:id', verifyToken(), verifyModule('delete_justify'), async (req, res) => {
    try {
        const result = await delete_justify_admin(req.params.id);
        res.json(result);
    } catch (error) {
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


router.post('/justify_pending', verifyToken(), verifyModule('create_justify_pending'), async (req, res) => {
    try {
        const result = await create_pending_justify_admin(req.body);
        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/justify_pending/:id', verifyToken(), verifyModule('update_justify_pending'), async (req, res) => {
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

router.post('/daily_report', verifyToken(), verifyModule('create_daily_report'), async (req, res) => {
    try {
        const result = await create_daily_report_admin(req.body);
        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/daily_report/:id', verifyToken(), verifyModule('update_daily_report'), async (req, res) => {
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

router.get('/inventory', verifyToken(), verifyModule('inventory'), async (req, res) => {
    try {
        const { page, limit, search } = req.query;
        const user = req.user;
        const result = await get_inventory_admin({ user, page, limit, search });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/inventory', verifyToken(), verifyModule('create_inventory'), async (req, res) => {
    try {
        const result = await save_inventory_admin(req.body);
        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/inventory/:id', verifyToken(), verifyModule('update_inventory'), async (req, res) => {
    try {
        const result = await update_inventory_admin(req.params.id, req.body);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/inventory/:id', verifyToken(), verifyModule('delete_inventory'), async (req, res) => {
    try {
        const result = await delete_inventory_admin(req.params.id);
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