const express = require('express');
const { validate } = require('../middlewares/validate');
const { chatRoomCreateSchema } = require('../db/schemas/chat');

const router = express.Router();
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const { 
    get_rooms_for_admin, 
    get_rooms_for_admin_v2,
    get_messages_for_room, 
    get_messages_for_room_cursor,
    mark_messages_as_read,
    get_admin_unread_rooms_count,
    get_or_create_support_room
} = require('../functions/database/chat');

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINTS DO ADMIN (CHAT)
// ─────────────────────────────────────────────────────────────────────────────

// GET /admin/chat/rooms - Listar salas para o painel admin
router.get('/admin/chat/rooms', verifyToken(), verifyModule('chat'), async (req, res) => {
    try {
        const rooms = await get_rooms_for_admin(req.user);
        res.json({ success: true, rooms });
    } catch (err) {
        console.error('[CHAT API] Erro ao buscar salas para admin:', err);
        res.status(500).json({ error: 'Erro ao carregar lista de suporte.' });
    }
});

// GET /admin/chat/rooms/unread-count - Obter total de salas com mensagens não lidas
router.get('/admin/chat/rooms/unread-count', verifyToken(), verifyModule('chat'), async (req, res) => {
    try {
        const count = await get_admin_unread_rooms_count();
        res.json({ success: true, unread_rooms_count: count });
    } catch (err) {
        console.error('[CHAT API] Erro ao buscar contagem não lida:', err);
        res.status(500).json({ error: 'Erro interno.' });
    }
});

// GET /admin/chat/rooms/:roomId/messages - Histórico de mensagens para admin
router.get('/admin/chat/rooms/:roomId/messages', verifyToken(), verifyModule('chat'), async (req, res) => {
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
router.post('/admin/chat/rooms/:roomId/read', verifyToken(), verifyModule('chat'), async (req, res) => {
    try {
        const roomId = parseInt(req.params.roomId);
        await mark_messages_as_read(roomId, 'agent');
        res.json({ success: true });
    } catch (err) {
        console.error('[CHAT API] Erro ao marcar lidas:', err);
        res.status(500).json({ error: 'Erro.' });
    }
});

// POST /admin/chat/rooms — criar sala de suporte para um agente (se não existir)
router.post('/admin/chat/rooms', verifyToken(), verifyModule('chat'), validate(chatRoomCreateSchema), async (req, res) => {
    try {
        const { agent_id } = req.body;
        if (!agent_id) {
            return res.status(400).json({ error: 'agent_id é obrigatório' });
        }

        const { cenos_pool: chatCenosPool } = require('../db');
        let agentInfo = null;
        let state = null;

        // Busca agente no cenos_pool
        const { rows: agentRows } = await chatCenosPool.query(
            `SELECT "ID", "Nome", "regional", "seccional", estado FROM colaboradores WHERE "ID" = $1`,
            [agent_id.toUpperCase()]
        );
        if (agentRows.length > 0) {
            agentInfo = agentRows[0];
            state = agentRows[0].estado;
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

// ─── V2: Optimized endpoints (LATERAL JOIN + cursor pagination) ──────────

// GET /admin/chat/rooms/optimized - Listar salas com LATERAL JOIN (sem N+1)
router.get('/admin/chat/rooms/optimized', verifyToken(), verifyModule('chat'), async (req, res) => {
    try {
        const rooms = await get_rooms_for_admin_v2(req.user);
        res.json({ success: true, rooms });
    } catch (err) {
        console.error('[CHAT API V2] Erro ao buscar salas para admin:', err);
        res.status(500).json({ error: 'Erro ao carregar lista de suporte.' });
    }
});

// GET /admin/chat/rooms/:roomId/messages/optimized - Histórico com cursor pagination
router.get('/admin/chat/rooms/:roomId/messages/optimized', verifyToken(), verifyModule('chat'), async (req, res) => {
    try {
        const roomId = parseInt(req.params.roomId);
        const cursor = req.query.cursor ? parseInt(req.query.cursor) : null;
        const limit = Math.min(parseInt(req.query.limit) || 30, 100);

        // Marca mensagens enviadas pelo agente como lidas (só no load inicial, sem cursor)
        if (!cursor) {
            await mark_messages_as_read(roomId, 'agent');
        }

        const result = await get_messages_for_room_cursor(roomId, cursor, limit);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[CHAT API V2] Erro ao buscar histórico admin:', err);
        res.status(500).json({ error: 'Erro ao carregar histórico.' });
    }
});

module.exports = router;
