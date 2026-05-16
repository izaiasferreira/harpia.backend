const express = require('express');
const router = express.Router();
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const {
    getChatMessages,
    addChatMessage,
    clearChatMessages,
    sendTrainingChatMessage,
    callLlm,
} = require('../functions/database/trainingChat');

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

router.post('/:id/chat', verifyToken(), verifyModule('trainings'), async (req, res) => {
    try {
        const trainingId = parseInt(req.params.id, 10);
        const { message, currentFlowData, selectedNodeIds } = req.body;
        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Mensagem é obrigatória' });
        }
        const result = await sendTrainingChatMessage(trainingId, message, currentFlowData || { nodes: [], edges: [] }, selectedNodeIds || []);
        res.json(result);
    } catch (error) {
        console.error('Erro ao enviar mensagem no chat de treinamento:', error);
        res.status(500).json({ error: error.message || 'Erro interno ao processar mensagem' });
    }
});

router.post('/:id/chat/llm', verifyToken(), verifyModule('trainings'), async (req, res) => {
    try {
        const { messages } = req.body;
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: 'Messages é obrigatório' });
        }
        const result = await callLlm(messages, { signal: req.abortSignal });
        res.json(result);
    } catch (error) {
        console.error('Erro ao chamar LLM:', error);
        res.status(500).json({ error: error.message || 'Erro interno' });
    }
});

router.post('/:id/chat/messages', verifyToken(), verifyModule('trainings'), async (req, res) => {
    try {
        const trainingId = parseInt(req.params.id, 10);
        const { role, content } = req.body;
        if (!role || !content) {
            return res.status(400).json({ error: 'role e content são obrigatórios' });
        }
        const saved = await addChatMessage(trainingId, role, content);
        res.json(saved);
    } catch (error) {
        console.error('Erro ao salvar mensagem:', error);
        res.status(500).json({ error: 'Erro interno ao salvar mensagem' });
    }
});

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
