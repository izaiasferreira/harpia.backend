const express = require('express');
const router = express.Router();
const multer = require('multer');
const { Client } = require('minio');
require('dotenv').config();

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

const minioClient = new Client({
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT) || 9000,
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin'
});

const BUCKET_NAME = process.env.MINIO_BUCKET || 'api-banco';
const PUBLIC_URL = process.env.MINIO_PUBLIC_URL || 'http://localhost:9000';

async function ensureBucketExists() {
    const bucketExists = await minioClient.bucketExists(BUCKET_NAME);
    if (!bucketExists) {
        await minioClient.makeBucket(BUCKET_NAME);
        console.log(`Bucket '${BUCKET_NAME}' criado com sucesso.`);
        
        await minioClient.setBucketPolicy(BUCKET_NAME, JSON.stringify({
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Principal": "*",
                    "Action": ["s3:GetObject"],
                    "Resource": [`arn:aws:s3:::${BUCKET_NAME}/*`]
                }
            ]
        }));
    }
}

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

        const publicUrl = `${PUBLIC_URL}/${BUCKET_NAME}/${fullPath}`;

        res.json({
            success: true,
            fileName: fullPath,
            url: publicUrl,
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