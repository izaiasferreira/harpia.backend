const express = require('express');
const router = express.Router();
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const { generateDashboardAdmin } = require('../functions/generateDashboard');
const {
    get_inventory_admin,
    get_justify_admin,
    get_pending_justifies_admin,
    get_daily_reports_admin,
    get_instalations_admin,
    get_users_agents_admin
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
router.get('/users_agents', verifyToken(), async (req, res) => {
    try {
        const user = req.user;
        const result = await get_users_agents_admin({ user });
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

        if (!cleanQueries.length) {
            return res.status(400).json({ error: 'Nenhuma query fornecida' });
        }
        if (cleanQueries.length > 10) {
            return res.status(400).json({ error: 'Limite de consulta excedido (máximo 10)' });
        }
        const results = await get_instalations_admin({ query: cleanQueries, type });

        res.json(results);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

// justify result example
// {
//     "id": 45,
//     "instalacao": "2000166754",
//     "tipo": "perda",
//     "motivo": "Falta de atenção",
//     "justificativa": "",
//     "foto": "http://localhost:3040/file/agents/T38876/1776617120611-T38876-owkfta.png",
//     "data_leit_prev": "04/03/2026",
//     "author": "T38876",
//     "estado": "pi",
//     "quantidade": null,
//     "created_at": "2026-04-19T16:45:31.694Z",
//     "updated_at": "2026-04-19T16:45:31.694Z"
// }
router.get('/justify', verifyToken(), verifyModule('justify'), async (req, res) => {
    try {
        const { instalacao, tipo, data_leit_prev, estado } = req.query;

        const result = await get_justify_admin({
            instalacao,
            tipo,
            data_leit_prev,
            estado
        });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// justify_pending result example
// {
//         "id": 1,
//         "autor": "t38876",
//         "quantidade": 10,
//         "tipo": null,
//         "unidade_leitura": "TH03B050",
//         "motivo": null,
//         "observacao": null,
//         "foto": null,
//         "estado": "pi",
//         "status": "pendente",
//         "created_at": "2026-04-20T12:50:26.962Z",
//         "updated_at": "2026-04-20T12:50:26.962Z"
// }
router.get('/justify_pending', verifyToken(), verifyModule('justify_pending'), async (req, res) => {
    try {
        const { autor, status, page, limit, estado } = req.query;
        const user = req.user;

        const result = await get_pending_justifies_admin({
            state: estado,
            autor,
            status,
            page,
            limit,
            user
        });

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// daily_report result example
// {
//    "id": 1,
//    "autor": "t38876",
//    "nota": 4,
//    "motivo": "Tudo certo",
//    "observacao": "Deu certo",
//    "estado": "pi",
//    "data_report": "2026-04-15T03:00:00.000Z",
//    "created_at": "2026-04-15T01:56:53.731Z",
//    "updated_at": "2026-04-15T01:56:53.731Z",
//    "foto": "http://files.izi.tec.br:9000/api-banco-prod/agents/T38876/1776217829450-T38876-echin.png"
// }
router.get('/daily_report', verifyToken(), verifyModule('daily_report'), async (req, res) => {
    try {
        const { autor, data, limit } = req.query;
        const user = req.user;
        const reports = await get_daily_reports_admin({ autor, data, limit, page: 1, includeAll: true, user });
        res.json(reports);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// inventory result example
// {
// "id": 43,
// "agente": "l83649894",
// "pda_imei_1": "353101 867268 186",
// "pda_imei_2": "895510 951600 084",
// "pda_numero_serie": "R9QY100RRVN",
// "pda_marca": "SAMSUNG",
// "pda_modelo": "SM-A057M",
// "pda_numero_chip": "(86) 98105-6395",
// "pda_versao_android": "15.0",
// "pda_versao_bluetooth": null,
// "impressora_numero_serie": "XXRBN250800695",
// "impressora_modelo": "ZQ521",
// "impressora_marca": "ZEBRA",
// "estado": "pi",
// "created_at": "2026-04-15T20:10:13.953Z",
// "updated_at": "2026-04-15T20:10:13.953Z"
//}
router.get('/inventory', verifyToken(), verifyModule('inventory'), async (req, res) => {
    try {
        const user = req.user;
        const result = await get_inventory_admin({ user });
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