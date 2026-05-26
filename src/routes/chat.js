const express = require('express');
const router = express.Router();
const multer = require('multer');
const { verifyToken } = require('../middlewares/jwtAuth');
const { telegramAuth } = require('../middlewares/telegramAuth');
const { minioClient, CONFIG, compressImage, ensureBucketExists, getFileUrl } = require('../functions/minio');
const { 
    get_or_create_support_room, 
    get_rooms_for_agent, 
    get_rooms_for_admin, 
    get_messages_for_room, 
    mark_messages_as_read,
    get_admin_unread_rooms_count
} = require('../functions/database/chat');
const { cenos_pool } = require('../db');

// Configuração do Multer para uploads de chat
const storage = multer.memoryStorage();
const upload = multer({ 
    storage,
    limits: { fileSize: 25 * 1024 * 1024 }  // 25MB para permitir vídeos de tamanho razoável
});

// Middleware híbrido de autenticação (aceita tanto admin com JWT quanto agente com Telegram TMA ou JWT de PIN)
async function chatAuth(req, res, next) {
    // 1. Tenta autenticar como Admin (JWT Bearer)
    const authHeader = req.headers.authorization;
    if (authHeader) {
        try {
            const adminAuth = verifyToken();
            return adminAuth(req, res, next);
        } catch (e) {
            // Se falhar, tenta como agente
        }
    }

    // 2. Tenta autenticar como Agente (Telegram TMA)
    const initData = req.headers['x-telegram-init-data'] || req.query.telegram_init_data;
    if (initData) {
        try {
            return telegramAuth(req, res, next);
        } catch (e) {
            // Se falhar, tenta JWT de PIN do agente
        }
    }

    // 3. Fallback JWT de PIN do Agente
    if (authHeader) {
        const [type, token] = authHeader.split(' ');
        if (type === 'Bearer' && token) {
            try {
                const decoded = require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'jwt_secret_change_me');
                if (decoded.id) {
                    req.colaborador = {
                        id: decoded.id.toUpperCase(),
                        estado: decoded.estado
                    };
                    return next();
                }
            } catch (err) {
                // Falhou total
            }
        }
    }

    return res.status(401).json({ error: 'Sessão expirada ou não autenticada' });
}

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINTS DO AGENTE
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/chat/rooms - Listar salas ativas do agente (e auto-cria o suporte se não existir)
router.get('/api/chat/rooms', chatAuth, async (req, res) => {
    try {
        const agentId = req.colaborador.id?.toUpperCase();
        
        // Pega os dados do agente para dar o nome correto à sala de suporte
        const state = req.colaborador.estado;
        const pool = state === 'pi' ? require('../db').pi_pool : require('../db').ma_pool;
        
        const { rows: agentData } = await pool.query(
            `SELECT "Nome" FROM colaboradores WHERE "ID" = $1`, 
            [agentId]
        );
        const agentName = agentData[0]?.Nome || agentId;

        // Garante que a sala de suporte exista
        await get_or_create_support_room(agentId, agentName);

        const rooms = await get_rooms_for_agent(agentId);
        res.json({ success: true, rooms });
    } catch (err) {
        console.error('[CHAT API] Erro ao buscar salas do agente:', err);
        res.status(500).json({ error: 'Erro interno ao buscar salas.' });
    }
});

// GET /api/chat/rooms/:roomId/messages - Histórico de mensagens do agente
router.get('/api/chat/rooms/:roomId/messages', chatAuth, async (req, res) => {
    try {
        const agentId = req.colaborador.id?.toUpperCase();
        const roomId = parseInt(req.params.roomId);

        // SEGURANÇA: Verificar se a sala pertence ao agente
        const { rows: room } = await cenos_pool.query(
            `SELECT * FROM chat_rooms WHERE id = $1`,
            [roomId]
        );

        if (room.length === 0) {
            return res.status(404).json({ error: 'Sala não encontrada.' });
        }

        if (room[0].agent_id?.toUpperCase() !== agentId) {
            return res.status(403).json({ error: 'Acesso negado a esta sala.' });
        }

        const messages = await get_messages_for_room(roomId);
        res.json({ success: true, messages });
    } catch (err) {
        console.error('[CHAT API] Erro ao carregar mensagens:', err);
        res.status(500).json({ error: 'Erro interno ao carregar histórico.' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINTS DO ADMIN
// ─────────────────────────────────────────────────────────────────────────────

// GET /admin/chat/rooms - Listar salas para o painel admin
router.get('/admin/chat/rooms', verifyToken('COMPANY_ADMIN'), async (req, res) => {
    try {
        const rooms = await get_rooms_for_admin();
        res.json({ success: true, rooms });
    } catch (err) {
        console.error('[CHAT API] Erro ao buscar salas para admin:', err);
        res.status(500).json({ error: 'Erro ao carregar lista de suporte.' });
    }
});

// GET /admin/chat/rooms/unread-count - Obter total de salas com mensagens não lidas
router.get('/admin/chat/rooms/unread-count', verifyToken('COMPANY_ADMIN'), async (req, res) => {
    try {
        const count = await get_admin_unread_rooms_count();
        res.json({ success: true, unread_rooms_count: count });
    } catch (err) {
        console.error('[CHAT API] Erro ao buscar contagem não lida:', err);
        res.status(500).json({ error: 'Erro interno.' });
    }
});

// GET /admin/chat/rooms/:roomId/messages - Histórico de mensagens para admin
router.get('/admin/chat/rooms/:roomId/messages', verifyToken('COMPANY_ADMIN'), async (req, res) => {
    try {
        const roomId = parseInt(req.params.roomId);

        // Marca mensagens enviadas pelo agente como lidas
        await mark_messages_as_read(roomId, 'agent');

        const messages = await get_messages_for_room(roomId);
        res.json({ success: true, messages });
    } catch (err) {
        console.error('[CHAT API] Erro ao buscar histórico admin:', err);
        res.status(500).json({ error: 'Erro ao carregar histórico.' });
    }
});

// POST /admin/chat/rooms/:roomId/read - Marcar manualmente como lidas (ao entrar no chat)
router.post('/admin/chat/rooms/:roomId/read', verifyToken('COMPANY_ADMIN'), async (req, res) => {
    try {
        const roomId = parseInt(req.params.roomId);
        await mark_messages_as_read(roomId, 'agent');
        res.json({ success: true });
    } catch (err) {
        console.error('[CHAT API] Erro ao marcar lidas:', err);
        res.status(500).json({ error: 'Erro.' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// UPLOAD MULTIMÍDIA COMUM (BOM PARA AMBAS AS PARTES)
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/chat/upload - Upload seguro de mídias de chat
router.post('/api/chat/upload', chatAuth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
        }

        const userId = req.user?.id || req.colaborador?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Usuário não autenticado.' });
        }

        const allowedTypes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'video/mp4', 'video/webm', 'video/quicktime',
            'audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/mp4',
            'application/pdf', 'application/msword', 
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel', 
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/plain'
        ];

        if (!allowedTypes.includes(req.file.mimetype)) {
            return res.status(400).json({ error: 'Tipo de arquivo não permitido no chat.' });
        }

        await ensureBucketExists();

        const timestamp = Date.now();
        const ext = req.file.originalname.split('.').pop();
        const safeFileName = `${timestamp}-${String(userId).replace(/[^a-zA-Z0-9]/g, '_')}-${Math.random().toString(36).substring(7)}.${ext}`;
        const fullPath = `chat-attachments/${userId}/${safeFileName}`;

        let fileBuffer = req.file.buffer;

        // Comprime imagens antes do upload
        if (['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(req.file.mimetype)) {
            try {
                fileBuffer = await compressImage(fileBuffer, req.file.mimetype);
            } catch (compressErr) {
                console.warn('[CHAT UPLOAD] Falha na compressão da imagem, enviando original:', compressErr.message);
            }
        }

        // Faz o upload para o MinIO
        await minioClient.putObject(CONFIG.bucket, fullPath, fileBuffer);

        res.json({
            success: true,
            fileName: req.file.originalname,
            url: getFileUrl(fullPath),
            size: fileBuffer.length,
            mimetype: req.file.mimetype
        });
    } catch (err) {
        console.error('[CHAT UPLOAD] Erro crítico no upload de chat:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /admin/chat/rooms — criar sala de suporte para um agente (se não existir)
router.post('/admin/chat/rooms', verifyToken('COMPANY_ADMIN'), async (req, res) => {
    try {
        const { agent_id } = req.body;
        if (!agent_id) {
            return res.status(400).json({ error: 'agent_id é obrigatório' });
        }

        const { pi_pool, ma_pool } = require('../db');
        let agentInfo = null;
        let state = null;

        // Busca agente em ambos os pools
        for (const [pool, st] of [[pi_pool, 'pi'], [ma_pool, 'ma']]) {
            const { rows } = await pool.query(
                `SELECT "ID", "Nome", "regional", "seccional" FROM colaboradores WHERE "ID" = $1`,
                [agent_id.toUpperCase()]
            );
            if (rows.length > 0) {
                agentInfo = rows[0];
                state = st;
                break;
            }
        }

        const agentName = agentInfo?.Nome || agent_id;

        const room = await get_or_create_support_room(agent_id, agentName);

        const enrichedRoom = {
            ...room,
            agent_name: agentName,
            agent_regional: agentInfo?.regional || null,
            agent_seccional: agentInfo?.seccional || null,
            agent_estado: state,
            last_message: null,
            unread_count: 0
        };

        res.json({ success: true, room: enrichedRoom });
    } catch (err) {
        console.error('[CHAT API] Erro ao criar sala admin:', err);
        res.status(500).json({ error: 'Erro ao criar sala de chat.' });
    }
});

module.exports = router;
