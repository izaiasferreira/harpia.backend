const express = require('express');
const router = express.Router();
const { verifyAdmin, getAdminById, updateLastLogin, createAdmin, listAdmins, updateAdmin, changePassword, deleteAdmin } = require('../functions/database/admin');
const {
    get_justify,
    update_justify,
    delete_justify,
    get_daily_reports,
    get_inventory_by_agent,
    get_pending_justifies
} = require('../functions/database/agentes');

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin_secret_change_me';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_SENHA = process.env.ADMIN_SENHA;
const ADMIN_NOME = process.env.ADMIN_NOME || 'Admin Principal';

(async () => {
    if (ADMIN_EMAIL && ADMIN_SENHA) {
        try {
            await createAdmin({
                email: ADMIN_EMAIL,
                senha: ADMIN_SENHA,
                nome: ADMIN_NOME,
                estado: 'pi',
                nivel: 'admin'
            });
            console.log(`Admin criado: ${ADMIN_EMAIL}`);
        } catch (err) {
            if (!err.message.includes('já existe')) {
                console.error('Erro ao criar admin:', err.message);
            }
        }
    }
})();

async function adminAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
        return res.status(401).json({ error: 'Authorization header obrigatório' });
    }

    const [type, credentials] = authHeader.split(' ');
    
    if (type !== 'Basic') {
        return res.status(401).json({ error: 'Tipo de autenticação inválido. Use Basic auth.' });
    }

    if (credentials !== ADMIN_SECRET) {
        return res.status(401).json({ error: 'Secret inválido' });
    }

    const adminId = req.headers['x-admin-id'];
    if (!adminId) {
        return res.status(401).json({ error: 'Admin não autenticado' });
    }

    const admin = await getAdminById(adminId);
    if (!admin) {
        return res.status(401).json({ error: 'Admin não encontrado ou inativo' });
    }

    req.admin = admin;
    next();
}

router.post('/login', async (req, res) => {
    try {
        const { email, senha } = req.body;

        if (!email || !senha) {
            return res.status(400).json({ error: 'Email e senha são obrigatórios' });
        }

        const admin = await verifyAdmin(email, senha);
        if (!admin) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        await updateLastLogin(admin.id);

        res.json({
            id: admin.id,
            email: admin.email,
            nome: admin.nome,
            estado: admin.estado,
            nivel: admin.nivel
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/register', async (req, res) => {
    try {
        const { email, senha, nome, estado, nivel } = req.body;

        if (!email || !senha || !nome) {
            return res.status(400).json({ error: 'Email, senha e nome são obrigatórios' });
        }

        const admin = await createAdmin({ email, senha, nome, estado, nivel });
        res.status(201).json(admin);
    } catch (error) {
        if (error.message.includes('já existe')) {
            return res.status(409).json({ error: error.message });
        }
        res.status(500).json({ error: error.message });
    }
});

router.get('/admins', adminAuth, async (req, res) => {
    try {
        const { estado } = req.query;
        const admins = await listAdmins(estado);
        res.json(admins);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/admin/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;
        
        const admin = await updateAdmin(id, data);
        if (!admin) {
            return res.status(404).json({ error: 'Admin não encontrado' });
        }
        res.json(admin);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/admin/:id/password', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { senha } = req.body;

        if (!senha) {
            return res.status(400).json({ error: 'Nova senha é obrigatória' });
        }

        const result = await changePassword(id, senha);
        if (!result) {
            return res.status(404).json({ error: 'Admin não encontrado' });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/admin/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await deleteAdmin(id);
        
        if (!result) {
            return res.status(404).json({ error: 'Admin não encontrado' });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/justify', adminAuth, async (req, res) => {
    try {
        const { instalacao, tipo, data_leit_prev, estado, author } = req.query;
        
        const result = await get_justify({
            instalacao,
            tipo,
            data_leit_prev,
            estado,
            author
        });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/justify/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { instalacao, tipo, motivo, justificativa, foto, data_leit_prev, quantidade, estado } = req.body;
        
        const result = await update_justify({
            id,
            instalacao,
            tipo,
            motivo,
            justificativa,
            foto,
            data_leit_prev,
            quantidade,
            estado
        });
        
        if (!result) {
            return res.status(404).json({ error: 'Justificativa não encontrada' });
        }
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/justify/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await delete_justify(id);
        
        if (!result) {
            return res.status(404).json({ error: 'Justificativa não encontrada' });
        }
        res.json({ success: true, deleted: result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/justify_pending', adminAuth, async (req, res) => {
    try {
        const { autor, status, page, limit, estado } = req.query;
        
        const result = await get_pending_justifies({ state: estado, autor, status, page, limit });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/daily_report', adminAuth, async (req, res) => {
    try {
        const { autor, data, limit, estado } = req.query;
        
        const reports = await get_daily_reports({ autor, data, limit, estado, page: 1, includeAll: true });
        res.json(reports);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/inventory', adminAuth, async (req, res) => {
    try {
        const { agente, estado } = req.query;
        
        const result = await get_inventory_by_agent({ agente, estado });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/me', adminAuth, async (req, res) => {
    res.json(req.admin);
});

module.exports = router;