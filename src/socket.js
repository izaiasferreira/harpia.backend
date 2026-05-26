const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { get_or_create_support_room, save_chat_message, mark_messages_as_read } = require('./functions/database/chat');
const { cenos_pool } = require('./db');
const { getTokensByAgent } = require('./functions/database/fcmTokens');
const { sendToMultiple } = require('./functions/firebase');

// Guarda conexões ativas: Map<userId, socketId[]>
const activeConnections = new Map();

// Função para validar Telegram InitData
function verifyTelegramInitData(initData) {
    if (!initData) return false;
    try {
        const botToken = process.env.TELEGRAM_API_TOKEN;
        if (!botToken) return false;

        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        params.delete('hash');

        const keys = Array.from(params.keys()).sort();
        const dataCheckString = keys.map(key => `${key}=${params.get(key)}`).join('\n');

        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

        if (calculatedHash === hash) {
            const userString = params.get('user');
            if (userString) {
                const userObj = JSON.parse(userString);
                return { telegramId: userObj.id.toString() };
            }
        }
        return false;
    } catch (e) {
        console.error('[SOCKET AUTH] Erro ao validar Telegram InitData:', e.message);
        return false;
    }
}

// Configura o Socket.io e anexa ao Servidor HTTP
function initSocket(httpServer) {
    const io = new Server(httpServer, {
        cors: {
            origin: '*', // Permitir conexões de qualquer origem ou conforme as configurações CORS do Express
            methods: ['GET', 'POST']
        }
    });

    // Middleware de Handshake Seguro (Autenticação)
    io.use(async (socket, next) => {
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;
        const tgInitData = socket.handshake.auth?.tgInitData || socket.handshake.query?.tgInitData;
        const userRole = socket.handshake.auth?.role || socket.handshake.query?.role; // 'admin' ou 'agent'

        if (!token && !tgInitData) {
            return next(new Error('Autenticação requerida (Token/InitData ausentes)'));
        }

        try {
            // Caso seja Admin (sempre usa JWT)
            if (userRole === 'admin') {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                socket.user = {
                    id: decoded.email || decoded.id,
                    name: decoded.nome || decoded.email,
                    role: 'admin',
                    estado: decoded.estado
                };
                return next();
            }

            // Caso seja Agente pelo Telegram TMA ou Token Standalone/Dev
            if (tgInitData) {
                let telegramId;
                let agentId;

                if (tgInitData.includes('hash=')) {
                    // 1. Telegram TMA com cálculo de hash e bot token correto
                    const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_API_TOKEN;
                    if (botToken) {
                        try {
                            const params = new URLSearchParams(tgInitData);
                            const hash = params.get('hash');
                            params.delete('hash');

                            const keys = Array.from(params.keys()).sort();
                            const dataCheckString = keys.map(key => `${key}=${params.get(key)}`).join('\n');

                            const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
                            const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

                            if (calculatedHash === hash) {
                                const userString = params.get('user');
                                if (userString) {
                                    const userObj = JSON.parse(decodeURIComponent(userString));
                                    telegramId = userObj.id.toString();
                                }
                            }
                        } catch (e) {
                            console.error('[SOCKET AUTH] Erro ao validar hash Telegram:', e.message);
                        }
                    }
                } else {
                    // 2. Token Standalone ou DEV token em telegram_tokens
                    try {
                        const { rows } = await cenos_pool.query(
                            'SELECT telegram_user_id, agent_id FROM telegram_tokens WHERE token = $1 AND expires_at > CURRENT_TIMESTAMP',
                            [tgInitData]
                        );
                        if (rows.length > 0) {
                            telegramId = rows[0].telegram_user_id;
                            agentId = rows[0].agent_id;
                        }
                    } catch (e) {
                        console.error('[SOCKET AUTH] Erro ao buscar token na tabela telegram_tokens:', e.message);
                    }
                }

                // Se encontramos por agentId (login por PIN)
                if (agentId) {
                    const { rows } = await cenos_pool.query(
                        'SELECT id FROM login WHERE id = $1',
                        [agentId]
                    );
                    if (rows.length > 0) {
                        socket.user = {
                            id: rows[0].id.toUpperCase(),
                            name: rows[0].id,
                            role: 'agent'
                        };
                        return next();
                    }
                }

                // Se encontramos por telegramId
                if (telegramId) {
                    const telegramIdStr = String(telegramId).trim();
                    const { rows } = await cenos_pool.query(
                        'SELECT id FROM login WHERE telegram_id = $1',
                        [telegramIdStr]
                    );
                    if (rows.length > 0) {
                        socket.user = {
                            id: rows[0].id.toUpperCase(),
                            name: rows[0].id,
                            role: 'agent'
                        };
                        return next();
                    }
                }
            }

            // Fallback para JWT padrão de Agente (login nativo PIN)
            if (token) {
                try {
                    const decoded = jwt.verify(token, process.env.JWT_SECRET);
                    socket.user = {
                        id: decoded.id.toUpperCase(),
                        name: decoded.nome || decoded.id,
                        role: 'agent'
                    };
                    return next();
                } catch (e) {
                    // Se falhar, pode ser token inválido
                }
            }

            return next(new Error('Falha na autenticação do canal seguro.'));
        } catch (err) {
            console.error('[SOCKET AUTH] Erro no handshake do socket:', err.message);
            return next(new Error('Token expirado ou inválido.'));
        }
    });

    io.on('connection', (socket) => {
        const userId = socket.user.id;
        console.log(`[SOCKET] Conectado: ${userId} (${socket.user.role}) - ID: ${socket.id}`);

        // Mapeia conexão ativa
        if (!activeConnections.has(userId)) {
            activeConnections.set(userId, []);
        }
        activeConnections.get(userId).push(socket.id);

        // Informa status online ao se conectar (opcional, para futuras extensões)
        io.emit('user_online', { userId, status: 'online' });

        // Evento 1: Entrar em uma sala de chat
        socket.on('join_room', async ({ roomId }, callback) => {
            try {
                const rId = parseInt(roomId);

                // SEGURANÇA: Validar se o usuário tem permissão para entrar nessa sala
                const { rows: room } = await cenos_pool.query(
                    `SELECT * FROM chat_rooms WHERE id = $1`,
                    [rId]
                );

                if (room.length === 0) {
                    return callback?.({ error: 'Sala de chat não encontrada.' });
                }

                const targetRoom = room[0];

                if (socket.user.role === 'agent') {
                    // Agente só pode entrar na sua PRÓPRIA sala de suporte
                    if (targetRoom.agent_id?.toUpperCase() !== socket.user.id) {
                        console.warn(`[SOCKET SECURITY] Agente ${socket.user.id} tentou acessar sala de suporte do agente ${targetRoom.agent_id}`);
                        return callback?.({ error: 'Acesso negado a esta sala.' });
                    }
                }

                socket.join(`room_${rId}`);
                console.log(`[SOCKET] Usuário ${userId} entrou na sala room_${rId}`);
                
                // Marcar mensagens como lidas
                const senderToMark = socket.user.role === 'admin' ? 'agent' : 'admin';
                await mark_messages_as_read(rId, senderToMark);
                
                // Avisa outros usuários no quarto
                socket.to(`room_${rId}`).emit('user_read_messages', { roomId: rId, senderType: socket.user.role });

                callback?.({ success: true });
            } catch (err) {
                console.error('[SOCKET] Erro ao entrar na sala:', err.message);
                callback?.({ error: 'Erro interno do servidor.' });
            }
        });

        // Evento 2: Envio de mensagem
        socket.on('send_message', async (data, callback) => {
            const { roomId, message, message_type, file_url, file_name, latitude, longitude } = data;
            try {
                const rId = parseInt(roomId);

                // SEGURANÇA: Verificar se pertence à sala antes de enviar
                const { rows: room } = await cenos_pool.query(
                    `SELECT * FROM chat_rooms WHERE id = $1`,
                    [rId]
                );

                if (room.length === 0) {
                    return callback?.({ error: 'Sala não encontrada.' });
                }

                const targetRoom = room[0];

                if (socket.user.role === 'agent' && targetRoom.agent_id?.toUpperCase() !== socket.user.id) {
                    return callback?.({ error: 'Acesso negado para postagem.' });
                }

                // Persistir no banco de dados (IMUTÁVEL - sem rotas de delete)
                const savedMsg = await save_chat_message(
                    rId,
                    socket.user.id,
                    socket.user.role,
                    socket.user.name || socket.user.id || 'Colaborador',
                    message || null,
                    message_type || 'text',
                    file_url || null,
                    file_name || null,
                    latitude || null,
                    longitude || null
                );

                // Transmitir para todos no quarto (inclusive quem enviou)
                io.to(`room_${rId}`).emit('receive_message', savedMsg);

                // Notificar externamente (ex: se o outro lado não estiver no quarto, recebe um trigger global de badge)
                if (socket.user.role === 'agent') {
                    // Notifica todos os admins conectados sobre nova mensagem pendente
                    io.emit('admin_new_chat_message', { roomId: rId, agentId: socket.user.id, message: savedMsg });
                } else {
                    // Notifica o agente específico se ele estiver online em outra página
                    sendLiveNotification(targetRoom.agent_id, {
                        type: 'new_chat_message',
                        roomId: rId,
                        message: savedMsg
                    });

                    // Envia push notification via FCM para o agente (cobre app fechado/background)
                    sendChatPushNotification(targetRoom.agent_id, savedMsg, socket.user.name);
                }

                callback?.({ success: true, message: savedMsg });
            } catch (err) {
                console.error('[SOCKET] Erro ao salvar/enviar mensagem:', err.message);
                callback?.({ error: 'Erro interno ao processar mensagem.' });
            }
        });

        // Evento 3: Digitando / Gravando Áudio (Status de presença)
        socket.on('typing', ({ roomId, isTyping }) => {
            socket.to(`room_${roomId}`).emit('typing', { userId, isTyping });
        });

        socket.on('recording_audio', ({ roomId, isRecording }) => {
            socket.to(`room_${roomId}`).emit('recording_audio', { userId, isRecording });
        });

        // Desconexão
        socket.on('disconnect', () => {
            console.log(`[SOCKET] Desconectado: ${userId} - ID: ${socket.id}`);
            const userSockets = activeConnections.get(userId) || [];
            const index = userSockets.indexOf(socket.id);
            if (index !== -1) {
                userSockets.splice(index, 1);
            }
            if (userSockets.length === 0) {
                activeConnections.delete(userId);
                io.emit('user_online', { userId, status: 'offline' });
            } else {
                activeConnections.set(userId, userSockets);
            }
        });
    });

    // Função de envio de Notificações em Tempo Real (Base solicitada)
    global.sendLiveNotification = function(targetUserId, notificationPayload) {
        const uId = targetUserId?.toString().toUpperCase();
        const sockets = activeConnections.get(uId) || [];
        if (sockets.length > 0) {
            sockets.forEach(socketId => {
                io.to(socketId).emit('live_notification', notificationPayload);
            });
            console.log(`[SOCKET NOTIFICATION] Notificação enviada em tempo real para ${uId}:`, notificationPayload.type);
            return true;
        }
        console.log(`[SOCKET NOTIFICATION] Usuário ${uId} offline. Notificação descartada do WebSocket.`);
        return false;
    };
}

// Helper para envio de notificações a partir do backend de qualquer arquivo
function sendLiveNotification(targetUserId, notificationPayload) {
    if (global.sendLiveNotification) {
        return global.sendLiveNotification(targetUserId, notificationPayload);
    }
    return false;
}

// Envia push FCM para o agente sobre nova mensagem no chat
async function sendChatPushNotification(agentId, savedMsg, senderName) {
    try {
        const tokens = await getTokensByAgent(agentId);
        if (!tokens || tokens.length === 0) {
            console.log(`[SOCKET] Nenhum token FCM encontrado para o agente ${agentId}. Push não enviado.`);
            return;
        }

        let title = `Nova mensagem de ${senderName || 'Suporte'}`;
        let body = '';

        switch (savedMsg.message_type) {
            case 'text':
                body = savedMsg.message || 'Nova mensagem';
                break;
            case 'image':
                body = 'Enviou uma imagem';
                break;
            case 'video':
                body = 'Enviou um vídeo';
                break;
            case 'audio':
                body = 'Enviou uma gravação de voz';
                break;
            case 'document':
                body = `Enviou um documento: ${savedMsg.file_name || ''}`;
                break;
            case 'location':
                body = 'Compartilhou uma localização';
                break;
            default:
                body = 'Nova mensagem';
        }

        const result = await sendToMultiple(tokens, title, body, {
            critical: 'true',
            chat_message: 'true',
            roomId: String(savedMsg.room_id),
            messageId: String(savedMsg.id)
        });

        if (result && result.failureCount > 0) {
            console.warn(`[SOCKET] Push FCM: ${result.successCount} ok, ${result.failureCount} falhas para o agente ${agentId}`);
        }
    } catch (err) {
        console.error('[SOCKET] Erro ao enviar push FCM chat:', err.message);
    }
}

module.exports = {
    initSocket,
    sendLiveNotification
};
