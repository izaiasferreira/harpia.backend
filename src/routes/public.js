const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const multer = require('multer');
require('dotenv').config();
const { checkToken } = require('../functions/middlewares');

const { getCalendarForAgent } = require('../functions/postgresFunctions');
const { getFormById, submitForm, checkFormResponse } = require('../functions/database/forms');
const { getTrainingProjectById } = require('../functions/database/trainingProjects');
const { minioClient, CONFIG, compressImage, ensureBucketExists, getFileUrl } = require('../functions/minio');

const uploadStorage = multer.memoryStorage();
const formUpload = multer({ storage: uploadStorage, limits: { fileSize: 10 * 1024 * 1024 } });
const { findAgentById, findValidPin, markPinAsUsed } = require('../functions/database/appPins');

const publicLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas requisições. Tente novamente em 1 minuto.' },
    validate: { trustProxy: false }
});

// Limiter mais agressivo para verificações e submissões
const strictPublicLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas tentativas. Tente novamente em 1 minuto.' },
    validate: { trustProxy: false }
});

router.get('/health', publicLimiter, (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        atual_time: new Date().toString()
    });
});

router.get('/calendar', publicLimiter, async (req, res) => {
    try {
        const state = req.query.state || 'pi';
        const month = req.query.month;
        const result = await getCalendarForAgent({ state, month });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/feriados', publicLimiter, async (req, res) => {
    try {
        const state = req.query.state || 'pi';
        const pool = state === 'ma' ? ma_pool : pi_pool;
        const { rows } = await pool.query('SELECT date FROM feriados');
        const dates = rows.map(r => r.date).filter(Boolean);
        res.json(dates);
    } catch (err) {
        console.error('Erro ao buscar feriados no banco público:', err);
        const state = req.query.state;
        if (state === 'ma') {
            return res.json(['03/04/2026', '21/04/2026', '01/05/2026', '04/06/2026']);
        }
        res.json(['03/04/2026', '21/04/2026', '01/05/2026', '04/06/2026']);
    }
});


router.get('/metabase_geral', async (req, res) => {
    try {
        const METABASE_SITE_URL = process.env.METABASE_SITE_URL;
        const METABASE_SECRET_KEY = process.env.METABASE_SECRET_KEY_GERAL;

        const payload = {
            resource: { dashboard: 4 },
            params: {},
            exp: Math.round(Date.now() / 1000) + (60 * 60)
        };

        const token = jwt.sign(payload, METABASE_SECRET_KEY);
        const metabaseUrl = METABASE_SITE_URL + "/embed/dashboard/" + token + "#bordered=true&titled=true";

        res.redirect(metabaseUrl);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

const crypto = require('crypto');
require('dotenv').config();

const { cenos_pool, pi_pool, ma_pool } = require('../db');
// ─── Training ───────────────────────────────────────────────────────────────

router.get('/training/:id', publicLimiter, async (req, res) => {
    try {
        const { id } = req.params;
        const project = await getTrainingProjectById(parseInt(id, 10));

        if (!project) {
            return res.status(404).json({ error: 'Projeto não encontrado' });
        }

        res.json(project);
    } catch (error) {
        console.error('Erro ao buscar projeto público:', error);
        res.status(500).json({ error: 'Erro interno ao buscar projeto' });
    }
});

// ─── Forms ──────────────────────────────────────────────────────────────────

router.get('/form/:id', publicLimiter, async (req, res) => {
    try {
        const { id } = req.params;
        const form = await getFormById(parseInt(id, 10));

        if (!form) {
            return res.status(404).json({ error: 'Formulário não encontrado' });
        }

        res.json({
            id: form.id,
            title: form.title,
            description: form.description,
            coverUrl: form.cover_url,
            isActive: form.is_active,
            settings: form.settings,
            structure: form.structure
        });
    } catch (error) {
        console.error('Erro ao buscar formulário público:', error);
        res.status(500).json({ error: 'Erro interno ao buscar formulário' });
    }
});

router.get('/form/:id/check', strictPublicLimiter, async (req, res) => {
    try {
        const { id } = req.params;
        const { respondentId } = req.query;

        if (!respondentId) {
            return res.status(400).json({ error: 'respondentId é obrigatório' });
        }

        const alreadyResponded = await checkFormResponse(parseInt(id, 10), respondentId);
        res.json({ alreadyResponded });
    } catch (error) {
        console.error('Erro ao verificar resposta:', error);
        res.status(500).json({ error: 'Erro interno ao verificar resposta' });
    }
});

router.post('/form/submit/:id', publicLimiter, async (req, res) => {
    try {
        const { id } = req.params;
        const { answers } = req.body;

        if (!answers || typeof answers !== 'object') {
            return res.status(400).json({ error: 'Answers é obrigatório' });
        }

        const form = await getFormById(parseInt(id, 10));
        if (!form) {
            return res.status(404).json({ error: 'Formulário não encontrado' });
        }

        if (!form.is_active) {
            return res.status(400).json({ error: 'Formulário não está ativo' });
        }

        const clientMetadata = req.body.metadata || {};
        const metadata = {
            ...clientMetadata,
            ip: req.ip || req.connection.remoteAddress,
            userAgent: req.headers['user-agent'] || ''
        };

        const response = await submitForm({
            formId: parseInt(id, 10),
            answers,
            metadata
        });

        res.status(201).json({
            success: true,
            response
        });
    } catch (error) {
        console.error('Erro ao submeter formulário:', error);
        if (error.message.includes('obrigatório')) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Erro interno ao submeter formulário' });
    }
});

router.get('/generate_token', async (req, res) => {
    try {
        if (!checkToken(req, res)) return;

        const telegramId = req.query.id;

        if (!telegramId || telegramId === 'undefined') {
            console.error('Erro: TEST_TELEGRAM_ID não definido no .env e nenhum ID passado como argumento.');
            res.status(500).json({ error: err.message });
        }

        try {
            const token = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000 * 30);

            await cenos_pool.query(
                'INSERT INTO telegram_tokens (token, telegram_user_id, expires_at) VALUES ($1, $2, $3)',
                [token, telegramId, expiresAt]
            );

            res.json({ token });
        } catch (err) {
            console.error('Erro:', err.message);
            res.status(500).json({ error: err.message });
        }

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

// --- Autenticação App Nativo (Matrícula + PIN) ---

const appLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
    validate: { trustProxy: false }
});

router.post('/app_login', appLoginLimiter, async (req, res) => {
    try {
        const { matricula, pin } = req.body;

        if (!matricula || !pin) {
            return res.status(400).json({ error: 'Matrícula e PIN são obrigatórios' });
        }

        const agent = await findAgentById(matricula);
        if (!agent) {
            return res.status(401).json({ error: 'Matrícula não encontrada' });
        }

        const validPin = await findValidPin(agent.id, String(pin).trim());
        if (!validPin) {
            return res.status(401).json({ error: 'PIN inválido ou expirado' });
        }

        await markPinAsUsed(validPin.id);

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        await cenos_pool.query(
            'INSERT INTO telegram_tokens (token, telegram_user_id, agent_id, expires_at) VALUES ($1, $2, $3, $4)',
            [token, agent.telegram_id || 0, agent.id, expiresAt]
        );

        res.json({
            token,
            expires_at: expiresAt.toISOString(),
            agent: {
                id: agent.id,
                estado: agent.estado,
                nome: agent.nome
            }
        });
    } catch (err) {
        console.error('[APP_LOGIN] Erro:', err);
        res.status(500).json({ error: 'Erro interno no login' });
    }
});

router.post('/app_refresh_token', async (req, res) => {
    try {
        const currentToken = req.headers['x-telegram-init-data'];

        if (!currentToken || currentToken.includes('hash=')) {
            return res.status(400).json({ error: 'Token inválido para refresh' });
        }

        const { rows } = await cenos_pool.query(
            'SELECT telegram_user_id, expires_at FROM telegram_tokens WHERE token = $1 AND expires_at > CURRENT_TIMESTAMP',
            [currentToken]
        );

        if (rows.length === 0) {
            return res.status(401).json({ error: 'Token expirado ou inválido' });
        }

        const { telegram_user_id, expires_at } = rows[0];
        const daysUntilExpiry = (new Date(expires_at) - Date.now()) / (1000 * 60 * 60 * 24);

        if (daysUntilExpiry > 7) {
            return res.json({ token: currentToken, expires_at: expires_at, refreshed: false });
        }

        const newToken = crypto.randomBytes(32).toString('hex');
        const newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        await cenos_pool.query(
            'INSERT INTO telegram_tokens (token, telegram_user_id, expires_at) VALUES ($1, $2, $3)',
            [newToken, telegram_user_id, newExpiresAt]
        );

        await cenos_pool.query(
            'DELETE FROM telegram_tokens WHERE token = $1',
            [currentToken]
        );

        res.json({
            token: newToken,
            expires_at: newExpiresAt.toISOString(),
            refreshed: true
        });
    } catch (err) {
        console.error('[APP_REFRESH] Erro:', err);
        res.status(500).json({ error: 'Erro interno no refresh' });
    }
});

// ==========================================
// Upload público para formulários (imagens e arquivos)
// ==========================================
router.post('/form/upload', strictPublicLimiter, formUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        }

        const allowedTypes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/zip', 'application/x-zip-compressed'
        ];

        if (!allowedTypes.includes(req.file.mimetype)) {
            return res.status(400).json({ error: 'Tipo de arquivo não permitido' });
        }

        await ensureBucketExists();

        const timestamp = Date.now();
        const ext = req.file.originalname.split('.').pop();
        const fileName = `${timestamp}-${Math.random().toString(36).substring(7)}.${ext}`;
        const fullPath = `forms/uploads/${fileName}`;

        let fileBuffer = req.file.buffer;

        // Compress images
        if (['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(req.file.mimetype)) {
            fileBuffer = await compressImage(fileBuffer, req.file.mimetype);
        }

        await minioClient.putObject(CONFIG.bucket, fullPath, fileBuffer);

        res.json({
            success: true,
            url: getFileUrl(fullPath),
            fileName: fullPath,
            mimetype: req.file.mimetype,
            size: fileBuffer.length
        });
    } catch (err) {
        console.error('Erro no upload de formulário:', err);
        res.status(500).json({ error: 'Erro no upload' });
    }
});

module.exports = router;
