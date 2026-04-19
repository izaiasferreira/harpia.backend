const express = require('express');
const router = express.Router();
const {
    createUser,
    createUsersTable,
    verifyUser,
    getUserById,
    updateLastLogin,
    listUsers,
    updateUser,
    changePassword,
    deleteUser
} = require('../functions/database/users');
const {
    assignPermissionsToUser,
    getUserPermissions,
    getUserModules
} = require('../functions/database/permissions');
const { listModules } = require('../functions/database/branches');
const { generateToken, verifyToken } = require('../middlewares/jwtAuth');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_SENHA = process.env.ADMIN_SENHA;
const ADMIN_NOME = process.env.ADMIN_NOME || 'Admin Principal';

(async () => {
    try {
        await createUsersTable();
        if (ADMIN_EMAIL && ADMIN_SENHA) {
            await createUser({
                email: ADMIN_EMAIL,
                senha: ADMIN_SENHA,
                nome: ADMIN_NOME,
                role: 'COMPANY_ADMIN',
                estado: 'pi'
            });
            console.log(`Admin criado: ${ADMIN_EMAIL}`);
        }
    } catch (err) {
        if (!err.message.includes('já existe')) {
            console.error('Erro ao criar admin:', err.message);
        }
    }
})();

const requireCompanyAdmin = verifyToken('COMPANY_ADMIN');

// Rotas públicas
router.post('/login', async (req, res) => {
    try {
        const { email, senha } = req.body;

        if (!email || !senha) {
            return res.status(400).json({ error: 'Email e senha são obrigatórios' });
        }

        const user = await verifyUser(email, senha);
        if (!user) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        await updateLastLogin(user.id);

        const token = generateToken(user);

        res.json({ token, user: { id: user.id, email: user.email, nome: user.nome, role: user.role, estado: user.estado } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/register', requireCompanyAdmin, async (req, res) => {
    try {
        if (req.user.role !== 'COMPANY_ADMIN') {
            return res.status(403).json({ error: 'Apenas Administradores podem criar usuários' });
        }

        const { email, senha, nome, role, estado } = req.body;

        if (!email || !senha || !nome) {
            return res.status(400).json({ error: 'Email, senha e nome são obrigatórios' });
        }

        const user = await createUser({ email, senha, nome, role: role || 'USER', estado: estado || req.user.estado });
        res.status(201).json(user);
    } catch (error) {
        if (error.message.includes('já existe')) {
            return res.status(409).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
});

// Me
router.get('/me', requireCompanyAdmin, async (req, res) => {
    try {
        const modules = await getUserModules(req.user.id, req.user.estado);
        res.json({ ...req.user, modules });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Users CRUD
router.get('/users', requireCompanyAdmin, async (req, res) => {
    try {
        const users = await listUsers(req.user.estado);
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/users/:id', requireCompanyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        const user = await getUserById(id);
        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        const estado = user.estado || req.user.estado;
        const perms = await getUserPermissions(id, estado);
        res.json({ ...user, permissions: perms });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/users/:id', requireCompanyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;
        
        const user = await updateUser(id, data);
        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/users/:id/password', requireCompanyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { senha } = req.body;

        if (!senha) {
            return res.status(400).json({ error: 'Nova senha é obrigatória' });
        }

        const result = await changePassword(id, senha);
        if (!result) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/users/:id/permissions', requireCompanyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { permissionIds } = req.body;

        if (!permissionIds || !Array.isArray(permissionIds)) {
            return res.status(400).json({ error: 'permissionIds deve ser um array' });
        }

        const user = await getUserById(id);
        const estado = user?.estado || req.user.estado;
        await assignPermissionsToUser(id, permissionIds, estado);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/users/:id', requireCompanyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await deleteUser(id);
        if (!result) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Modules
router.get('/modules', requireCompanyAdmin, async (req, res) => {
    try {
        const modules = listModules();
        res.json(modules);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;