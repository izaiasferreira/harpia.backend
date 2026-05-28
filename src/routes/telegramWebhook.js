const express = require('express');
const router = express.Router();
const axios = require('axios');
const { cenos_pool } = require('../db');
const { get_or_create_support_room, save_chat_message } = require('../functions/database/chat');
const { minioClient, CONFIG, ensureBucketExists, getFileUrl } = require('../functions/minio');
const { checkToken } = require('../functions/middlewares');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_API_TOKEN;


// POST /public/telegram-webhook
router.post('/telegram-webhook', async (req, res) => {

    if (!checkToken(req, res)) return;


    try {
        const payload = req.body;

        // Only process inbound messages
        if (payload.direction !== 'inbound') {
            return res.json({ ok: true });
        }

        // Ignore non-message events (callback_query, inline_query, etc. can be added later)
        if (!['message.received', 'web_app_data'].includes(payload.event)) {
            return res.json({ ok: true });
        }

        const telegramId = String(payload.from?.id || payload.chatId);
        const senderName = [payload.from?.firstName, payload.from?.lastName].filter(Boolean).join(' ') || 'Agente';

        const { rows: loginRows } = await cenos_pool.query(
            'SELECT id FROM login WHERE telegram_id = $1',
            [telegramId]
        );

        if (loginRows.length === 0) {
            console.log(`[TELEGRAM WEBHOOK] telegram_id ${telegramId} não encontrado na tabela login`);
            return res.json({ ok: true });
        }

        const agentId = loginRows[0].id.toUpperCase();
        const room = await get_or_create_support_room(agentId, senderName);

        const msg = payload.message || {};
        let messageText = null;
        let messageType = 'text';
        let fileUrl = null;
        let fileName = null;
        let latitude = null;
        let longitude = null;

        switch (msg.type) {
            case 'text':
                messageText = msg.text;
                messageType = 'text';
                break;
            case 'photo':
                messageType = 'image';
                messageText = msg.caption || null;
                if (msg.fileId) fileUrl = await downloadTelegramFile(msg.fileId, 'image');
                break;
            case 'video':
            case 'video_note':
            case 'animation':
                messageType = 'video';
                messageText = msg.caption || null;
                if (msg.fileId) fileUrl = await downloadTelegramFile(msg.fileId, 'video');
                fileName = 'video.mp4';
                break;
            case 'document':
                messageType = 'document';
                messageText = msg.caption || null;
                if (msg.fileId) fileUrl = await downloadTelegramFile(msg.fileId, 'document');
                fileName = 'document';
                break;
            case 'voice':
                messageType = 'audio';
                if (msg.fileId) fileUrl = await downloadTelegramFile(msg.fileId, 'audio');
                fileName = 'voice.ogg';
                break;
            case 'audio':
                messageType = 'audio';
                messageText = msg.caption || null;
                if (msg.fileId) fileUrl = await downloadTelegramFile(msg.fileId, 'audio');
                fileName = 'audio.mp3';
                break;
            case 'location':
                messageType = 'location';
                latitude = msg.location?.latitude || null;
                longitude = msg.location?.longitude || null;
                break;
            case 'sticker':
                messageType = 'image';
                if (msg.fileId) fileUrl = await downloadTelegramFile(msg.fileId, 'image');
                break;
            case 'contact':
                messageType = 'text';
                const c = msg.contact || {};
                messageText = `📇 ${c.first_name || ''} ${c.last_name || ''}\n${c.phone_number || ''}`.trim();
                break;
            case 'web_app_data':
                messageType = 'text';
                const webData = msg.webAppData?.data || '';
                messageText = `[WebApp] ${webData}`;
                break;
            default:
                return res.json({ ok: true });
        }

        const savedMsg = await save_chat_message(
            room.id,
            agentId,
            'agent',
            senderName,
            messageText,
            messageType,
            fileUrl,
            fileName,
            latitude,
            longitude,
            'telegram'
        );

        if (global.io) {
            global.io.emit('admin_new_chat_message', {
                roomId: room.id,
                agentId,
                message: savedMsg
            });
            global.io.to(`room_${room.id}`).emit('receive_message', savedMsg);
        }

        res.json({ ok: true });
    } catch (err) {
        console.error('[TELEGRAM WEBHOOK] Erro ao processar update:', err.message);
        res.status(200).json({ ok: true });
    }
});

async function downloadTelegramFile(fileId, mediaType) {
    try {
        if (!BOT_TOKEN) return null;

        const fileInfoRes = await axios.get(
            `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`
        );
        const filePath = fileInfoRes.data?.result?.file_path;
        if (!filePath) return null;

        const fileRes = await axios.get(
            `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`,
            { responseType: 'arraybuffer' }
        );

        await ensureBucketExists();
        const ext = filePath.split('.').pop() || 'bin';
        const timestamp = Date.now();
        const safeFileName = `${timestamp}-telegram-${Math.random().toString(36).substring(7)}.${ext}`;
        const fullPath = `chat-attachments/telegram/${safeFileName}`;

        await minioClient.putObject(CONFIG.bucket, fullPath, Buffer.from(fileRes.data));

        return getFileUrl(fullPath);
    } catch (err) {
        console.error('[TELEGRAM WEBHOOK] Erro ao baixar/upload arquivo:', err.message);
        return null;
    }
}

module.exports = router;
