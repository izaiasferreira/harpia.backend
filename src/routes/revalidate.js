const express = require('express');
const router = express.Router();
const { getFilesForRevalidate, saveRevalidateFile } = require('../functions/postgresFunctions');

function checkToken(req, res) {
    if (req.query.token !== process.env.API_TOKEN) {
        res.json({ error: 'Token inválido' });
        return false;
    }
    return true;
}

router.get('/files_for_revalidate', async (req, res) => {
    if (!checkToken(req, res)) return;
    try {
        const result = await getFilesForRevalidate();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/revalidate_file', async (req, res) => {
    if (!checkToken(req, res)) return;
    try {
        const { instalacao, data, validation } = req.body;
        const result = await saveRevalidateFile(instalacao, data, validation);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
