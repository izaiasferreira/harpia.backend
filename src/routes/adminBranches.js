const express = require('express');
const router = express.Router();
const {
    createBranch,
    createBranchesTable,
    getBranchById,
    listBranches,
    updateBranch,
    deleteBranch
} = require('../functions/database/branches');
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');

createBranchesTable().catch(console.error);

router.get('/', verifyToken(), verifyModule('branches'), async (req, res) => {
    try {
        const branches = await listBranches(req.user.estado);
        res.json(branches);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/:id', verifyToken(), verifyModule('branches'), async (req, res) => {
    try {
        const { id } = req.params;
        
        const branch = await getBranchById(id, req.user.estado);
        if (!branch) {
            return res.status(404).json({ error: 'Branch não encontrado' });
        }
        res.json(branch);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/', verifyToken(), verifyModule('create_branch'), async (req, res) => {
    try {
        const { name, code, state, parent_id } = req.body;

        if (!name || !code) {
            return res.status(400).json({ error: 'Nome e código são obrigatórios' });
        }

        const branch = await createBranch({
            name,
            code,
            state: state || req.user.estado,
            parent_id
        });
        res.status(201).json(branch);
    } catch (error) {
        if (error.message.includes('já existe')) {
            return res.status(409).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
});

router.put('/:id', verifyToken(), verifyModule('update_branch'), async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;
        
        const branch = await updateBranch(id, data, req.user.estado);
        if (!branch) {
            return res.status(404).json({ error: 'Branch não encontrado' });
        }
        res.json(branch);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/:id', verifyToken(), verifyModule('delete_branch'), async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await deleteBranch(id, req.user.estado);
        if (!result) {
            return res.status(404).json({ error: 'Branch não encontrado' });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;