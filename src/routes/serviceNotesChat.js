const express = require('express');
const router = express.Router();
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const {
    getChatMessages,
    clearChatMessages,
    sendServiceNotesChatMessage,
} = require('../functions/database/serviceNotesChat');

// GET /admin/service-notes/:groupId/chat - Obter histórico de mensagens
router.get('/:groupId/chat', verifyToken(), verifyModule('service_notes'), async (req, res) => {
    try {
        const groupId = parseInt(req.params.groupId, 10);
        const messages = await getChatMessages(groupId);
        res.json(messages);
    } catch (error) {
        console.error('[ServiceNotesChat Rota] Erro ao buscar mensagens:', error);
        res.status(500).json({ error: 'Erro interno ao buscar mensagens do chat' });
    }
});

// POST /admin/service-notes/:groupId/chat - Enviar mensagem ao assistente
router.post('/:groupId/chat', verifyToken(), verifyModule('service_notes'), async (req, res) => {
    try {
        const groupId = parseInt(req.params.groupId, 10);
        const { message, attachments } = req.body;

        if ((!message || !message.trim()) && (!attachments || attachments.length === 0)) {
            return res.status(400).json({ error: 'Mensagem ou anexos são obrigatórios' });
        }

        const adminId = req.user.id;
        const result = await sendServiceNotesChatMessage(groupId, message || '', attachments, adminId);
        res.json(result);
    } catch (error) {
        console.error('[ServiceNotesChat Rota] Erro ao enviar mensagem:', error);
        res.status(500).json({ error: error.message || 'Erro interno ao processar mensagem' });
    }
});

// DELETE /admin/service-notes/:groupId/chat - Limpar histórico de mensagens
router.delete('/:groupId/chat', verifyToken(), verifyModule('service_notes'), async (req, res) => {
    try {
        const groupId = parseInt(req.params.groupId, 10);
        await clearChatMessages(groupId);
        res.json({ success: true });
    } catch (error) {
        console.error('[ServiceNotesChat Rota] Erro ao limpar chat:', error);
        res.status(500).json({ error: 'Erro interno ao limpar histórico de chat' });
    }
});

// POST /admin/service-notes/:groupId/chat/apply - Aplicar alterações propostas pelo assistente
router.post('/:groupId/chat/apply', verifyToken(), verifyModule('service_notes'), async (req, res) => {
    try {
        const groupId = parseInt(req.params.groupId, 10);
        const { proposedActions } = req.body;
        const adminId = req.user.id;

        if (!Array.isArray(proposedActions) || proposedActions.length === 0) {
            return res.status(400).json({ error: 'Nenhuma alteração proposta informada' });
        }

        const { executeProposedActions } = require('../functions/database/serviceNotesChat');
        const results = await executeProposedActions(groupId, proposedActions, adminId);
        
        res.json({ success: true, results });
    } catch (error) {
        console.error('[ServiceNotesChat Rota] Erro ao aplicar alterações:', error);
        res.status(500).json({ error: error.message || 'Erro interno ao aplicar alterações' });
    }
});

module.exports = router;
