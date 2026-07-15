const express = require('express');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const sharp = require('sharp');

const { minioClient, CONFIG, compressImage, ensureBucketExists, getFileUrl } = require('../functions/minio');
const { verifyToken } = require('../middlewares/jwtAuth');

const storage = multer.memoryStorage();
const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }  // 10MB
});

// ==========================================
// Cache de Imagens em Memória
// ==========================================
const IMAGE_CACHE = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 Horas
const MAX_CACHE_SIZE = 500; // Limite de 500 imagens na memória

/**
 * Limpa chaves expiradas ou excede o tamanho limite do cache (estratégia FIFO simples)
 */
function cleanCacheIfNeeded() {
    const now = Date.now();
    for (const [key, value] of IMAGE_CACHE.entries()) {
        if (now - value.timestamp > CACHE_TTL_MS) {
            IMAGE_CACHE.delete(key);
        }
    }
    if (IMAGE_CACHE.size > MAX_CACHE_SIZE) {
        const firstKey = IMAGE_CACHE.keys().next().value;
        IMAGE_CACHE.delete(firstKey);
    }
}

/**
 * Processa a imagem aplicando compressão e redimensionamento sob demanda
 */
async function processAndOptimizeImage(buffer, ext, query) {
    const { w, h, q } = query;
    let pipeline = sharp(buffer);
    
    // Se solicitados parâmetros de dimensão, redimensiona
    if (w || h) {
        pipeline = pipeline.resize(
            w ? parseInt(w, 10) : null,
            h ? parseInt(h, 10) : null,
            { fit: 'inside', withoutEnlargement: true }
        );
    }
    
    // Qualidade padrão ou vinda da query
    const quality = q ? parseInt(q, 10) : CONFIG.imageQuality;
    
    // Força saída WebP de alta eficiência para melhor carregamento no mobile
    pipeline = pipeline.webp({ quality });
    
    return {
        buffer: await pipeline.toBuffer(),
        contentType: 'image/webp'
    };
}

// ==========================================
// Endpoints
// ==========================================

/**
 * POST /upload
 * Upload de arquivo com compressão de imagem
 */
router.post('/upload', upload.single('file'), verifyToken(), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        }

        // Tipos permitidos
        const allowedTypes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf',
            'application/msword', 
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel', 
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/zip', 'application/x-zip-compressed',
            'application/x-rar-compressed', 'application/vnd.rar'
        ];
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
 * POST /admin/upload
 * Upload de arquivo para administradores (igual ao upload_agent)
 */
router.post('/admin/upload', upload.single('file'), verifyToken(), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        }

        // Tipos permitidos
        const allowedTypes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf',
            'application/msword', 
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel', 
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/zip', 'application/x-zip-compressed',
            'application/x-rar-compressed', 'application/vnd.rar'
        ];
        if (!allowedTypes.includes(req.file.mimetype)) {
            return res.status(400).json({ error: 'Tipo de arquivo não permitido' });
        }

        await ensureBucketExists();

        // Gera nome único baseado no ID do admin
        const timestamp = Date.now();
        const ext = req.file.originalname.split('.').pop();
        const adminId = req.user.id;
        const fileName = `${timestamp}-${adminId}-${Math.random().toString(36).substring(7)}.${ext}`;
        const fullPath = `admins/${adminId}/${fileName}`;

        // Comprime imagem se necessário
        let fileBuffer = req.file.buffer;
        let originalSize = fileBuffer.length;

        if (['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(req.file.mimetype)) {
            fileBuffer = await compressImage(fileBuffer, req.file.mimetype);
        }

        // Upload para o MinIO
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
        console.error('Erro no upload admin:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /file/:path
 * Serve arquivos do bucket padrão com cache e compressão sob demanda
 * NOTA: Rotas de leitura são públicas (imagens em <img> tags não suportam Bearer tokens).
 * A segurança é garantida por: paths gerados com random no upload + validação de path traversal.
 */
router.get('/file/:path(*)', async (req, res) => {
    try {
        const objectName = req.params.path;
        if (objectName.includes('..') || objectName.includes('\\')) {
            return res.status(400).json({ error: 'Caminho inválido' });
        }
        const ext = objectName.split('.').pop()?.toLowerCase();
        const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext);

        const cacheKey = `${CONFIG.bucket}:${objectName}:${req.query.w || ''}:${req.query.h || ''}:${req.query.q || ''}`;
        
        // Verifica cache de memória
        if (isImage && IMAGE_CACHE.has(cacheKey)) {
            const cached = IMAGE_CACHE.get(cacheKey);
            if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
                // Validação ETag
                if (req.headers['if-none-match'] === cached.etag) {
                    return res.status(304).end();
                }
                res.set('Content-Type', cached.contentType);
                res.set('ETag', cached.etag);
                res.set('Cache-Control', 'public, max-age=31536000, immutable');
                res.set('Access-Control-Allow-Origin', '*');
                return res.send(cached.buffer);
            } else {
                IMAGE_CACHE.delete(cacheKey);
            }
        }

        // Busca objeto do MinIO
        const stream = await minioClient.getObject(CONFIG.bucket, objectName);
        const chunks = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        let fileBuffer = Buffer.concat(chunks);
        
        let contentType;
        const contentTypes = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'pdf': 'application/pdf',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'xls': 'application/vnd.ms-excel',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'zip': 'application/zip',
            'rar': 'application/vnd.rar',
            'apk': 'application/vnd.android.package-archive'
        };
        contentType = contentTypes[ext] || 'application/octet-stream';

        // Comprime sob demanda se for imagem (imagens do MinIO que não foram comprimidas antes)
        if (isImage) {
            try {
                const optimized = await processAndOptimizeImage(fileBuffer, ext, req.query);
                fileBuffer = optimized.buffer;
                contentType = optimized.contentType;
            } catch (sharpError) {
                console.error('[SHARP] Falha ao otimizar imagem, servindo original:', sharpError.message);
            }

            // Salva no cache
            const etag = crypto.createHash('md5').update(fileBuffer).digest('hex');
            cleanCacheIfNeeded();
            IMAGE_CACHE.set(cacheKey, {
                buffer: fileBuffer,
                contentType,
                etag,
                timestamp: Date.now()
            });

            if (req.headers['if-none-match'] === etag) {
                return res.status(304).end();
            }
            res.set('ETag', etag);
        } else {
            // Arquivos comuns usam MD5 rápido para ETag
            const etag = crypto.createHash('md5').update(fileBuffer).digest('hex');
            if (req.headers['if-none-match'] === etag) {
                return res.status(304).end();
            }
            res.set('ETag', etag);
        }

        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
        res.set('Access-Control-Allow-Origin', '*');
        res.send(fileBuffer);

    } catch (err) {
        console.error('Erro ao servir arquivo:', err.message);
        res.status(404).json({ error: 'Arquivo não encontrado' });
    }
});

/**
 * GET /files/:bucket/:path
 * Serve arquivos de bucket específico com cache e compressão sob demanda
 * Restringe a buckets conhecidos para evitar enumeration arbitrária.
 */
const ALLOWED_BUCKETS = new Set([CONFIG.bucket, 'apk', 'assets']);
router.get('/files/:bucket/:path(*)', async (req, res) => {
    try {
        const { bucket, path: objectName } = req.params;
        if (!ALLOWED_BUCKETS.has(bucket)) {
            return res.status(403).json({ error: 'Bucket não permitido' });
        }
        if (objectName.includes('..') || objectName.includes('\\')) {
            return res.status(400).json({ error: 'Caminho inválido' });
        }
        const ext = objectName.split('.').pop()?.toLowerCase();
        const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext);

        const cacheKey = `${bucket}:${objectName}:${req.query.w || ''}:${req.query.h || ''}:${req.query.q || ''}`;
        
        // Verifica cache de memória
        if (isImage && IMAGE_CACHE.has(cacheKey)) {
            const cached = IMAGE_CACHE.get(cacheKey);
            if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
                // Validação ETag
                if (req.headers['if-none-match'] === cached.etag) {
                    return res.status(304).end();
                }
                res.set('Content-Type', cached.contentType);
                res.set('ETag', cached.etag);
                res.set('Cache-Control', 'public, max-age=31536000, immutable');
                res.set('Access-Control-Allow-Origin', '*');
                return res.send(cached.buffer);
            } else {
                IMAGE_CACHE.delete(cacheKey);
            }
        }

        // Busca objeto do MinIO
        const stream = await minioClient.getObject(bucket, objectName);
        const chunks = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        let fileBuffer = Buffer.concat(chunks);
        
        let contentType;
        const contentTypes = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'pdf': 'application/pdf',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'xls': 'application/vnd.ms-excel',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'zip': 'application/zip',
            'rar': 'application/vnd.rar',
            'apk': 'application/vnd.android.package-archive'
        };
        contentType = contentTypes[ext] || 'application/octet-stream';

        // Comprime sob demanda se for imagem (imagens do MinIO que não foram comprimidas antes)
        if (isImage) {
            try {
                const optimized = await processAndOptimizeImage(fileBuffer, ext, req.query);
                fileBuffer = optimized.buffer;
                contentType = optimized.contentType;
            } catch (sharpError) {
                console.error('[SHARP] Falha ao otimizar imagem, servindo original:', sharpError.message);
            }

            // Salva no cache
            const etag = crypto.createHash('md5').update(fileBuffer).digest('hex');
            cleanCacheIfNeeded();
            IMAGE_CACHE.set(cacheKey, {
                buffer: fileBuffer,
                contentType,
                etag,
                timestamp: Date.now()
            });

            if (req.headers['if-none-match'] === etag) {
                return res.status(304).end();
            }
            res.set('ETag', etag);
        } else {
            // Arquivos comuns usam MD5 rápido para ETag
            const etag = crypto.createHash('md5').update(fileBuffer).digest('hex');
            if (req.headers['if-none-match'] === etag) {
                return res.status(304).end();
            }
            res.set('ETag', etag);
        }

        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
        res.set('Access-Control-Allow-Origin', '*');
        res.send(fileBuffer);

    } catch (err) {
        console.error('Erro ao servir arquivo:', err.message);
        res.status(404).json({ error: 'Arquivo não encontrado' });
    }
});

module.exports = router;