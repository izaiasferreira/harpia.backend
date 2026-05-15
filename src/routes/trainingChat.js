const express = require('express');
const router = express.Router();
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const {
    getChatMessages,
    clearChatMessages,
    sendTrainingChatMessage,
} = require('../functions/database/trainingChat');

// GET /admin/training/:id/chat - get chat history
router.get('/:id/chat', verifyToken(), verifyModule('trainings'), async (req, res) => {
    try {
        const trainingId = parseInt(req.params.id, 10);
        const messages = await getChatMessages(trainingId);
        res.json(messages);
    } catch (error) {
        console.error('Erro ao buscar mensagens do chat de treinamento:', error);
        res.status(500).json({ error: 'Erro interno ao buscar mensagens' });
    }
});

// POST /admin/training/:id/chat - send message to AI
router.post('/:id/chat', verifyToken(), verifyModule('trainings'), async (req, res) => {
    try {
        const trainingId = parseInt(req.params.id, 10);
        const { message, currentFlowData } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Mensagem é obrigatória' });
        }

        const result = await sendTrainingChatMessage(trainingId, message, currentFlowData || { nodes: [], edges: [] });
        res.json(result);
    } catch (error) {
        console.error('Erro ao enviar mensagem no chat de treinamento:', error);
        res.status(500).json({ error: error.message || 'Erro interno ao processar mensagem' });
    }
});

// DELETE /admin/training/:id/chat - clear chat history
router.delete('/:id/chat', verifyToken(), verifyModule('trainings'), async (req, res) => {
    try {
        const trainingId = parseInt(req.params.id, 10);
        await clearChatMessages(trainingId);
        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao limpar chat de treinamento:', error);
        res.status(500).json({ error: 'Erro interno ao limpar chat' });
    }
});

module.exports = router;
