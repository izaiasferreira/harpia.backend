const jwt = require('jsonwebtoken');
const { getUserById } = require('../functions/database/users');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('[FATAL] JWT_SECRET não definido nas variáveis de ambiente. O servidor não pode iniciar de forma segura.');
    process.exit(1);
}

function generateToken(user) {
    return jwt.sign({
        id: user.id,
        estado: user.estado
    }, JWT_SECRET, { expiresIn: '24h' });
}

function verifyToken(requiredRole = null) {
    
    return async (req, res, next) => {
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
            return res.status(401).json({ error: 'Authorization header obrigatório' });
        }

        const [type, token] = authHeader.split(' ');
        
        if (type !== 'Bearer' || !token) {
            return res.status(401).json({ error: 'Token inválido. Use Bearer <token>' });
        }

        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            
            const user = await getUserById(decoded.id, decoded.estado);
            if (!user) {
                return res.status(401).json({ error: 'Usuário não encontrado' });
            }

            if (requiredRole && user.role !== requiredRole) {
                return res.status(403).json({ error: `Acesso restrito apenas para Administradores` });
            }

            let modules = [];
            let permissions = [];
            try {
                const { getUserModules: getModules, getUserPermissions: getPermissions } = require('../functions/database/permissions');
                modules = await getModules(decoded.id, decoded.estado);
                permissions = await getPermissions(decoded.id, decoded.estado);
            } catch (modErr) {
                console.error('Error loading permissions/modules:', modErr.message);
            }
            
            req.user = { 
                id: decoded.id, 
                estado: decoded.estado, 
                role: user.role,
                nome: user.nome,
                email: user.email,
                foto: user.foto,
                modules,
                permissions
            };
            // console.log(JSON.stringify(req.user, null, 2))
           return next();
        } catch (err) {
            return res.status(401).json({ error: 'Token expirado ou inválido' });
        }
    };
}

async function getUserModules(userId, estado) {
    try {
        const { getUserModules: getModules } = require('../functions/database/permissions');
        return await getModules(userId, estado);
    } catch (err) {
        console.error('getUserModules error:', err.message);
        return [];
    }
}

function verifyModule(moduleId) {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Usuário não autenticado' });
        }

        const modules = req.user.modules || [];

        // Se o usuário for admin, ele tem acesso a todos os módulos
        if(req.user.role.toLowerCase().includes('admin')) {
            return next();
        }
        
        const requiredModules = Array.isArray(moduleId) ? moduleId : [moduleId];
        const hasAccess = requiredModules.some(mod => modules.includes(mod));
        
        // Se o módulo não estiver na lista de módulos do usuário, ele não tem acesso
        if (!hasAccess) {
            return res.status(403).json({ error: `Módulo não autorizado` });
        }
        
        next();
    };
}

module.exports = {
    generateToken,
    verifyToken,
    verifyModule,
    getUserModules,
    JWT_SECRET
};