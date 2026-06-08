const express = require('express');
const { validate } = require('../middlewares/validate');
const z = require('zod');

const router = express.Router();
const { 
    getUserData, 
    addBadgeToProfile, 
    removeBadgeFromProfile 
} = require('../functions/database/agentes');
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');

// List badges for a specific user (using getUserData)
router.get('/:id', verifyToken(), verifyModule('badges'), async (req, res) => {
    try {
        const { id } = req.params;
        const state = req.query.state || req.user.estado;
        
        const userData = await getUserData({ id, state });
        if (!userData || !userData.id) {
            return res.status(404).json({ error: 'Usuário não encontrado no sistema de campo' });
        }
        
        res.json({
            id: userData.id,
            nome: userData.nome,
            badges: userData.badges || []
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add badge to user
router.post('/:id/add', verifyToken(), verifyModule('update_user'), validate(z.object({ badgeId: z.number().int() })), async (req, res) => {
    try {
        const { id } = req.params;
        const { badgeId } = req.body;

        if (!badgeId) {
            return res.status(400).json({ error: 'badgeId é obrigatório' });
        }

        const updatedBadges = await addBadgeToProfile(id, badgeId);
        res.json({ success: true, badges: updatedBadges });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Remove badge from user
router.post('/:id/remove', verifyToken(), verifyModule('update_user'), validate(z.object({ badgeId: z.number().int() })), async (req, res) => {
    try {
        const { id } = req.params;
        const { badgeId } = req.body;

        if (!badgeId) {
            return res.status(400).json({ error: 'badgeId é obrigatório' });
        }

        const updatedBadges = await removeBadgeFromProfile(id, badgeId);
        res.json({ success: true, badges: updatedBadges });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
