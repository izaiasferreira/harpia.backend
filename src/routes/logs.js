const express = require('express');
const router = express.Router();
const redisClient = require('../redis');

const LOGS_PASSWORD = process.env.LOGS_PASSWORD || 'ceneged123';

// Auth middleware simplificado para as rotas de API de logs
const authMiddleware = (req, res, next) => {
    const token = req.headers['authorization'];
    if (token === LOGS_PASSWORD) {
        return next();
    }
    return res.status(401).json({ error: 'Não autorizado' });
};

// Login
router.post('/logs/login', (req, res) => {
    const { password } = req.body;
    if (password === LOGS_PASSWORD) {
        return res.json({ success: true, token: LOGS_PASSWORD });
    }
    return res.status(401).json({ success: false, error: 'Senha incorreta' });
});

// Buscar logs com filtros e paginação
router.get('/logs/data', authMiddleware, async (req, res) => {
    try {
        const { page = 1, limit = 20, route, status, dateStart, dateEnd } = req.query;
        
        // Buscamos os últimos 2000 logs para filtrar em memória (equilíbrio entre performance e detalhe)
        const allLogsRaw = await redisClient.lRange('logs:api', -2000, -1);
        let logs = allLogsRaw.map(l => JSON.parse(l)).reverse();

        // Filtros
        if (route) {
            logs = logs.filter(l => l.url.includes(route));
        }
        if (status) {
            logs = logs.filter(l => l.status === parseInt(status));
        }
        if (dateStart) {
            const start = new Date(dateStart).getTime();
            logs = logs.filter(l => new Date(l.timestamp).getTime() >= start);
        }
        if (dateEnd) {
            const end = new Date(dateEnd).getTime();
            logs = logs.filter(l => new Date(l.timestamp).getTime() <= end);
        }

        // Paginação
        const total = logs.length;
        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;
        const paginatedLogs = logs.slice(startIndex, endIndex);

        res.json({
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(total / limit),
            data: paginatedLogs
        });
    } catch (err) {
        console.error('Erro ao buscar logs:', err);
        res.status(500).json({ error: 'Erro interno ao buscar logs' });
    }
});

// Exportar todos os logs filtrados com suporte a colunas dinâmicas para query, params e body
router.get('/logs/export', authMiddleware, async (req, res) => {
    try {
        const { route, status, dateStart, dateEnd } = req.query;
        
        // Limite maior para exportação (5000 últimos logs)
        const allLogsRaw = await redisClient.lRange('logs:api', -5000, -1);
        let logs = allLogsRaw.map(l => JSON.parse(l)).reverse();

        if (route) logs = logs.filter(l => l.url.includes(route));
        if (status) logs = logs.filter(l => l.status === parseInt(status));
        if (dateStart) {
            const start = new Date(dateStart).getTime();
            logs = logs.filter(l => new Date(l.timestamp).getTime() >= start);
        }
        if (dateEnd) {
            const end = new Date(dateEnd).getTime();
            logs = logs.filter(l => new Date(l.timestamp).getTime() <= end);
        }

        // 1. Identificar todas as chaves dinâmicas únicas presentes em url_query, params e body
        const dynamicKeys = new Set();
        logs.forEach(l => {
            const q = l.query || {};
            
            if (q.url_query) Object.keys(q.url_query).forEach(k => dynamicKeys.add(`Q_${k}`));
            if (q.params) Object.keys(q.params).forEach(k => dynamicKeys.add(`P_${k}`));
            if (q.body) Object.keys(q.body).forEach(k => dynamicKeys.add(`B_${k}`));
        });

        // Ordenar colunas dinâmicas para consistência
        const sortedDynamicKeys = Array.from(dynamicKeys).sort();

        // 2. Criar o cabeçalho do CSV
        const baseHeader = ['Timestamp', 'Metodo', 'URL', 'IP', 'Status', 'Sucesso', 'Duracao'];
        const fullHeader = [...baseHeader, ...sortedDynamicKeys].join(',') + '\n';

        // 3. Gerar as linhas do CSV com base nas colunas dinâmicas
        const rows = logs.map(l => {
            const cleanUrl = l.url.split('?')[0];
            const baseData = [
                l.timestamp,
                l.method,
                `"${cleanUrl.replace(/"/g, '""')}"`, // Escapar aspas da URL limpa
                l.ip,
                l.status,
                l.success,
                l.duration
            ];

            const q = l.query || {};
            const dynamicData = sortedDynamicKeys.map(fullKey => {
                const [prefix, ...keyParts] = fullKey.split('_');
                const key = keyParts.join('_');
                
                let value = '';
                if (prefix === 'Q' && q.url_query && q.url_query[key]) value = q.url_query[key];
                else if (prefix === 'P' && q.params && q.params[key]) value = q.params[key];
                else if (prefix === 'B' && q.body && q.body[key]) value = q.body[key];

                // Escapar valores para CSV (stringify se for objeto)
                if (typeof value === 'object' && value !== null) value = JSON.stringify(value);
                const stringValue = String(value || '');
                return `"${stringValue.replace(/"/g, '""')}"`;
            });

            return [...baseData, ...dynamicData].join(',');
        }).join('\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=logs_api_dinamico.csv');
        
        // Enviar com BOM para o Excel abrir UTF-8 corretamente
        res.send('\ufeff' + fullHeader + rows);
    } catch (err) {
        console.error('Erro ao exportar logs:', err);
        res.status(500).send('Erro ao exportar logs');
    }
});

// Limpar logs baseados em filtros (operação destrutiva seletiva)
router.delete('/logs/clear', authMiddleware, async (req, res) => {
    try {
        const { route, status, dateStart, dateEnd } = req.query;
        
        if (!route && !status && !dateStart && !dateEnd) {
            return res.status(400).json({ error: 'Nenhum filtro especificado para limpeza' });
        }

        // 1. Buscar todos os logs (com limite de segurança equilibrado)
        const allLogsRaw = await redisClient.lRange('logs:api', 0, -1);
        if (allLogsRaw.length === 0) return res.json({ success: true, count: 0 });

        const logs = allLogsRaw.map(l => JSON.parse(l));
        
        // 2. Identificar quais devem ser MANTIDOS (não batem com o filtro)
        const logsToKeep = logs.filter(l => {
            let match = true;
            
            if (route && !l.url.includes(route)) match = false;
            if (status && l.status !== parseInt(status)) match = false;
            if (dateStart && new Date(l.timestamp).getTime() < new Date(dateStart).getTime()) match = false;
            if (dateEnd && new Date(l.timestamp).getTime() > new Date(dateEnd).getTime()) match = false;

            // Se bater com TODOS os filtros ativos, 'match' é true.
            // Para limpeza seletiva, queremos MANTER o que NÃO bater com o filtro.
            return !match;
        });

        const removedCount = logs.length - logsToKeep.length;

        // 3. Atualizar Redis: Deletar chave e reinserir logs preservados (RPUSH aceita múltiplos argumentos)
        await redisClient.del('logs:api');
        
        if (logsToKeep.length > 0) {
            // Reinserir convertendo de volta para string JSON
            const logsToPush = logsToKeep.map(l => JSON.stringify(l));
            await redisClient.rPush('logs:api', logsToPush);
        }

        res.json({ success: true, removedCount });
    } catch (err) {
        console.error('Erro ao limpar logs filtrados:', err);
        res.status(500).json({ error: 'Erro interno ao limpar logs' });
    }
});

module.exports = router;
