const express = require('express');
const { validate } = require('../middlewares/validate');
const { userCreateSchema, userUpdateSchema, userLoginSchema, passwordSchema } = require('../db/schemas/users');
const z = require('zod');
const multer = require('multer');

const router = express.Router();
const crypto = require('crypto');
const { cenos_pool } = require('../db');
const {
    createUser,
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
const { minioClient, CONFIG, compressImage, ensureBucketExists, getFileUrl } = require('../functions/minio');

const { generateToken, verifyToken, verifyModule } = require('../middlewares/jwtAuth');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
});

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_SENHA = process.env.ADMIN_SENHA;
const ADMIN_NOME = process.env.ADMIN_NOME || 'Admin Principal';

(async () => {
    try {
        if (ADMIN_EMAIL && ADMIN_SENHA) {
            await createUser({
                email: ADMIN_EMAIL,
                senha: ADMIN_SENHA,
                nome: ADMIN_NOME,
                role: 'COMPANY_ADMIN',
                estado: 'pi',
                permissions: []
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
router.post('/login', validate(userLoginSchema), async (req, res) => {
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
        const modules = await getUserModules(user.id, user.estado);

        res.json({ 
            token, 
            user: { 
                id: user.id, 
                email: user.email, 
                nome: user.nome, 
                role: user.role, 
                estado: user.estado,
                foto: user.foto,
                modules
            } 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/register', verifyToken(), verifyModule('create_user'), validate(userCreateSchema), async (req, res) => {
    try {
        const { email, senha, nome, role, estado, permissions } = req.body;

        if (!email || !senha || !nome) {
            return res.status(400).json({ error: 'Email, senha e nome são obrigatórios' });
        }

        const user = await createUser({ 
            email, 
            senha, 
            nome, 
            role: role || 'USER', 
            estado: estado || req.user.estado,
            permissions: permissions || []
        });
        res.status(201).json(user);
    } catch (error) {
        if (error.message.includes('já existe')) {
            return res.status(409).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
});

// Me
router.get('/me', verifyToken(), async (req, res) => {
    try {
        const modules = await getUserModules(req.user.id, req.user.estado);
        const permissions = await getUserPermissions(req.user.id, req.user.estado);
        res.json({ ...req.user, modules});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/me/password', verifyToken(), validate(z.object({
    senha_atual: z.string().min(1),
    nova_senha: passwordSchema
})), async (req, res) => {
    try {
        const { senha_atual, nova_senha } = req.body;

        const user = await verifyUser(req.user.email, senha_atual);
        if (!user) {
            return res.status(401).json({ error: 'Senha atual incorreta' });
        }

        await changePassword(req.user.id, nova_senha);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/me', verifyToken(), validate(z.object({
    nome: z.string().min(1).max(255).optional(),
    foto: z.string().max(500).optional().nullable()
})), async (req, res) => {
    try {
        const { nome, foto } = req.body;
        const data = {};
        if (nome) data.nome = nome;
        if (foto !== undefined) data.foto = foto;

        const user = await updateUser(req.user.id, data);
        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        const modules = await getUserModules(req.user.id, req.user.estado);
        res.json({ ...user, modules });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/me/foto', verifyToken(), upload.single('foto'), async (req, res) => {
    try {
        let photoBuffer;
        let mimeType = 'image/jpeg';

        if (req.file) {
            photoBuffer = req.file.buffer;
            mimeType = req.file.mimetype;
        } else if (req.body.foto) {
            const matches = req.body.foto.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                mimeType = matches[1];
                photoBuffer = Buffer.from(matches[2], 'base64');
            } else {
                photoBuffer = Buffer.from(req.body.foto, 'base64');
            }
        } else {
            return res.status(400).json({ error: 'Nenhuma foto enviada' });
        }

        await ensureBucketExists();
        const fileName = `admin-profiles/${req.user.id}_${new Date().getTime()}.jpg`;

        const compressedData = await compressImage(photoBuffer, mimeType);

        await minioClient.putObject(
            CONFIG.bucket,
            fileName,
            compressedData,
            { 'Content-Type': mimeType }
        );

        const fileUrl = getFileUrl(fileName);

        await updateUser(req.user.id, { foto: fileUrl });

        res.json({ url: fileUrl });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Users CRUD
router.get('/users', verifyToken(), verifyModule('users'), async (req, res) => {
    try {
        const users = await listUsers(req.user.estado);
        const usersWithDetails = await Promise.all(users.map(async (u) => {
            const estado = u.estado || req.user.estado;
            const modules = await getUserModules(u.id, estado);
            const permissions = await getUserPermissions(u.id, estado);
            return { ...u, modules, permissions: permissions.map(p => p.id) };
        }));
        res.json(usersWithDetails);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/users/:id', verifyToken(), verifyModule('users'), async (req, res) => {
    try {
        const { id } = req.params;
        
        const user = await getUserById(id);
        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        const estado = user.estado || req.user.estado;
        const perms = await getUserPermissions(id, estado);
        const modules = await getUserModules(id, estado);
        
        res.json({ ...user, modules, permissions: perms });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/users/:id', verifyToken(), verifyModule('update_user'), validate(userUpdateSchema), async (req, res) => {
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

router.put('/users/:id/password', verifyToken(), verifyModule('update_user'), validate(z.object({ senha: passwordSchema })), async (req, res) => {
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

router.put('/users/:id/permissions', verifyToken(), verifyModule('permissions'), validate(z.object({ permissionIds: z.array(z.number().int()) })), async (req, res) => {
    try {
        const { id } = req.params;
        const { permissionIds } = req.body;

        if (!permissionIds || !Array.isArray(permissionIds)) {
            return res.status(400).json({ error: 'permissionIds deve ser um array' });
        }

        const targetUser = await getUserById(id);
        if (!targetUser) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        
        const estado = targetUser.estado || req.user.estado;
        await assignPermissionsToUser(id, permissionIds, estado);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/users/:id', verifyToken(), verifyModule('delete_user'), async (req, res) => {
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



module.exports = router;