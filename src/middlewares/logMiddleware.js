const redisClient = require('../redis');

const logMiddleware = async (req, res, next) => {
    const { method, url, ip, query, body, params } = req;

    // Não logar requisições para o próprio dashboard de logs para evitar poluição
    if (url.startsWith('/api/logs') || url.startsWith('/logs')) {
        return next();
    }

    const startTime = Date.now();

    // We use res.on('finish') to capture the status code after the request has been processed.
    res.on('finish', async () => {
        const duration = Date.now() - startTime;
        const status = res.statusCode;
        const success = status >= 200 && status < 400;

        // "Query" in this context will be a representation of all request data.
        const logData = {
            timestamp: new Date().toISOString(),
            method,
            url,
            ip,
            query: {
                url_query: query,
                params: params,
                body: method !== 'GET' ? body : undefined
            },
            status,
            success,
            duration: `${duration}ms`
        };

        try {
            if (redisClient.isOpen) {
                await redisClient.rPush('logs:api', JSON.stringify(logData));
            }
        } catch (err) {
            // Silently ignore Redis errors in test
        }
    });

    next();
};

module.exports = logMiddleware;
