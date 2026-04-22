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
const { listModules } = require('../functions/modules');
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');

createPermissionsTable().catch(console.error);

router.get('/', verifyToken(), verifyModule('permissions'), async (req, res) => {
    try {
        const permissions = await listPermissions(req.user.estado);
        res.json(permissions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/:id', verifyToken(), verifyModule('permissions'), async (req, res) => {
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

router.post('/', verifyToken(), verifyModule('create_permission'), async (req, res) => {
    try {
        const { name, description, modules, filters } = req.body;
        
        if (!name || !modules || !Array.isArray(modules)) {
            return res.status(400).json({ error: 'Nome e array de módulos são obrigatórios' });
        }

        if (filters && !Array.isArray(filters)) {
            return res.status(400).json({ error: 'Filtros devem ser um array' });
        }

        if (filters) {
            const allowedTypes = ['estado', 'regional', 'seccional', 'supervisor'];
            for (const f of filters) {
                if (!f.type || !f.value) {
                    return res.status(400).json({ error: 'Cada filtro deve ter type e value' });
                }
                if (!allowedTypes.includes(f.type)) {
                    return res.status(400).json({ error: `Tipo de filtro inválido: ${f.type}. Permitidos: ${allowedTypes.join(', ')}` });
                }
            }
        }

        const availableModules = (await listModules()).map(m => m.id);
        const invalidModules = modules.filter(m => !availableModules.includes(m));
        if (invalidModules.length > 0) {
            return res.status(400).json({ error: `Módulos inválidos: ${invalidModules.join(', ')}` });
        }

        const permission = await createPermission({
            name,
            description,
            modules,
            filters: filters || [],
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

router.put('/:id', verifyToken(), verifyModule('update_permission'), async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;

        if (data.filters && !Array.isArray(data.filters)) {
            return res.status(400).json({ error: 'Filtros devem ser um array' });
        }

        if (data.filters) {
            const allowedTypes = ['estado', 'regional', 'seccional', 'supervisor'];
            for (const f of data.filters) {
                if (!f.type || !f.value) {
                    return res.status(400).json({ error: 'Cada filtro deve ter type e value' });
                }
                if (!allowedTypes.includes(f.type)) {
                    return res.status(400).json({ error: `Tipo de filtro inválido: ${f.type}. Permitidos: ${allowedTypes.join(', ')}` });
                }
            }
        }
        
        const permission = await updatePermission(id, data, req.user.estado);
        if (!permission) {
            return res.status(404).json({ error: 'Permissão não encontrada' });
        }
        res.json(permission);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/:id', verifyToken(), verifyModule('delete_permission'), async (req, res) => {
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