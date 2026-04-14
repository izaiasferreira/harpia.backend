const express = require('express');
const router = express.Router();
const multer = require('multer');
require('dotenv').config();

const { minioClient, BUCKET_NAME, ensureBucketExists, getPublicUrl } = require('../functions/minio');

function checkToken(req, res) {
    if (req.query.token !== process.env.API_TOKEN) {
        res.status(401).json({ error: 'Token inválido' });
        return false;
    }
    return true;
}

const storage = multer.memoryStorage();
const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }
});

router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!checkToken(req, res)) return;

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
        const fileName = `${timestamp}-${Math.random().toString(36).substring(7)}.${ext}`;
        const fullPath = `reports/${fileName}`;

        await minioClient.putObject(BUCKET_NAME, fullPath, req.file.buffer);

        res.json({
            success: true,
            fileName: fullPath,
            url: getPublicUrl(fullPath),
            size: req.file.size,
            mimetype: req.file.mimetype
        });

    } catch (err) {
        console.error('Erro no upload:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/upload/health', async (req, res) => {
    try {
        await minioClient.listBuckets();
        res.json({ status: 'ok', bucket: BUCKET_NAME });
    } catch (err) {
        res.status(500).json({ status: 'error', error: err.message });
    }
});

module.exports = router;