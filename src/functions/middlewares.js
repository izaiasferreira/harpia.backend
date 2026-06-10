require('dotenv').config();
const { validateToken, logUsage } = require('./database/apiTokens');

async function checkToken(req, res) {
    const rawToken = req.query.token || req.headers['x-api-token'] || req.headers['authorization']?.replace('Bearer ', '');

    if (!rawToken) {
        res.status(401).json({ error: 'Token é obrigatório (query ?token= ou header X-API-Token ou Authorization: Bearer)' });
        return false;
    }

    if (!rawToken.startsWith('cenos_')) {
        res.status(401).json({ error: 'Token inválido' });
        return false;
    }

    try {
        const token = await validateToken(rawToken);

        if (!token) {
            res.status(401).json({ error: 'Token inválido, expirado ou revogado' });
            return false;
        }

        // Log de uso assíncrono (não bloqueia)
        logUsage({
            tokenId: token.id,
            endpoint: req.originalUrl || req.url,
            method: req.method,
            ip: req.ip || req.connection?.remoteAddress,
            userAgent: req.headers['user-agent']
        }).catch(() => {});

        req.apiToken = token;
        return true;
    } catch (err) {
        console.error('[checkToken] Erro:', err.message);
        res.status(500).json({ error: 'Erro ao validar token' });
        return false;
    }
}

module.exports = { checkToken };