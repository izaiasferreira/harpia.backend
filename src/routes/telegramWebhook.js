const express = require('express');
const router = express.Router();
const axios = require('axios');
const { cenos_pool } = require('../db');
const { get_or_create_support_room, save_chat_message } = require('../functions/database/chat');
const { minioClient, CONFIG, ensureBucketExists, getFileUrl } = require('../functions/minio');
const { sendLiveNotification } = require('../socket');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_API_TOKEN;

// POST /public/telegram-webhook?token=SECRET
router.post('/telegram-webhook', async (req, res) => {
    const secret = req.query.token;
    if (!secret || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    try {
        const update = req.body;
        const message = update.message || update.edited_message;
        if (!message) {
            return res.json({ ok: true });
        }

        const telegramId = String(message.from.id);
        const senderName = [message.from.first_name, message.from.last_name].filter(Boolean).join(' ') || 'Agente';

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

        let messageText = null;
        let messageType = 'text';
        let fileUrl = null;
        let fileName = null;
        let latitude = null;
        let longitude = null;

        if (message.text) {
            messageText = message.text;
            messageType = 'text';
        } else if (message.photo) {
            messageType = 'image';
            messageText = message.caption || null;
            const photo = message.photo[message.photo.length - 1];
            fileUrl = await downloadTelegramFile(photo.file_id, 'image');
        } else if (message.video) {
            messageType = 'video';
            messageText = message.caption || null;
            fileUrl = await downloadTelegramFile(message.video.file_id, 'video');
            fileName = message.video.file_name || 'video.mp4';
        } else if (message.document) {
            messageType = 'document';
            messageText = message.caption || null;
            fileUrl = await downloadTelegramFile(message.document.file_id, 'document');
            fileName = message.document.file_name || 'document';
        } else if (message.voice) {
            messageType = 'audio';
            fileUrl = await downloadTelegramFile(message.voice.file_id, 'audio');
            fileName = 'voice.ogg';
        } else if (message.audio) {
            messageType = 'audio';
            messageText = message.caption || null;
            fileUrl = await downloadTelegramFile(message.audio.file_id, 'audio');
            fileName = message.audio.file_name || 'audio.mp3';
        } else if (message.location) {
            messageType = 'location';
            latitude = message.location.latitude;
            longitude = message.location.longitude;
        } else {
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
