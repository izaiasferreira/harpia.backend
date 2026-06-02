const express = require('express');
const router = express.Router();
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const { 
    get_rooms_for_admin, 
    get_messages_for_room, 
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
        const rooms = await get_rooms_for_admin();
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
router.post('/admin/chat/rooms', verifyToken(), verifyModule('chat'), async (req, res) => {
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
