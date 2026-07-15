const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const { CONFIG, ensureBucketByName, listObjectsWithMetadata } = require('../functions/minio');
const { verifyToken } = require('../middlewares/jwtAuth');

const VERSIONS_FILE = path.join(__dirname, '../../apk-versions.json');

const updateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Muitas requisicoes. Tente novamente em 1 minuto.' }
});

function getVersions() {
  try {
    let raw = fs.readFileSync(VERSIONS_FILE, 'utf-8');
    // Strip BOM if present (PowerShell Set-Content -Encoding UTF8 adds it)
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

router.get('/api/app/update/check', updateLimiter, (req, res) => {
  try {
    const versions = getVersions();
    if (!versions) {
      return res.status(500).json({ error: 'Arquivo de versoes nao encontrado' });
    }

    const currentVersionCode = parseInt(req.query.currentVersionCode, 10) || 0;
    const latest = versions.latest;
    const hasUpdate = latest.versionCode > currentVersionCode;

    res.json({
      hasUpdate,
      versionCode: latest.versionCode,
      versionName: latest.versionName,
      url: latest.url,
      changelog: latest.changelog,
      forceUpdate: latest.forceUpdate,
      releaseDate: latest.releaseDate
    });
  } catch (err) {
    console.error('[APP_UPDATE] Erro ao verificar versao:', err);
    res.status(500).json({ error: 'Erro interno ao verificar atualizacao' });
  }
});

router.get('/api/app/update/versions', updateLimiter, verifyToken(), (req, res) => {
  try {
    const versions = getVersions();
    if (!versions) {
      return res.status(500).json({ error: 'Arquivo de versoes nao encontrado' });
    }
    res.json(versions);
  } catch (err) {
    console.error('[APP_UPDATE] Erro ao listar versoes:', err);
    res.status(500).json({ error: 'Erro interno ao listar versoes' });
  }
});

router.get('/api/app/update/bucket-files', updateLimiter, verifyToken(), async (req, res) => {
  try {
    await ensureBucketByName('apk');
    const files = await listObjectsWithMetadata('apk');
    res.json({
      bucket: 'apk',
      baseUrl: `${CONFIG.publicBaseUrl}/files/apk`,
      files: files.map(f => ({
        name: f.name,
        size: f.size,
        lastModified: f.lastModified,
        url: `/files/apk/${f.name}`
      }))
    });
  } catch (err) {
    console.error('[APP_UPDATE] Erro ao listar arquivos do bucket:', err);
    res.status(500).json({ error: 'Erro ao listar arquivos do bucket' });
  }
});

module.exports = router;
