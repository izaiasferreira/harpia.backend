require('dotenv').config();
const { Client } = require('minio');
const sharp = require('sharp');

// ==========================================
// Configurações
// ==========================================
const CONFIG = {
    // MinIO
    endpoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT) || 9000,
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    region: process.env.MINIO_REGION || 'pi-ma',
    bucket: process.env.MINIO_BUCKET || 'api-banco',
    
    // Compressão de imagens
    imageQuality: parseInt(process.env.IMAGE_QUALITY) || 80,
    imageMaxWidth: parseInt(process.env.IMAGE_MAX_WIDTH) || 1920,
    imageMaxHeight: parseInt(process.env.IMAGE_MAX_HEIGHT) || 1080,
    
    // URL pública da API
    publicBaseUrl: process.env.PUBLIC_BASE_URL
};

// ==========================================
// Cliente MinIO
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
        await minioClient.makeBucket(CONFIG.bucket);
        
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
    return `${CONFIG.publicBaseUrl}/file/${path}`;
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
    return `${CONFIG.publicBaseUrl}/files/${bucket}/${path}`;
}

/**
 * Garante que um bucket específico existe (com política pública)
 */
async function ensureBucketByName(name) {
    const exists = await minioClient.bucketExists(name);
    if (!exists) {
        await minioClient.makeBucket(name);
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
    listObjectsWithMetadata
};