const express = require('express');
const router = express.Router();
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const {
    getChatMessages,
    clearChatMessages,
    sendChatMessage,
    applyTemplateStructure,
} = require('../functions/database/checklistTemplateChat');

// GET /admin/checklists/templates/:id/chat - obter histórico de chat do template
router.get('/:id/chat', verifyToken(), verifyModule('manage_checklist_templates'), async (req, res) => {
    try {
        const templateId = req.params.id;
        const messages = await getChatMessages(templateId);
        res.json(messages);
    } catch (error) {
        console.error('Erro ao buscar mensagens do chat do template:', error);
        res.status(500).json({ error: 'Erro interno ao buscar mensagens' });
    }
});

// POST /admin/checklists/templates/:id/chat - enviar mensagem para a IA
router.post('/:id/chat', verifyToken(), verifyModule('manage_checklist_templates'), async (req, res) => {
    try {
        const templateId = req.params.id;
        const { message, currentStructure, attachments } = req.body;

        if ((!message || !message.trim()) && (!attachments || attachments.length === 0)) {
            return res.status(400).json({ error: 'Mensagem ou anexos são obrigatórios' });
        }

        const result = await sendChatMessage(templateId, message || '', currentStructure || {}, attachments);
        res.json(result);
    } catch (error) {
        console.error('Erro ao enviar mensagem no chat do template:', error);
        res.status(500).json({ error: error.message || 'Erro interno ao processar mensagem' });
    }
});

// POST /admin/checklists/templates/:id/chat/apply - aplicar estrutura proposta pela IA
router.post('/:id/chat/apply', verifyToken(), verifyModule('manage_checklist_templates'), async (req, res) => {
    try {
        const templateId = req.params.id;
        const { proposedStructure } = req.body;

        if (!proposedStructure) {
            return res.status(400).json({ error: 'proposedStructure é obrigatório' });
        }

        await applyTemplateStructure(templateId, proposedStructure);
        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao aplicar estrutura proposta:', error);
        res.status(500).json({ error: error.message || 'Erro interno ao aplicar alterações' });
    }
});

// DELETE /admin/checklists/templates/:id/chat - limpar chat do template
router.delete('/:id/chat', verifyToken(), verifyModule('manage_checklist_templates'), async (req, res) => {
    try {
        const templateId = req.params.id;
        await clearChatMessages(templateId);
        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao limpar chat do template:', error);
        res.status(500).json({ error: 'Erro interno ao limpar chat' });
    }
});

module.exports = router;
