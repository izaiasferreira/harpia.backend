require('dotenv').config();
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const rootAbs = path.resolve(process.env.FILES_ROOT || path.join(__dirname, '../../public'));
if (!fs.existsSync(rootAbs)) fs.mkdirSync(rootAbs, { recursive: true });

router.get('/', (req, res) => {
    res.status(404).json({ detail: 'Seja bem vindo. Você não especificou um arquivo.' });
});

router.get('/*', (req, res) => {
    const filePath = decodeURIComponent(req.params[0] || '');
    if (!filePath) {
        return res.status(404).json({ detail: 'Seja bem vindo. Você não especificou um arquivo.' });
    }

    const safe = path.normalize(filePath).replace(/^[/\\]+/, '');
    const requested = path.resolve(rootAbs, safe);

    // Prevent path traversal
    if (!requested.startsWith(rootAbs)) {
        return res.status(403).json({ detail: 'Acesso negado.' });
    }

    if (fs.existsSync(requested) && fs.statSync(requested).isFile()) {
        return res.sendFile(requested);
    }

    return res.status(404).json({ detail: 'Arquivo não encontrado.' });
});

module.exports = { router, rootAbs };
