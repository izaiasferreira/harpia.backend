const express = require('express');
const { getFilesForRevalidate, saveRevalidateFile, getFilterOptions, getFilesForView } = require('../functions/database/revalidate');
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const router = express.Router();

router.get('/files_for_revalidate', verifyToken(), verifyModule('revalidate'), async (req, res) => {
    try {
        const result = await getFilesForRevalidate();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/revalidate_file', verifyToken(), verifyModule('revalidate_write'), async (req, res) => {
    try {
        const { instalacao, data, validation } = req.body;

        console.log(instalacao, data, validation);
        const result = await saveRevalidateFile(instalacao, data, validation);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/filter_options', verifyToken(), verifyModule('revalidate') , async (req, res) => {
    try {
        const result = await getFilterOptions();
        console.log(result);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/files_for_view', verifyToken(), verifyModule('revalidate'), async (req, res) => {
    try {
        const { date, regional, seccional, agent, validation: validacao } = req.query;
        const result = await getFilesForView(date, regional, seccional, agent, validacao);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
