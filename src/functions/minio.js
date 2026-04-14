require('dotenv').config();
const { Client } = require('minio');

const minioClient = new Client({
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: 9000,
    useSSL: false,
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    region: process.env.MINIO_REGION
});

const BUCKET_NAME = process.env.MINIO_BUCKET || 'api-banco';

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

function getPublicUrl(fullPath) {
    return `http://${process.env.MINIO_ENDPOINT}:9000/${BUCKET_NAME}/${fullPath}`;
}

module.exports = {
    minioClient,
    BUCKET_NAME,
    ensureBucketExists,
    getPublicUrl
};