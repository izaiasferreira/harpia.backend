const express = require('express');
const router = express.Router();
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');

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
    
    // Registra o comando pendente
    const timeout = setTimeout(() => {
        if (pendingPglCommands.has(requestId)) {
            pendingPglCommands.delete(requestId);
            res.status(504).json({ error: 'Tempo limite excedido aguardando resposta do dispositivo do agente.' });
        }
    }, 15000);

    pendingPglCommands.set(requestId, {
        res,
        timeout,
        agentId,
        command: 'fetch_services',
        created: Date.now()
    });

    // Se o agente estiver conectado ou polling, os comandos pendentes sao consumidos em /agent/pgl-command
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

    const timeout = setTimeout(() => {
        if (pendingPglCommands.has(requestId)) {
            pendingPglCommands.delete(requestId);
            res.status(504).json({ error: 'Tempo limite excedido aguardando resposta do dispositivo do agente.' });
        }
    }, 20000);

    pendingPglCommands.set(requestId, {
        res,
        timeout,
        agentId,
        command: 'revert_service',
        orderId,
        created: Date.now()
    });
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

    res.json({ commands });
});

/**
 * Endpoint acionado pelo App Mobile do Agente para entregar a resposta do comando PGL executado no dispositivo.
 */
router.post('/agent-commands/respond', async (req, res) => {
    const { requestId, payload, error } = req.body;
    if (!requestId || !pendingPglCommands.has(requestId)) {
        return res.status(404).json({ error: 'Requisicao nao encontrada ou ja expirada' });
    }

    const item = pendingPglCommands.get(requestId);
    clearTimeout(item.timeout);
    pendingPglCommands.delete(requestId);

    if (error) {
        return item.res.status(500).json({ error });
    }

    return item.res.json(payload || { success: true });
});

module.exports = router;
