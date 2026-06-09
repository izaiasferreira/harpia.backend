const express = require('express');
const router = express.Router();
const { checkToken } = require('../functions/middlewares');
const { createNotification } = require('../functions/database/notifications');
const { send_message_to_agent } = require('../functions/database/admin');
const { sendToMultiple } = require('../functions/firebase');
const { getTokensByAgent, removeFcmToken } = require('../functions/database/fcmTokens');
const { get_or_create_support_room, save_chat_message } = require('../functions/database/chat');

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

// POST /public/notify
router.post('/notify', async (req, res) => {
    if (!checkToken(req, res)) return;

    try {
        const { sender, to, title, body, type, method } = req.body;

        if (!sender) return res.status(400).json({ error: 'sender é obrigatório' });
        if (!to) return res.status(400).json({ error: 'to é obrigatório' });
        if (!body) return res.status(400).json({ error: 'body é obrigatório' });

        const methods = Array.isArray(method) ? method : (method ? [method] : ['push']);
        const notificationType = type || 'success';

        // Suporta to como string única ou array de strings (bulk)
        const agentIds = Array.isArray(to) ? to.map(id => String(id).toUpperCase()) : [String(to).toUpperCase()];

        const allResults = { agents: {} };
        let firstNotificationId = null;

        for (const agentId of agentIds) {
            // 1. Salvar na tabela notifications
            const notification = await createNotification(
                agentId,
                sender,
                title || null,
                body,
                notificationType,
                methods,
                null
            );
            if (!firstNotificationId) firstNotificationId = notification.id;

            const results = {};

            // 2. Despachar por cada method
            for (const m of methods) {
                switch (m) {
                    case 'telegram': {
                        try {
                            const telegramResult = await send_message_to_agent({
                                id: agentId,
                                text: title ? `*${title}*\n${body}` : body,
                            });
                            results.telegram = telegramResult.error
                                ? { success: false, error: telegramResult.error }
                                : { success: true };
                        } catch (err) {
                            results.telegram = { success: false, error: err.message };
                        }
                        break;
                    }

                    case 'push': {
                        try {
                            const tokenRows = await getTokensByAgent(agentId);
                            const tokens = (tokenRows || []).map(r => r.token || r);
                            if (tokens.length > 0) {
                                const fcmResult = await sendToMultiple(tokens, title || 'Cenos', body, {});
                                await cleanInvalidTokens(tokens, fcmResult?.responses);
                                results.push = { success: true, sent: fcmResult?.successCount || 0 };
                            } else {
                                results.push = { success: false, error: 'Nenhum token FCM registrado' };
                            }
                        } catch (err) {
                            results.push = { success: false, error: err.message };
                        }
                        break;
                    }

                    case 'priority': {
                        try {
                            const tokenRows = await getTokensByAgent(agentId);
                            const tokens = (tokenRows || []).map(r => r.token || r);
                            if (tokens.length > 0) {
                                const fcmResult = await sendToMultiple(tokens, title || 'Alerta', body, {
                                    critical: 'true',
                                    type: notificationType === 'warn' ? 'warn' : notificationType === 'danger' ? 'danger' : 'danger',
                                    icon: '🚨'
                                });
                                await cleanInvalidTokens(tokens, fcmResult?.responses);
                                results.priority = { success: true, sent: fcmResult?.successCount || 0 };
                            } else {
                                results.priority = { success: false, error: 'Nenhum token FCM registrado' };
                            }
                        } catch (err) {
                            results.priority = { success: false, error: err.message };
                        }
                        break;
                    }

                    case 'internal': {
                        try {
                            const room = await get_or_create_support_room(agentId, agentId);
                            const savedMsg = await save_chat_message(
                                room.id,
                                sender,
                                'admin',
                                sender,
                                title ? `[${title}] ${body}` : body,
                                'text',
                                null, null, null, null,
                                'internal'
                            );

                            if (global.io) {
                                global.io.to(`room_${room.id}`).emit('receive_message', savedMsg);
                                global.io.emit('admin_new_chat_message', {
                                    roomId: room.id,
                                    agentId,
                                    message: savedMsg
                                });
                            }

                            results.internal = { success: true, messageId: savedMsg.id };
                        } catch (err) {
                            results.internal = { success: false, error: err.message };
                        }
                        break;
                    }

                    default:
                        results[m] = { success: false, error: `method "${m}" não suportado` };
                }
            }

            allResults.agents[agentId] = results;
        }

        res.json({ success: true, id: firstNotificationId, agentCount: agentIds.length, results: allResults.agents });
    } catch (err) {
        console.error('[PUBLIC NOTIFY] Erro:', err.message);
        res.status(500).json({ error: 'Erro ao processar notificação' });
    }
});

module.exports = router;
