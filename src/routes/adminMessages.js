const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const { verifyToken } = require('../middlewares/jwtAuth');
const { get_or_create_support_room, save_chat_message } = require('../functions/database/chat');
const { send_message_to_agent } = require('../functions/database/admin');
const { sendToMultiple } = require('../functions/firebase');
const { getTokensByAgent, getTokensByAgents, getAllTokens, removeFcmToken } = require('../functions/database/fcmTokens');
const { sendLiveNotification } = require('../socket');
const { createNotification } = require('../functions/database/notifications');

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

// POST /admin/messages/send — endpoint unificado de envio multicanal
router.post('/send', verifyToken(), upload.single('file'), async (req, res) => {
    try {
        const { agent_ids, text, title, channels, webAppButtonText, webAppButtonUrl, critical, alertType, alertIcon } = req.body;

        const parsedChannels = typeof channels === 'string' ? JSON.parse(channels) : (channels || []);
        const parsedAgentIds = typeof agent_ids === 'string' ? JSON.parse(agent_ids) : (agent_ids || []);

        if (!parsedChannels || parsedChannels.length === 0) {
            return res.status(400).json({ error: 'channels é obrigatório' });
        }
        if (!text && !req.file) {
            return res.status(400).json({ error: 'text ou file é obrigatório' });
        }
        if (!parsedAgentIds || parsedAgentIds.length === 0) {
            return res.status(400).json({ error: 'agent_ids é obrigatório' });
        }

        const results = { telegram: null, push: null, overlay: null, chat: [] };
        const file = req.file || null;
        const fileUrl = req.body.file && typeof req.body.file === 'string' ? req.body.file : null;

        for (const agentId of parsedAgentIds) {
            const formattedId = agentId.toUpperCase();

            // Garantir sala existe
            const room = await get_or_create_support_room(formattedId, formattedId);

            // --- Telegram ---
            if (parsedChannels.includes('telegram')) {
                try {
                    const telegramResult = await send_message_to_agent({
                        id: formattedId,
                        text,
                        file: file || fileUrl,
                        webAppButtonText,
                        webAppButtonUrl,
                        user: req.user
                    });

                    if (!results.telegram) results.telegram = { sent: 0, failed: 0 };
                    if (telegramResult.error) {
                        results.telegram.failed++;
                    } else {
                        results.telegram.sent++;
                    }
                } catch (err) {
                    if (!results.telegram) results.telegram = { sent: 0, failed: 0 };
                    results.telegram.failed++;
                }

                // Registrar no chat
                const telegramMeta = {};
                if (webAppButtonText) telegramMeta.webAppButtonText = webAppButtonText;
                if (webAppButtonUrl) telegramMeta.webAppButtonUrl = webAppButtonUrl;

                const savedMsg = await save_chat_message(
                    room.id,
                    String(req.user.id || req.user.matricula || 'ADMIN'),
                    'admin',
                    req.user.nome || req.user.email || 'Admin',
                    text || null,
                    file ? getMessageTypeFromMime(file.mimetype) : 'text',
                    fileUrl || null,
                    file ? file.originalname : null,
                    null, null,
                    'telegram',
                    Object.keys(telegramMeta).length > 0 ? telegramMeta : null
                );

                // Emitir via socket
                if (global.io) {
                    global.io.to(`room_${room.id}`).emit('receive_message', savedMsg);
                    sendLiveNotification(formattedId, { type: 'new_chat_message', roomId: room.id, message: savedMsg });
                }

                results.chat.push({ agentId: formattedId, roomId: room.id, messageId: savedMsg.id });
            }

            // --- Push ---
            if (parsedChannels.includes('push') || parsedChannels.includes('overlay')) {
                const isCritical = parsedChannels.includes('overlay') || critical === 'true' || critical === true;
                const pushTitle = title || 'Sinergia';
                const channel = isCritical ? 'overlay' : 'push';

                try {
                    const tokenRows = await getTokensByAgent(formattedId);
                    const tokens = (tokenRows || []).map(r => r.token || r);

                    if (tokens.length > 0) {
                        const extraData = isCritical
                            ? { critical: 'true', type: alertType || 'danger', icon: alertIcon || '🚨' }
                            : {};

                        const fcmResult = await sendToMultiple(tokens, pushTitle, text || '', extraData);
                        await cleanInvalidTokens(tokens, fcmResult?.responses);

                        if (!results.push) results.push = { sent: 0, failed: 0 };
                        results.push.sent += fcmResult?.successCount || 0;
                        results.push.failed += fcmResult?.failureCount || 0;
                    } else {
                        if (!results.push) results.push = { sent: 0, failed: 0 };
                    }
                } catch (err) {
                    if (!results.push) results.push = { sent: 0, failed: 0 };
                    results.push.failed++;
                }

                // Registrar no chat
                const pushMeta = { title: pushTitle };
                if (isCritical) pushMeta.critical = true;
                if (alertType) pushMeta.alertType = alertType;
                if (alertIcon) pushMeta.alertIcon = alertIcon;

                const savedMsg = await save_chat_message(
                    room.id,
                    String(req.user.id || req.user.matricula || 'ADMIN'),
                    'admin',
                    req.user.nome || req.user.email || 'Admin',
                    text || `[${isCritical ? 'Alerta Crítico' : 'Push'}] ${title || ''}`.trim(),
                    'text',
                    null, null, null, null,
                    channel,
                    pushMeta
                );

                if (global.io) {
                    global.io.to(`room_${room.id}`).emit('receive_message', savedMsg);
                    sendLiveNotification(formattedId, { type: 'new_chat_message', roomId: room.id, message: savedMsg });
                }
            }

            // --- Chat interno (sem envio externo, só registra) ---
            if (parsedChannels.includes('internal')) {
                const savedMsg = await save_chat_message(
                    room.id,
                    String(req.user.id || req.user.matricula || 'ADMIN'),
                    'admin',
                    req.user.nome || req.user.email || 'Admin',
                    text || null,
                    file ? getMessageTypeFromMime(file.mimetype) : 'text',
                    fileUrl || null,
                    file ? file.originalname : null,
                    null, null,
                    'internal'
                );

                if (global.io) {
                    global.io.to(`room_${room.id}`).emit('receive_message', savedMsg);
                    sendLiveNotification(formattedId, { type: 'new_chat_message', roomId: room.id, message: savedMsg });
                }

                results.chat.push({ agentId: formattedId, roomId: room.id, messageId: savedMsg.id });
            }

            // --- Registrar na tabela notifications (auditoria) ---
            await createNotification(
                formattedId,
                String(req.user.id || req.user.matricula || 'ADMIN'),
                title || null,
                text || '[Arquivo]',
                'info',
                parsedChannels,
                null
            );
        }

        res.json(results);
    } catch (err) {
        console.error('[ADMIN MESSAGES] Erro ao enviar:', err);
        res.status(500).json({ error: 'Erro ao enviar mensagem' });
    }
});

function getMessageTypeFromMime(mimetype) {
    if (!mimetype) return 'text';
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('video/')) return 'video';
    if (mimetype.startsWith('audio/')) return 'audio';
    return 'document';
}

// GET /admin/messages/notifications/:agentId — histórico de notificações do agente
const { getAdminNotificationHistory } = require('../functions/database/notifications');

router.get('/notifications/:agentId', verifyToken(), async (req, res) => {
    try {
        const { agentId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 30, 100);
        const search = req.query.search || '';
        const from = req.query.from || null;
        const to = req.query.to || null;

        const result = await getAdminNotificationHistory(agentId, page, limit, search, from, to);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[ADMIN NOTIFICATIONS HISTORY] Erro:', err.message);
        res.status(500).json({ error: 'Erro ao buscar histórico de notificações' });
    }
});

module.exports = router;
