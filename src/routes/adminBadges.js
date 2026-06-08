const express = require('express');
const router = express.Router();
const {
    listBadges,
    getBadgeById,
    createBadge,
    updateBadge,
    deleteBadge
} = require('../functions/database/badges');
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const { validate } = require('../middlewares/validate');
const { badgeCreateSchema } = require('../db/schemas/badges');

router.get('/', verifyToken(), verifyModule('badges'), async (req, res) => {
    try {
        const badges = await listBadges();
        res.json(badges);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/:id', verifyToken(), verifyModule('badges'), async (req, res) => {
    try {
        const { id } = req.params;
        const badge = await getBadgeById(id);
        if (!badge) {
            return res.status(404).json({ error: 'Badge não encontrado' });
        }
        res.json(badge);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/', verifyToken(), verifyModule('create_badge'), validate(badgeCreateSchema), async (req, res) => {
    try {
        const { title, description, image_url } = req.body;

        if (!title) {
            return res.status(400).json({ error: 'Título é obrigatório' });
        }

        const badge = await createBadge({ title, description, image_url });
        res.status(201).json(badge);
    } catch (error) {
        console.error('[POST /admin/badge] Erro:', error.message, error.stack);
        res.status(500).json({ error: error.message });
    }
});

router.put('/:id', verifyToken(), verifyModule('update_badge'), validate(require('../db/schemas/badges').badgeSchema.partial()), async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;

        const badge = await updateBadge(id, data);
        if (!badge) {
            return res.status(404).json({ error: 'Badge não encontrado' });
        }
        res.json(badge);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/:id', verifyToken(), verifyModule('delete_badge'), async (req, res) => {
    try {
        const { id } = req.params;

        const badge = await deleteBadge(id);
        if (!badge) {
            return res.status(404).json({ error: 'Badge não encontrado' });
        }
        res.json({ success: true, deleted: badge });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
