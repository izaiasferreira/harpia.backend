require('dotenv').config();
const { Client } = require('minio');
const sharp = require('sharp');

// ==========================================
// Configurações
// ==========================================
/**
 * Normaliza o endpoint para o formato exigido pelo SDK minio (hostname/IP sem esquema).
 * Aceita "s3.wasabisys.com", "https://s3.wasabisys.com", "host:9000" etc.
 */
function normalizeEndpoint(raw) {
    let endpoint = (raw || '').trim().replace(/\/+$/, '');
    let scheme = null;
    if (endpoint.startsWith('https://')) {
        scheme = 'https';
        endpoint = endpoint.slice(8);
    } else if (endpoint.startsWith('http://')) {
        scheme = 'http';
        endpoint = endpoint.slice(7);
    }
    let port = null;
    const match = endpoint.match(/^([^:]+):(\d+)$/);
    if (match) {
        endpoint = match[1];
        port = parseInt(match[2], 10);
    }
    return { endpoint, scheme, port };
}

const _rawEndpoint = process.env.STORAGE_ENDPOINT || process.env.MINIO_ENDPOINT || 'localhost';
const _parsedEndpoint = normalizeEndpoint(_rawEndpoint);
const _envPort = process.env.STORAGE_PORT || process.env.MINIO_PORT;
const _envSSL = (process.env.STORAGE_USE_SSL || process.env.MINIO_USE_SSL || '').trim();

const CONFIG = {
    // Storage S3-compatible (STORAGE_* = Wasabi; MINIO_* = legado/fallback)
    endpoint: _parsedEndpoint.endpoint,
    port: parseInt(_envPort, 10) || _parsedEndpoint.port || (_parsedEndpoint.scheme === 'https' ? 443 : (_parsedEndpoint.scheme === 'http' ? 80 : 9000)),
    useSSL: _envSSL !== '' ? _envSSL === 'true' : _parsedEndpoint.scheme === 'https',
    accessKey: process.env.STORAGE_ACCESS_KEY || process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.STORAGE_SECRET_KEY || process.env.MINIO_SECRET_KEY || 'minioadmin',
    region: process.env.STORAGE_REGION || process.env.MINIO_REGION || 'pi-ma',
    bucket: process.env.STORAGE_BUCKET || process.env.MINIO_BUCKET || 'api-banco',
    
    // Compressão de imagens
    imageQuality: parseInt(process.env.IMAGE_QUALITY) || 80,
    imageMaxWidth: parseInt(process.env.IMAGE_MAX_WIDTH) || 1920,
    imageMaxHeight: parseInt(process.env.IMAGE_MAX_HEIGHT) || 1080,
    allowedBuckets: process.env.ALLOWED_BUCKETS || '',
    
    // URL pública da API
    publicBaseUrl: process.env.PUBLIC_BASE_URL
};

// ==========================================
// Cliente S3-compatible (minio SDK)
// ==========================================
const minioClient = new Client({
    endPoint: CONFIG.endpoint,
    port: CONFIG.port,
    useSSL: CONFIG.useSSL,
    accessKey: CONFIG.accessKey,
    secretKey: CONFIG.secretKey,
    region: CONFIG.region
});

// ==========================================
// Funções
// ==========================================

/**
 * Comprime imagem antes do upload
 */
async function compressImage(buffer, mimeType) {
    const image = sharp(buffer);
    const metadata = await image.metadata();
    
    // Redimensiona se necessário
    if (metadata.width > CONFIG.imageMaxWidth || metadata.height > CONFIG.imageMaxHeight) {
        image.resize(CONFIG.imageMaxWidth, CONFIG.imageMaxHeight, {
            fit: 'inside',
            withoutEnlargement: true
        });
    }
    
    // Aplica compressão conforme o tipo
    let pipeline = image;
    switch (mimeType) {
        case 'image/jpeg':
        case 'image/jpg':
            pipeline = pipeline.jpeg({ quality: CONFIG.imageQuality });
            break;
        case 'image/png':
            pipeline = pipeline.png({ compressionLevel: 9 });
            break;
        case 'image/webp':
            pipeline = pipeline.webp({ quality: CONFIG.imageQuality });
            break;
        case 'image/gif':
            pipeline = image.gif();
            break;
    }
    
    return pipeline.toBuffer();
}

/**
 * Garante que o bucket existe e tem política pública
 */
async function ensureBucketExists() {
    const exists = await minioClient.bucketExists(CONFIG.bucket);
    if (!exists) {
        await minioClient.makeBucket(CONFIG.bucket, CONFIG.region);
        
        const policy = {
            Version: '2012-10-17',
            Statement: [{
                Effect: 'Allow',
                Principal: '*',
                Action: ['s3:GetObject'],
                Resource: [`arn:aws:s3:::${CONFIG.bucket}/*`]
            }]
        };
        
        await minioClient.setBucketPolicy(CONFIG.bucket, JSON.stringify(policy));
    }
}

/**
 * Gera URL pública para acessar arquivo (via proxy da API)
 */
function getFileUrl(path) {
    return `/file/${path}`;
}

/**
 * Lista objetos de um bucket específico
 */
async function listObjectsInBucket(bucketName, prefix = '', recursive = true) {
    return new Promise((resolve, reject) => {
        const objects = [];
        const stream = minioClient.listObjects(bucketName, prefix, recursive);
        
        stream.on('data', (obj) => {
            if (obj.name) {
                objects.push(obj);
            }
        });
        
        stream.on('error', (err) => {
            reject(err);
        });
        
        stream.on('end', () => {
            resolve(objects);
        });
    });
}

/**
 * Lista objetos de um bucket com metadados completos
 */
async function listObjectsWithMetadata(bucketName, prefix = '') {
    return new Promise((resolve, reject) => {
        const objects = [];
        const stream = minioClient.listObjects(bucketName, prefix, true, true);
        
        stream.on('data', (obj) => {
            if (obj.name) {
                objects.push({
                    name: obj.name,
                    size: obj.size,
                    lastModified: obj.lastModified,
                    etag: obj.etag
                });
            }
        });
        
        stream.on('error', (err) => {
            reject(err);
        });
        
        stream.on('end', () => {
            resolve(objects);
        });
    });
}

/**
 * Gera URL pública para acessar arquivo de bucket específico
 */
function getBucketFileUrl(bucket, path) {
    return `/files/${bucket}/${path}`;
}

/**
 * Garante que um bucket específico existe (com política pública)
 */
async function ensureBucketByName(name) {
    const exists = await minioClient.bucketExists(name);
    if (!exists) {
        await minioClient.makeBucket(name, CONFIG.region);
        const policy = {
            Version: '2012-10-17',
            Statement: [{
                Effect: 'Allow',
                Principal: '*',
                Action: ['s3:GetObject'],
                Resource: [`arn:aws:s3:::${name}/*`]
            }]
        };
        await minioClient.setBucketPolicy(name, JSON.stringify(policy));
    }
}

/**
 * Testa a conexão com o provedor de storage (ex.: Wasabi) na inicialização.
 * Não lança exceção: retorna true/false e loga o resultado.
 */
async function testStorageConnection() {
    const endpointDesc = `${CONFIG.endpoint}:${CONFIG.port} (SSL: ${CONFIG.useSSL})`;
    try {
        const buckets = await minioClient.listBuckets();
        const bucketNames = buckets.map(b => b.name);
        let bucketStatus = 'não encontrado';
        if (bucketNames.includes(CONFIG.bucket)) {
            bucketStatus = 'OK';
        }
        console.log(`[STORAGE] Conexão OK — ${endpointDesc} | região: ${CONFIG.region} | bucket padrão '${CONFIG.bucket}': ${bucketStatus} | buckets visíveis: ${bucketNames.length}`);
        return true;
    } catch (err) {
        console.error(`[STORAGE] FALHA na conexão — ${endpointDesc} | região: ${CONFIG.region}: ${err.message}`);
        return false;
    }
}

// ==========================================
// Exports
// ==========================================
module.exports = {
    minioClient,
    CONFIG,
    compressImage,
    ensureBucketExists,
    ensureBucketByName,
    getFileUrl,
    getBucketFileUrl,
    listObjectsInBucket,
    listObjectsWithMetadata,
    testStorageConnection
};
