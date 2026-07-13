const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/jwtAuth');
const { 
    getEquipmentTypes, 
    getEquipmentTypeBySlug, 
    createEquipmentType, 
    updateEquipmentType, 
    deleteEquipmentType 
} = require('../functions/database/equipmentTypes');

// Função de permissão (já existe globalmente, mas para garantir)
function verifyModule(moduleId) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'Usuário não autenticado' });
        if(req.user.role.toLowerCase().includes('admin')) return next();
        const modules = req.user.modules || [];
        if (modules.includes(moduleId)) return next();
        return res.status(403).json({ error: 'Acesso negado' });
    };
}

router.use(verifyToken());
router.use(verifyModule('manage_equipment_types'));

router.get('/', async (req, res) => {
    try {
        const types = await getEquipmentTypes();
        res.json(types);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/', async (req, res) => {
    try {
        const data = await createEquipmentType(req.body);
        res.status(201).json(data);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

router.put('/:slug', async (req, res) => {
    try {
        const data = await updateEquipmentType(req.params.slug, req.body);
        res.json(data);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

router.delete('/:slug', async (req, res) => {
    try {
        const success = await deleteEquipmentType(req.params.slug);
        res.json({ success });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

module.exports = router;
