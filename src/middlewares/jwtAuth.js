const jwt = require('jsonwebtoken');
const { getUserById } = require('../functions/database/users');

const JWT_SECRET = process.env.JWT_SECRET || 'jwt_secret_change_me';

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

            const modules = await getUserModules(decoded.id, decoded.estado);
            req.user = { 
                id: decoded.id, 
                estado: decoded.estado, 
                role: user.role,
                nome: user.nome,
                email: user.email,
                modules 
            };
            next();
        } catch (err) {
            return res.status(401).json({ error: 'Token expirado ou inválido' });
        }
    };
}

async function getUserModules(userId, estado) {
    const { getUserModules: getModules } = require('../functions/database/permissions');
    return await getModules(userId, estado);
}

module.exports = {
    generateToken,
    verifyToken,
    getUserModules,
    JWT_SECRET
};