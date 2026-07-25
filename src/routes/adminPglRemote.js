const express = require('express');
const router = express.Router();
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const { getTokensByAgent } = require('../functions/database/fcmTokens');
const { sendToMultiple } = require('../functions/firebase');

// In-memory command queue / pending requests map for agent remote inspection
const pendingPglCommands = new Map(); // requestId -> { res, timeout, agentId, command, orderId }

/**
 * Endpoint acionado pelo Admin Web para solicitar a leitura dos servicos PGL de um agente.
 */
router.post('/agents/:agentId/fetch-services', verifyToken('COMPANY_ADMIN'), verifyModule('pgl_remote_inspection'), async (req, res) => {
    const { agentId } = req.params;
    if (!agentId) {
        return res.status(400).json({ error: 'agentId obrigatorio' });
    }

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    console.log(`[PGL_REMOTE_BACK] 📥 Admin solicitou LEITURA de serviços PGL para o agente: ${agentId} | requestId: ${requestId}`);
    
    // Registra o comando pendente
    const timeout = setTimeout(() => {
        if (pendingPglCommands.has(requestId)) {
            pendingPglCommands.delete(requestId);
            console.warn(`[PGL_REMOTE_BACK] ⏱️ Timeout atingido (60s) aguardando resposta do agente ${agentId} | requestId: ${requestId}`);
            res.status(504).json({ error: 'Tempo limite excedido aguardando resposta do dispositivo do agente.' });
        }
    }, 60000);

    pendingPglCommands.set(requestId, {
        res,
        timeout,
        agentId,
        command: 'fetch_services',
        created: Date.now()
    });

    try {
        const tokens = await getTokensByAgent(agentId);
        if (tokens.length > 0) {
            await sendToMultiple(tokens, 'PGL Remote', 'Comando fetch_services', { 
                type: 'pgl_remote_command', 
                critical: 'true',
                command: 'fetch_services',
                requestId: requestId
            });
        }
    } catch (e) {
        console.warn('[PGL_REMOTE_BACK] Falha ao enviar notificação push:', e.message);
    }
});

/**
 * Endpoint acionado pelo Admin Web para solicitar a reversao de um servico PGL de um agente.
 */
router.post('/agents/:agentId/revert-service', verifyToken('COMPANY_ADMIN'), verifyModule('pgl_remote_inspection'), async (req, res) => {
    const { agentId } = req.params;
    const { orderId } = req.body;

    if (!agentId || !orderId) {
        return res.status(400).json({ error: 'agentId e orderId sao obrigatorios' });
    }

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    console.log(`[PGL_REMOTE_BACK] 📥 Admin solicitou REVERSÃO da ordem ${orderId} para o agente: ${agentId} | requestId: ${requestId}`);

    const timeout = setTimeout(() => {
        if (pendingPglCommands.has(requestId)) {
            pendingPglCommands.delete(requestId);
            console.warn(`[PGL_REMOTE_BACK] ⏱️ Timeout atingido (60s) aguardando reversão do agente ${agentId} | requestId: ${requestId}`);
            res.status(504).json({ error: 'Tempo limite excedido aguardando resposta do dispositivo do agente.' });
        }
    }, 60000);

    pendingPglCommands.set(requestId, {
        res,
        timeout,
        agentId,
        command: 'revert_service',
        orderId,
        created: Date.now()
    });

    try {
        const tokens = await getTokensByAgent(agentId);
        if (tokens.length > 0) {
            await sendToMultiple(tokens, 'PGL Remote', 'Comando revert_service', { 
                type: 'pgl_remote_command', 
                critical: 'true',
                command: 'revert_service',
                requestId: requestId,
                orderId: orderId
            });
        }
    } catch (e) {
        console.warn('[PGL_REMOTE_BACK] Falha ao enviar notificação push:', e.message);
    }
});

/**
 * Endpoint consultado pelo App Mobile do Agente para polling de comandos PGL remotos pendentes.
 */
router.get('/agent-commands/:agentId', async (req, res) => {
    const { agentId } = req.params;
    const commands = [];

    for (const [reqId, item] of pendingPglCommands.entries()) {
        if (item.agentId === agentId && !item.dispatched) {
            commands.push({
                requestId: reqId,
                command: item.command,
                orderId: item.orderId
            });
            item.dispatched = true;
        }
    }

    if (commands.length > 0) {
        console.log(`[PGL_REMOTE_BACK] 📡 Entregando ${commands.length} comando(s) pendente(s) para o agente: ${agentId}`);
    }

    res.json({ commands });
});

/**
 * Endpoint acionado pelo App Mobile do Agente para entregar a resposta do comando PGL executado no dispositivo.
 */
router.post('/agent-commands/respond', async (req, res) => {
    const { requestId, payload, error } = req.body;
    console.log(`[PGL_REMOTE_BACK] 📤 Resposta recebida do dispositivo para requestId: ${requestId} | Erro: ${error || 'Nenhum'}`);

    if (!requestId || !pendingPglCommands.has(requestId)) {
        console.warn(`[PGL_REMOTE_BACK] ⚠️ Resposta ignorada: requestId ${requestId} não encontrado ou já expirado.`);
        return res.status(404).json({ error: 'Requisicao nao encontrada ou ja expirada' });
    }

    const item = pendingPglCommands.get(requestId);
    clearTimeout(item.timeout);
    pendingPglCommands.delete(requestId);

    if (error) {
        console.error(`[PGL_REMOTE_BACK] ❌ Agente reportou erro na execução:`, error);
        return item.res.status(500).json({ error });
    }

    console.log(`[PGL_REMOTE_BACK] ✅ Resposta enviada com sucesso ao Admin Web para requestId: ${requestId}`);
    return item.res.json(payload || { success: true });
});

module.exports = router;
