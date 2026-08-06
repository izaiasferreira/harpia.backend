/**
 * Middleware para captura e validação da assinatura do dispositivo (sinergia-device-id).
 * 
 * MODO DE TRANSIÇÃO / COMPATIBILIDADE:
 * - Prefere o header `sinergia-device-id`; aceita `gedai-device-id` como legado.
 * - STRICT_ENFORCE = false: (Padrão Atual) Extrai o deviceId quando enviado, mas PERMITE a requisição continuar sem rejeitar.
 * - STRICT_ENFORCE = true: Rejeita requisições sem o header com HTTP 400 (ERR_SEC_101).
 * 
 * Para ativar o bloqueio estrito futuramente, mude a constante abaixo para `true` 
 * ou adicione `ENFORCE_DEVICE_ID=true` no arquivo .env do backend.
 */
const STRICT_ENFORCE = process.env.ENFORCE_DEVICE_ID === 'true' || false;

module.exports = (req, res, next) => {
    // Ignorar validação para requisições de preflight do CORS
    if (req.method === 'OPTIONS') return next();

    const deviceId = req.headers['sinergia-device-id'] || req.headers['gedai-device-id'];

    if (deviceId && typeof deviceId === 'string' && deviceId.trim() !== '') {
        req.deviceId = deviceId.trim();
        return next();
    }

    req.deviceId = null;

    // Se a trava estrita estiver ativa, rejeita sem o header
    if (STRICT_ENFORCE) {
        return res.status(400).json({ error: 'Requisição inválida (ERR_SEC_101).' });
    }

    // Modo de transição ativo: permite a requisição passar normalmente durante a migração
    next();
};
