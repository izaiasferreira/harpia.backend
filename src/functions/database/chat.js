const { cenos_pool, pi_pool, ma_pool } = require('../../db');
const { chatMessageCreateSchema } = require('../../db/schemas');

// Garantir que as tabelas de chat existam no PostgreSQL (cenos_pool)
async function initChatDatabase() {
    // Tabelas de chat criadas via migration central
}

// Executa na importação
initChatDatabase();

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

async function get_rooms_for_admin() {
    // Carrega todos os agentes de ambos os pools
    const agentsMap = new Map();

    const fetchAgents = async (pool, state) => {
        try {
            const { rows } = await pool.query(`SELECT "ID", "Nome", "regional", "seccional" FROM colaboradores`);
            rows.forEach(r => {
                agentsMap.set(r.ID?.toUpperCase(), {
                    id: r.ID?.toUpperCase(),
                    nome: r.Nome,
                    regional: r.regional || null,
                    seccional: r.seccional || null,
                    estado: state
                });
            });
        } catch (e) {
            console.error(`Erro ao buscar colaboradores para chat no estado ${state}:`, e.message);
        }
    };

    await fetchAgents(pi_pool, 'pi');
    await fetchAgents(ma_pool, 'ma');

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

module.exports = {
    get_or_create_support_room,
    get_rooms_for_agent,
    get_rooms_for_admin,
    save_chat_message,
    get_messages_for_room,
    mark_messages_as_read,
    get_admin_unread_rooms_count
};
