const express = require('express');
const router = express.Router();
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const {
    get_message_templates_admin,
    save_message_template_admin,
    update_message_template_admin,
    delete_message_template_admin
} = require('../functions/database/messageTemplates');

router.get('/', verifyToken(), verifyModule('message_templates'), async (req, res) => {
    try {
        const { search, page, limit } = req.query;
        const result = await get_message_templates_admin({ search, page, limit, creator_id: req.user.id });
        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/', verifyToken(), verifyModule('create_message_template'), async (req, res) => {
    try {
        const { name, text, file, webAppButtonText, webAppButtonUrl } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'O nome do modelo é obrigatório' });
        }
        if (!text && !file) {
            return res.status(400).json({ error: 'O modelo deve conter ao menos um texto ou um arquivo/link' });
        }
        const result = await save_message_template_admin({ name, text, file, webAppButtonText, webAppButtonUrl, creator_id: req.user.id });
        res.status(201).json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

router.put('/:id', verifyToken(), verifyModule('update_message_template'), async (req, res) => {
    try {
        const { id } = req.params;
        const result = await update_message_template_admin(id, req.body, req.user.id);
        if (!result) {
            return res.status(404).json({ error: 'Template não encontrado ou sem permissão' });
        }
        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

router.delete('/:id', verifyToken(), verifyModule('delete_message_template'), async (req, res) => {
    try {
        const { id } = req.params;
        const result = await delete_message_template_admin(id, req.user.id);
        if (!result) {
            return res.status(404).json({ error: 'Template não encontrado ou sem permissão' });
        }
        res.json({ success: true, deleted: result });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
