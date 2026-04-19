const express = require('express');
const router = express.Router();
const {
    createPermission,
    createPermissionsTable,
    getPermissionById,
    listPermissions,
    updatePermission,
    deletePermission
} = require('../functions/database/permissions');
const { listModules } = require('../functions/database/branches');
const { verifyToken } = require('../middlewares/jwtAuth');

createPermissionsTable().catch(console.error);

const requireCompanyAdmin = verifyToken('COMPANY_ADMIN');

router.get('/', requireCompanyAdmin, async (req, res) => {
    try {
        const permissions = await listPermissions(req.user.estado);
        res.json(permissions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/:id', requireCompanyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        const permission = await getPermissionById(id, req.user.estado);
        if (!permission) {
            return res.status(404).json({ error: 'Permissão não encontrada' });
        }
        res.json(permission);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/', requireCompanyAdmin, async (req, res) => {
    try {
        const { name, description, modules } = req.body;

        if (!name || !modules || !Array.isArray(modules)) {
            return res.status(400).json({ error: 'Nome e array de módulos são obrigatórios' });
        }

        const availableModules = listModules().map(m => m.id);
        const invalidModules = modules.filter(m => !availableModules.includes(m));
        if (invalidModules.length > 0) {
            return res.status(400).json({ error: `Módulos inválidos: ${invalidModules.join(', ')}` });
        }

        const permission = await createPermission({
            name,
            description,
            modules,
            state: req.user.estado
        });
        res.status(201).json(permission);
    } catch (error) {
        if (error.message.includes('já existe')) {
            return res.status(409).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
});

router.put('/:id', requireCompanyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;
        
        const permission = await updatePermission(id, data, req.user.estado);
        if (!permission) {
            return res.status(404).json({ error: 'Permissão não encontrada' });
        }
        res.json(permission);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/:id', requireCompanyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await deletePermission(id, req.user.estado);
        if (!result) {
            return res.status(404).json({ error: 'Permissão não encontrada' });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;