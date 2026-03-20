const express = require('express');
const router = express.Router();
const {
    pendencias,
    pendenciasJson,
    cnl,
    c12Json,
    e02Json,
    c16Json,
    perdas,
    perdasJson,
    notStartServices,
    completedServices,
    firstC12Json,
    CNLToLidoJson,
    firstCNLJson,
    C12ToLidoJson,
    incompletedServices,
    fastC12Json,
    licacaoNovaC12Json
} = require('../functions/postgresFunctions');

function today() {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function checkToken(req, res) {
    if (req.query.token !== process.env.API_TOKEN) {
        res.json({ error: 'Token inválido' });
        return false;
    }
    return true;
}

router.get('/pendencias', async (req, res) => {
    if (!checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const regional = req.query.regional || 'all';
        const result = await pendencias(state, regional);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/pendencias_json', async (req, res) => {
    if (!checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const regional = req.query.regional || 'all';
        const result = await pendenciasJson(state, regional);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/cnl', async (req, res) => {
    if (!checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const regional = req.query.regional || 'all';
        const dateinit = (req.query.dateinit || today()).replace('/', '.');
        const dateend = (req.query.dateend || today()).replace('/', '.');
        const result = await cnl(state, regional, dateinit, dateend);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/cnl_to_lido_json', async (req, res) => {
    if (!checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const regional = req.query.regional || 'all';
        const dateinit = (req.query.dateinit || today()).replace('/', '.');
        const result = await CNLToLidoJson(state, regional, dateinit);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/first_cnl_json', async (req, res) => {
    if (!checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const regional = req.query.regional || 'all';
        const dateinit = (req.query.dateinit || today()).replace('/', '.');
        const dateend = (req.query.dateend || today()).replace('/', '.');
        const result = await firstCNLJson(state, regional, dateinit, dateend);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/c12_json', async (req, res) => {
    if (!checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const regional = req.query.regional || 'all';
        const dateinit = (req.query.dateinit || today()).replace('/', '.');
        const dateend = (req.query.dateend || today()).replace('/', '.');
        const result = await c12Json(state, regional, dateinit, dateend);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/c12_to_lido_json', async (req, res) => {
    if (!checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const regional = req.query.regional || 'all';
        const dateinit = (req.query.dateinit || today()).replace('/', '.');
        const result = await C12ToLidoJson(state, regional, dateinit);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/first_c12_json', async (req, res) => {
    if (!checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const regional = req.query.regional || 'all';
        const dateinit = (req.query.dateinit || today()).replace('/', '.');
        const dateend = (req.query.dateend || today()).replace('/', '.');
        const result = await firstC12Json(state, regional, dateinit, dateend);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/fast_c12_json', async (req, res) => {
    if (!checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const regional = req.query.regional || 'all';
        const dateinit = (req.query.dateinit || today()).replace('/', '.');
        const dateend = (req.query.dateend || today()).replace('/', '.');
        const result = await fastC12Json(state, regional, dateinit, dateend);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/licacao_nova_c12_json', async (req, res) => {
    if (!checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const regional = req.query.regional || 'all';
        const dateinit = (req.query.dateinit || today()).replace('/', '.');
        const dateend = (req.query.dateend || today()).replace('/', '.');
        const result = await licacaoNovaC12Json(state, regional, dateinit, dateend);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/e02_json', async (req, res) => {
    if (!checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const regional = req.query.regional || 'all';
        const dateinit = (req.query.dateinit || today()).replace('/', '.');
        const dateend = (req.query.dateend || today()).replace('/', '.');
        const result = await e02Json(state, regional, dateinit, dateend);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/c16_json', async (req, res) => {
    if (!checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const regional = req.query.regional || 'all';
        const dateinit = (req.query.dateinit || today()).replace('/', '.');
        const dateend = (req.query.dateend || today()).replace('/', '.');
        const result = await c16Json(state, regional, dateinit, dateend);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/perdas', async (req, res) => {
    if (!checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const regional = req.query.regional || 'all';
        const dateinit = (req.query.dateinit || today()).replace('/', '.');
        const dateend = (req.query.dateend || today()).replace('/', '.');
        const result = await perdas(state, regional, dateinit, dateend);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/perdas_json', async (req, res) => {
    if (!checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const regional = req.query.regional || 'all';
        const dateinit = (req.query.dateinit || today()).replace('/', '.');
        const dateend = (req.query.dateend || today()).replace('/', '.');
        const result = await perdasJson(state, regional, dateinit, dateend);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/not_start_services', async (req, res) => {
    if (!checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const result = await notStartServices(state);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/completed_services', async (req, res) => {
    if (!checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const result = await completedServices(state);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/incompleted_services', async (req, res) => {
    if (!checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const result = await incompletedServices(state);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
