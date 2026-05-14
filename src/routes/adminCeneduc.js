const express = require('express');
const router = express.Router();
const {
    listCeneducCards,
    getCeneducCardById,
    createCeneducCard,
    updateCeneducCard,
    deleteCeneducCard
} = require('../functions/database/ceneduc');
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');

const VALID_TYPES = ['cover', 'train_item'];
const VALID_SECTIONS = ['slider', 'banner'];

router.get('/', verifyToken(), verifyModule('ceneduc'), async (req, res) => {
    try {
        const state = req.query.state || undefined;
        const cards = await listCeneducCards({ state, activeOnly: false });
        res.json(cards);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/:id', verifyToken(), verifyModule('ceneduc'), async (req, res) => {
    try {
        const { id } = req.params;
        const card = await getCeneducCardById(id);
        if (!card) {
            return res.status(404).json({ error: 'Card não encontrado' });
        }
        res.json(card);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/', verifyToken(), verifyModule('create_ceneduc'), async (req, res) => {
    try {
        const { card_type, section, group_title, state, sort_order, badge_id, data } = req.body;

        console.log(req.body)
        if (!card_type || !VALID_TYPES.includes(card_type)) {
            console.log("Entrou aqui")
            return res.status(400).json({ error: 'card_type deve ser "cover" ou "train_item"' });
        }

        if (card_type === 'train_item' && section && !VALID_SECTIONS.includes(section)) {
            console.log("Na verdade entrou aqui")
            return res.status(400).json({ error: 'section deve ser "slider" ou "banner"' });
        }

        if (card_type === 'train_item' && !group_title) {
            console.log("Na verdade foi entrou")
            return res.status(400).json({ error: 'group_title é obrigatório para train_item' });
        }

        const card = await createCeneducCard({ card_type, section, group_title, state, sort_order, badge_id, data });
        res.status(201).json(card);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/:id', verifyToken(), verifyModule('update_ceneduc'), async (req, res) => {
    try {
        const { id } = req.params;
        const { card_type, section, group_title, state, sort_order, active, badge_id, data } = req.body;

        if (card_type && !VALID_TYPES.includes(card_type)) {
            return res.status(400).json({ error: 'card_type deve ser "cover" ou "train_item"' });
        }

        const card = await updateCeneducCard(id, { card_type, section, group_title, state, sort_order, active, badge_id, data });
        if (!card) {
            return res.status(404).json({ error: 'Card não encontrado' });
        }
        res.json(card);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/:id', verifyToken(), verifyModule('delete_ceneduc'), async (req, res) => {
    try {
        const { id } = req.params;

        const card = await deleteCeneducCard(id);
        if (!card) {
            return res.status(404).json({ error: 'Card não encontrado' });
        }
        res.json({ success: true, deleted: card });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
