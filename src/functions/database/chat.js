const { cenos_pool } = require('../../db');
const { chatMessageCreateSchema } = require('../../db/schemas');
const { getColaboradoresFilter, userIsAdmin, checkAgentPermission } = require('./admin');

async function get_or_create_support_room(agentId, agentName) {
    const formattedId = agentId?.toUpperCase();
    // Verifica se já existe
    const { rows: existing } = await cenos_pool.query(
        `SELECT * FROM chat_rooms WHERE agent_id = $1 AND type = 'suporte'`,
        [formattedId]
    );

    if (existing.length > 0) {
        return existing[0];
    }

    // Cria nova sala
    const { rows: created } = await cenos_pool.query(
        `INSERT INTO chat_rooms (agent_id, name, type) VALUES ($1, $2, 'suporte') RETURNING *`,
        [formattedId, `Suporte Técnico`]
    );
    return created[0];
}

async function get_rooms_for_agent(agentId) {
    const formattedId = agentId?.toUpperCase();
    
    // Pegar as salas do agente
    const { rows: rooms } = await cenos_pool.query(
        `SELECT * FROM chat_rooms WHERE agent_id = $1 ORDER BY created_at DESC`,
        [formattedId]
    );

    // Para cada sala, puxar a última mensagem e contar as não lidas enviadas pelo admin
    for (const room of rooms) {
        const { rows: lastMsg } = await cenos_pool.query(
            `SELECT * FROM chat_messages WHERE room_id = $1 ORDER BY created_at DESC LIMIT 1`,
            [room.id]
        );
        room.last_message = lastMsg[0] || null;

        const { rows: countUnread } = await cenos_pool.query(
            `SELECT COUNT(*)::integer as count FROM chat_messages WHERE room_id = $1 AND sender_type = 'admin' AND read = false`,
            [room.id]
        );
        room.unread_count = countUnread[0]?.count || 0;
    }

    return rooms;
}

async function get_rooms_for_admin(user) {
    // Carrega todos os agentes do cenos_pool com filtro de permissão
    const agentsMap = new Map();

    try {
        // Usa o filtro unificado de permissões
        const colabFilter = getColaboradoresFilter(user, { includeAllStates: true });

        let query = `SELECT "ID", "Nome", "regional", "seccional", estado FROM colaboradores`;
        let params = [];

        // Se não for admin, aplica filtro
        if (!userIsAdmin(user)) {
            if (colabFilter.whereClause) {
                // Adiciona as condições de filtro à query
                query += ` ${colabFilter.whereClause}`;
                params = colabFilter.params;
            } else if (colabFilter.allowedStates.length > 0) {
                // Se não tem whereClause mas tem estados permitidos
                query += ` WHERE estado = ANY($1)`;
                params = [colabFilter.allowedStates];
            }
        }

        const { rows } = await cenos_pool.query(query, params);

        // Aplica filtro em memória para regional, seccional e gestor (que não são fácilmente filtráveis no SQL)
        const filteredRows = rows.filter(r => {
            const agentData = {
                id: r.ID,
                nome: r.Nome,
                regional: r.regional,
                seccional: r.seccional,
                estado: r.estado
            };
            return checkAgentPermission(agentData, user);
        });

        filteredRows.forEach(r => {
            agentsMap.set(r.ID?.toUpperCase(), {
                id: r.ID?.toUpperCase(),
                nome: r.Nome,
                regional: r.regional || null,
                seccional: r.seccional || null,
                estado: r.estado
            });
        });
    } catch (e) {
        console.error('Erro ao buscar colaboradores para chat:', e.message);
    }

    // Carrega todas as salas de suporte existentes
    const { rows: rooms } = await cenos_pool.query(
        `SELECT * FROM chat_rooms WHERE type = 'suporte' ORDER BY id DESC`
    );

    const roomsByAgent = new Map();
    for (const room of rooms) {
        roomsByAgent.set(room.agent_id?.toUpperCase(), room);
    }

    const result = [];

    for (const [agentId, agentInfo] of agentsMap) {
        const room = roomsByAgent.get(agentId);

        const entry = {
            id: room?.id || null,
            agent_id: agentId,
            name: room?.name || 'Suporte Técnico',
            type: 'suporte',
            created_at: room?.created_at || null,
            agent_name: agentInfo.nome,
            agent_regional: agentInfo.regional,
            agent_seccional: agentInfo.seccional,
            agent_estado: agentInfo.estado,
            last_message: null,
            unread_count: 0
        };

        if (room) {
            const { rows: lastMsg } = await cenos_pool.query(
                `SELECT * FROM chat_messages WHERE room_id = $1 ORDER BY created_at DESC LIMIT 1`,
                [room.id]
            );
            entry.last_message = lastMsg[0] || null;

            const { rows: countUnread } = await cenos_pool.query(
                `SELECT COUNT(*)::integer as count FROM chat_messages WHERE room_id = $1 AND sender_type = 'agent' AND read = false`,
                [room.id]
            );
            entry.unread_count = countUnread[0]?.count || 0;
        }

        result.push(entry);
    }

    return result;
}

async function save_chat_message(roomId, senderId, senderType, senderName, message, messageType = 'text', fileUrl = null, fileName = null, latitude = null, longitude = null, channel = 'internal', metadata = null) {
    const validated = chatMessageCreateSchema.parse({
        room_id: Number(roomId),
        sender_id: senderId,
        sender_type: senderType,
        sender_name: senderName,
        message,
        message_type: messageType,
        file_url: fileUrl,
        file_name: fileName,
        latitude: latitude !== null && latitude !== undefined ? Number(latitude) : null,
        longitude: longitude !== null && longitude !== undefined ? Number(longitude) : null,
        channel,
        metadata
    });
    const query = `
        INSERT INTO chat_messages (room_id, sender_id, sender_type, sender_name, message, message_type, file_url, file_name, latitude, longitude, channel, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *;
    `;
    const values = [
        validated.room_id,
        validated.sender_id,
        validated.sender_type,
        validated.sender_name,
        validated.message,
        validated.message_type,
        validated.file_url,
        validated.file_name,
        validated.latitude,
        validated.longitude,
        validated.channel,
        validated.metadata ? (typeof validated.metadata === 'string' ? validated.metadata : JSON.stringify(validated.metadata)) : null
    ];
    const { rows } = await cenos_pool.query(query, values);
    return rows[0];
}

async function get_messages_for_room(roomId, limit = 100) {
    const { rows } = await cenos_pool.query(
        `SELECT * FROM chat_messages WHERE room_id = $1 ORDER BY created_at ASC LIMIT $2`,
        [roomId, limit]
    );
    return rows;
}

async function mark_messages_as_read(roomId, senderTypeToMark) {
    await cenos_pool.query(
        `UPDATE chat_messages SET read = true WHERE room_id = $1 AND sender_type = $2 AND read = false`,
        [roomId, senderTypeToMark]
    );
    return { success: true };
}

// Obter contagem de salas com mensagens não lidas para o menu principal do admin
async function get_admin_unread_rooms_count() {
    const { rows } = await cenos_pool.query(
        `SELECT COUNT(DISTINCT room_id)::integer as count FROM chat_messages WHERE sender_type = 'agent' AND read = false`
    );
    return rows[0]?.count || 0;
}

// ─── V2: Optimized with LATERAL JOIN (eliminates N+1) ─────────────────────

async function get_rooms_for_admin_v2(user) {
    const agentsMap = new Map();

    try {
        const colabFilter = getColaboradoresFilter(user, { includeAllStates: true });
        let query = `SELECT "ID", "Nome", "regional", "seccional", estado FROM colaboradores`;
        let params = [];

        if (!userIsAdmin(user)) {
            if (colabFilter.whereClause) {
                query += ` ${colabFilter.whereClause}`;
                params = colabFilter.params;
            } else if (colabFilter.allowedStates.length > 0) {
                query += ` WHERE estado = ANY($1)`;
                params = [colabFilter.allowedStates];
            }
        }

        const { rows } = await cenos_pool.query(query, params);

        const filteredRows = rows.filter(r => {
            const agentData = {
                id: r.ID, nome: r.Nome, regional: r.regional,
                seccional: r.seccional, estado: r.estado
            };
            return checkAgentPermission(agentData, user);
        });

        filteredRows.forEach(r => {
            agentsMap.set(r.ID?.toUpperCase(), {
                id: r.ID?.toUpperCase(), nome: r.Nome,
                regional: r.regional || null, seccional: r.seccional || null,
                estado: r.estado
            });
        });
    } catch (e) {
        console.error('Erro ao buscar colaboradores para chat v2:', e.message);
    }

    if (agentsMap.size === 0) return [];

    const agentIds = Array.from(agentsMap.keys());

    // Single query: rooms + last message + unread count via LATERAL joins
    const { rows: rooms } = await cenos_pool.query(
        `SELECT cr.id, cr.agent_id, cr.name, cr.type, cr.created_at,
                lm.id as last_message_id, lm.sender_id as last_sender_id,
                lm.sender_type as last_sender_type, lm.sender_name as last_sender_name,
                lm.message as last_message_text, lm.message_type as last_message_type,
                lm.file_url as last_file_url, lm.file_name as last_file_name,
                lm.latitude as last_latitude, lm.longitude as last_longitude,
                lm.read as last_read, lm.channel as last_channel,
                lm.metadata as last_metadata, lm.created_at as last_created_at,
                COALESCE(uc.unread_count, 0) as unread_count
         FROM chat_rooms cr
         LEFT JOIN LATERAL (
             SELECT * FROM chat_messages
             WHERE room_id = cr.id
             ORDER BY created_at DESC LIMIT 1
         ) lm ON true
         LEFT JOIN LATERAL (
             SELECT COUNT(*)::integer as unread_count
             FROM chat_messages
             WHERE room_id = cr.id AND sender_type = 'agent' AND read = false
         ) uc ON true
         WHERE cr.agent_id = ANY($1) AND cr.type = 'suporte'
         ORDER BY cr.id DESC`,
        [agentIds]
    );

    const roomsByAgent = new Map();
    for (const row of rooms) {
        roomsByAgent.set(row.agent_id?.toUpperCase(), row);
    }

    const result = [];
    for (const [agentId, agentInfo] of agentsMap) {
        const room = roomsByAgent.get(agentId);
        let lastMessage = null;
        if (room && room.last_message_id) {
            lastMessage = {
                id: room.last_message_id,
                room_id: room.id,
                sender_id: room.last_sender_id,
                sender_type: room.last_sender_type,
                sender_name: room.last_sender_name,
                message: room.last_message_text,
                message_type: room.last_message_type,
                file_url: room.last_file_url,
                file_name: room.last_file_name,
                latitude: room.last_latitude,
                longitude: room.last_longitude,
                read: room.last_read,
                channel: room.last_channel,
                metadata: room.last_metadata,
                created_at: room.last_created_at
            };
        }
        result.push({
            id: room?.id || null,
            agent_id: agentId,
            name: room?.name || 'Suporte Técnico',
            type: 'suporte',
            created_at: room?.created_at || null,
            agent_name: agentInfo.nome,
            agent_regional: agentInfo.regional,
            agent_seccional: agentInfo.seccional,
            agent_estado: agentInfo.estado,
            last_message: lastMessage,
            unread_count: room?.unread_count || 0
        });
    }

    return result;
}

// ─── V2: Cursor-based pagination for messages ─────────────────────────────

async function get_messages_for_room_cursor(roomId, cursor = null, limit = 30) {
    if (cursor) {
        const { rows } = await cenos_pool.query(
            `SELECT * FROM chat_messages 
             WHERE room_id = $1 AND id < $2
             ORDER BY id DESC 
             LIMIT $3`,
            [roomId, cursor, limit]
        );
        return { messages: rows.reverse(), has_more: rows.length === limit };
    }
    const { rows } = await cenos_pool.query(
        `SELECT * FROM chat_messages 
         WHERE room_id = $1
         ORDER BY id DESC 
         LIMIT $2`,
        [roomId, limit]
    );
    return { messages: rows.reverse(), has_more: rows.length === limit };
}

module.exports = {
    get_or_create_support_room,
    get_rooms_for_agent,
    get_rooms_for_admin,
    get_rooms_for_admin_v2,
    save_chat_message,
    get_messages_for_room,
    get_messages_for_room_cursor,
    mark_messages_as_read,
    get_admin_unread_rooms_count
};
