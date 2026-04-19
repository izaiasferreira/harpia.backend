const express = require('express');
const router = express.Router();
const multer = require('multer');

const { minioClient, CONFIG, compressImage, ensureBucketExists, getFileUrl } = require('../functions/minio');
const { verifyToken } = require('../middlewares/jwtAuth');

const storage = multer.memoryStorage();
const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }  // 10MB
});

// ==========================================
// Endpoints
// ==========================================

/**
 * POST /upload
 * Upload de arquivo com compressão de imagem
 */
router.post('/upload', upload.single('file'), verifyToken, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        }

        // Tipos permitidos
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
        if (!allowedTypes.includes(req.file.mimetype)) {
            return res.status(400).json({ error: 'Tipo de arquivo não permitido' });
        }

        await ensureBucketExists();

        // Gera nome único
        const timestamp = Date.now();
        const ext = req.file.originalname.split('.').pop();
        const fileName = `${timestamp}-${Math.random().toString(36).substring(7)}.${ext}`;
        const fullPath = `reports/${fileName}`;

        // Comprime imagem se necessário
        let fileBuffer = req.file.buffer;
        let originalSize = fileBuffer.length;

        if (['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(req.file.mimetype)) {
            fileBuffer = await compressImage(fileBuffer, req.file.mimetype);
        }

        // Upload
        await minioClient.putObject(CONFIG.bucket, fullPath, fileBuffer);

        res.json({
            success: true,
            fileName: fullPath,
            url: getFileUrl(fullPath),
            size: fileBuffer.length,
            originalSize: originalSize,
            compression: originalSize !== fileBuffer.length 
                ? Math.round((1 - fileBuffer.length / originalSize) * 100) + '%' 
                : null,
            mimetype: req.file.mimetype
        });

    } catch (err) {
        console.error('Erro no upload:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /file/:path
 * Serve arquivos do bucket padrão (como imagem pública)
 */
router.get('/file/:path(*)', async (req, res) => {
    try {
        const objectName = req.params.path;
        const stream = await minioClient.getObject(CONFIG.bucket, objectName);
        
        // Detecta content-type pelo extensão do arquivo
        const ext = objectName.split('.').pop()?.toLowerCase();
        const contentTypes = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'pdf': 'application/pdf'
        };
        
        const contentType = contentTypes[ext] || 'application/octet-stream';
        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'public, max-age=31536000');
        res.set('Access-Control-Allow-Origin', '*');
        
        stream.pipe(res);
    } catch (err) {
        console.error('Erro ao servir arquivo:', err.message);
        res.status(404).json({ error: 'Arquivo não encontrado' });
    }
});

/**
 * GET /files/:bucket/:path
 * Serve arquivos de bucket específico
 */
router.get('/files/:bucket/:path(*)', async (req, res) => {
    try {
        const { bucket, path } = req.params;
        const stream = await minioClient.getObject(bucket, path);
        
        const ext = path.split('.').pop()?.toLowerCase();
        const contentTypes = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'pdf': 'application/pdf'
        };
        
        const contentType = contentTypes[ext] || 'application/octet-stream';
        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'public, max-age=31536000');
        res.set('Access-Control-Allow-Origin', '*');
        
        stream.pipe(res);
    } catch (err) {
        console.error('Erro ao servir arquivo:', err.message);
        res.status(404).json({ error: 'Arquivo não encontrado' });
    }
});

module.exports = router;