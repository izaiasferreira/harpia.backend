const express = require('express');
const router = express.Router();
const {
    pendencias,
    pendenciasJson,
    cnl,
    c12Json,
    perdas,
    perdasJson,
    notStartServices,
    completedServices
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
        const regional = req.query.regional || 'all';
        const result = await pendencias(regional);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/pendencias_json', async (req, res) => {
    if (!checkToken(req, res)) return;
    try {
        const regional = req.query.regional || 'all';
        const result = await pendenciasJson(regional);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/cnl', async (req, res) => {
    if (!checkToken(req, res)) return;
    try {
        const regional = req.query.regional || 'all';
        const dateinit = (req.query.dateinit || today()).replace('/', '.');
        const dateend = (req.query.dateend || today()).replace('/', '.');
        const result = await cnl(regional, dateinit, dateend);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/c12_json', async (req, res) => {
    if (!checkToken(req, res)) return;
    try {
        const regional = req.query.regional || 'all';
        const dateinit = (req.query.dateinit || today()).replace('/', '.');
        const dateend = (req.query.dateend || today()).replace('/', '.');
        const result = await c12Json(regional, dateinit, dateend);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/perdas', async (req, res) => {
    if (!checkToken(req, res)) return;
    try {
        const regional = req.query.regional || 'all';
        const dateinit = (req.query.dateinit || today()).replace('/', '.');
        const dateend = (req.query.dateend || today()).replace('/', '.');
        const result = await perdas(regional, dateinit, dateend);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/perdas_json', async (req, res) => {
    if (!checkToken(req, res)) return;
    try {
        const regional = req.query.regional || 'all';
        const dateinit = (req.query.dateinit || today()).replace('/', '.');
        const dateend = (req.query.dateend || today()).replace('/', '.');
        const result = await perdasJson(regional, dateinit, dateend);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/not_start_services', async (req, res) => {
    if (!checkToken(req, res)) return;
    try {
        const result = await notStartServices();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/completed_services', async (req, res) => {
    if (!checkToken(req, res)) return;
    try {
        const result = await completedServices();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
