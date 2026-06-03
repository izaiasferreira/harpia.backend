const express = require('express');
const router = express.Router();
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const {
    getChatMessages,
    clearChatMessages,
    sendChatMessage,
} = require('../functions/database/formChat');

// GET /admin/forms/:id/chat - get chat history
router.get('/:id/chat', verifyToken(), verifyModule('forms'), async (req, res) => {
    try {
        const formId = parseInt(req.params.id, 10);
        const messages = await getChatMessages(formId);
        res.json(messages);
    } catch (error) {
        console.error('Erro ao buscar mensagens do chat:', error);
        res.status(500).json({ error: 'Erro interno ao buscar mensagens' });
    }
});

// POST /admin/forms/:id/chat - send message to AI
router.post('/:id/chat', verifyToken(), verifyModule('forms'), async (req, res) => {
    try {
        const formId = parseInt(req.params.id, 10);
        const { message, currentStructure, attachments } = req.body;

        if ((!message || !message.trim()) && (!attachments || attachments.length === 0)) {
            return res.status(400).json({ error: 'Mensagem ou anexos são obrigatórios' });
        }

        const result = await sendChatMessage(formId, message || '', currentStructure || {}, attachments);
        res.json(result);
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        res.status(500).json({ error: error.message || 'Erro interno ao processar mensagem' });
    }
});

// DELETE /admin/forms/:id/chat - clear chat history
router.delete('/:id/chat', verifyToken(), verifyModule('forms'), async (req, res) => {
    try {
        const formId = parseInt(req.params.id, 10);
        await clearChatMessages(formId);
        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao limpar chat:', error);
        res.status(500).json({ error: 'Erro interno ao limpar chat' });
    }
});

module.exports = router;
