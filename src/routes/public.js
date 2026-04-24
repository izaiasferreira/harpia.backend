const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
require('dotenv').config();

function checkToken(req, res) {
    if (req.query.token !== process.env.API_TOKEN) {
        res.json({ error: 'Token inválido' });
        return false;
    }
    return true;
}

const { getCalendarForAgent } = require('../functions/postgresFunctions');
const { getFormById, submitForm } = require('../functions/database/forms');
const { getTrainingProjectById } = require('../functions/database/trainingProjects');

const publicLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas requisições. Tente novamente em 1 minuto.' },
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
        const result = await getCalendarForAgent({ state });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/feriados', publicLimiter, (req, res) => {
    const state = req.query.state;
    if (!state || state === 'pi') {
        return res.json(['03/04/2026', '21/04/2026']);
    }
    if (state === 'ma') {
        return res.json(['03/04/2026', '21/04/2026']);
    }
    res.json([]);
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

const { pi_pool, cenos_pool } = require('../db');
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

        const metadata = {
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

            await cenos_pool.query(`
            CREATE TABLE IF NOT EXISTS telegram_tokens (
                id SERIAL PRIMARY KEY, 
                token VARCHAR(255) NOT NULL UNIQUE, 
                telegram_user_id BIGINT NOT NULL, 
                expires_at TIMESTAMP NOT NULL, 
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
                last_used_at TIMESTAMP
            )
        `);

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

module.exports = router;
