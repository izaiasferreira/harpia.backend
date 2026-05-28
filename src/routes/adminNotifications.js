const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const { sendNotification, sendToMultiple } = require('../functions/firebase');
const { getTokensByAgent, getTokensByAgents, getAllTokens, removeFcmToken } = require('../functions/database/fcmTokens');
const { send_bulk_message_to_agents } = require('../functions/database/admin');

async function cleanInvalidTokens(tokens, responses) {
    if (!responses) return;
    for (let i = 0; i < responses.length; i++) {
        if (responses[i].error &&
            (responses[i].error.code === 'messaging/registration-token-not-registered' ||
             responses[i].error.code === 'messaging/invalid-registration-token')) {
            await removeFcmToken(tokens[i]);
        }
    }
}

// POST /admin/notifications/send — enviar para agente(s) via Telegram, Push, ou ambos
router.post('/send', verifyToken(), verifyModule('send_message_user_agent'), upload.single('file'), async (req, res) => {
    try {
        const { agent_ids, title, text, channels, broadcast, data: extraData, webAppButtonText, webAppButtonUrl, file: fileUrl } = req.body;

        const parsedChannels = typeof channels === 'string' ? JSON.parse(channels) : channels;
        const parsedAgentIds = typeof agent_ids === 'string' ? JSON.parse(agent_ids) : agent_ids;
        const parsedBroadcast = broadcast === 'true' || broadcast === true;
        const parsedExtraData = typeof extraData === 'string' ? JSON.parse(extraData || '{}') : (extraData || {});

        console.log('[NOTIFICATIONS] Request received:', { agent_ids, parsedAgentIds, parsedChannels, parsedBroadcast });

        if (!parsedChannels || parsedChannels.length === 0) {
            return res.status(400).json({ error: 'O canal é obrigatório' });
        }

        if (!text) {
            return res.status(400).json({ error: 'text é obrigatório' });
        }

        if (!parsedBroadcast && (!parsedAgentIds || parsedAgentIds.length === 0)) {
            return res.status(400).json({ error: 'agent_ids ou broadcast=true é obrigatório' });
        }

        const result = { telegram: null, push: null };

        // --- Telegram ---
        if (parsedChannels.includes('telegram')) {
            try {
                const file = req.file || fileUrl || null;
                if (parsedBroadcast) {
                    const { cenos_pool } = require('../../db');
                    const { rows } = await cenos_pool.query("SELECT id FROM login");
                    const allIds = rows.map(r => r.id);
                    const telegramResult = await send_bulk_message_to_agents({
                        ids: allIds,
                        text,
                        file,
                        webAppButtonText,
                        webAppButtonUrl,
                        user: req.user,
                    });
                    result.telegram = { sent: telegramResult.filter(r => !r.error).length, failed: telegramResult.filter(r => r.error).length };
                } else {
                    const telegramResult = await send_bulk_message_to_agents({
                        ids: parsedAgentIds,
                        text,
                        file,
                        webAppButtonText,
                        webAppButtonUrl,
                        user: req.user,
                    });
                    result.telegram = { sent: telegramResult.filter(r => !r.error).length, failed: telegramResult.filter(r => r.error).length };
                }
            } catch (err) {
                result.telegram = { error: err.message };
            }
        }

        // --- Push FCM ---
        if (parsedChannels.includes('push')) {
            try {
                const pushTitle = title || 'Cenos';
                let tokens;

                if (parsedBroadcast) {
                    const allTokens = await getAllTokens();
                    console.log('[PUSH] Broadcast - total tokens found:', allTokens.length);
                    tokens = allTokens.map(r => r.token);
                } else {
                    console.log('[PUSH] Looking for agents:', parsedAgentIds);
                    const tokenRows = await getTokensByAgents(parsedAgentIds);
                    console.log('[PUSH] Token rows found:', tokenRows.length, tokenRows);
                    tokens = tokenRows.map(r => r.token);
                }

                if (tokens.length === 0) {
                    result.push = { sent: 0, failed: 0, message: 'Nenhum token registrado' };
                } else {
                    const fcmResult = await sendToMultiple(tokens, pushTitle, text, parsedExtraData);
                    await cleanInvalidTokens(tokens, fcmResult.responses);
                    result.push = { sent: fcmResult.successCount, failed: fcmResult.failureCount };
                }
            } catch (err) {
                result.push = { error: err.message };
            }
        }

        res.json(result);
    } catch (err) {
        console.error('[NOTIFICATIONS] Erro ao enviar:', err);
        res.status(500).json({ error: 'Erro ao enviar notificação' });
    }
});

// POST /admin/notifications/broadcast — enviar para todos (mantido para compatibilidade)
router.post('/broadcast', verifyToken(), verifyModule('send_message_user_agent'), async (req, res) => {
    try {
        const { title, body, data } = req.body;

        if (!title || !body) {
            return res.status(400).json({ error: 'title e body são obrigatórios' });
        }

        const allTokens = await getAllTokens();
        if (allTokens.length === 0) {
            return res.json({ sent: 0, message: 'Nenhum token registrado' });
        }

        const tokens = allTokens.map(r => r.token);
        const result = await sendToMultiple(tokens, title, body, data || {});
        await cleanInvalidTokens(tokens, result.responses);

        res.json({
            sent: result.successCount,
            failed: result.failureCount,
            total_tokens: tokens.length,
        });
    } catch (err) {
        console.error('[NOTIFICATIONS] Erro broadcast:', err);
        res.status(500).json({ error: 'Erro ao enviar broadcast' });
    }
});

module.exports = router;
