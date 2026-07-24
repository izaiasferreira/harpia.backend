/**
 * Middleware para captura e validação estrita da assinatura do dispositivo (gedai-device-id).
 */
module.exports = (req, res, next) => {
    // Ignorar validação para requisições de preflight do CORS
    if (req.method === 'OPTIONS') return next();

    const deviceId = req.headers['gedai-device-id'];
    if (!deviceId || typeof deviceId !== 'string' || deviceId.trim() === '') {
        return res.status(400).json({ error: 'Requisição inválida. Contacte o suporte técnico.' });
    }

    req.deviceId = deviceId.trim();
    next();
};
