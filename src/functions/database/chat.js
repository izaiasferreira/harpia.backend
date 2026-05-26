const { cenos_pool, pi_pool, ma_pool } = require('../../db');

// Garantir que as tabelas de chat existam no PostgreSQL (cenos_pool)
async function initChatDatabase() {
    try {
        await cenos_pool.query(`
            CREATE TABLE IF NOT EXISTS chat_rooms (
                id SERIAL PRIMARY KEY,
                agent_id TEXT NOT NULL,
                name TEXT NOT NULL,
                type TEXT DEFAULT 'suporte',
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);

        await cenos_pool.query(`
            CREATE TABLE IF NOT EXISTS chat_messages (
                id SERIAL PRIMARY KEY,
                room_id INTEGER NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
                sender_id TEXT NOT NULL,
                sender_type TEXT NOT NULL,
                sender_name TEXT NOT NULL,
                message TEXT,
                message_type TEXT NOT NULL DEFAULT 'text',
                file_url TEXT,
                file_name TEXT,
                latitude NUMERIC,
                longitude NUMERIC,
                read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log('[DATABASE] Tabelas de chat verificadas/criadas com sucesso.');
    } catch (e) {
        console.error('[DATABASE] Erro ao inicializar tabelas de chat:', e.message);
    }
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
    // Pega todas as salas de suporte
    const { rows: rooms } = await cenos_pool.query(
        `SELECT * FROM chat_rooms WHERE type = 'suporte' ORDER BY id DESC`
    );

    // Para cada sala de suporte, precisamos acoplar os dados do agente
    // Os dados do agente estão no pi_pool ou ma_pool. Vamos ler de ambos.
    const agentsMap = new Map();

    const fetchAgents = async (pool, state) => {
        try {
            const { rows } = await pool.query(`SELECT "ID", "Nome", "regional", "seccional" FROM colaboradores`);
            rows.forEach(r => {
                agentsMap.set(r.ID?.toUpperCase(), {
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

    const enrichedRooms = [];

    for (const room of rooms) {
        const agentInfo = agentsMap.get(room.agent_id?.toUpperCase());
        if (!agentInfo) continue; // Pula se o agente foi deletado do cadastro principal

        const enrichedRoom = {
            ...room,
            agent_name: agentInfo.nome,
            agent_regional: agentInfo.regional,
            agent_seccional: agentInfo.seccional,
            agent_estado: agentInfo.estado
        };

        // Adiciona última mensagem
        const { rows: lastMsg } = await cenos_pool.query(
            `SELECT * FROM chat_messages WHERE room_id = $1 ORDER BY created_at DESC LIMIT 1`,
            [room.id]
        );
        enrichedRoom.last_message = lastMsg[0] || null;

        // Conta não lidas enviadas pelo agente
        const { rows: countUnread } = await cenos_pool.query(
            `SELECT COUNT(*)::integer as count FROM chat_messages WHERE room_id = $1 AND sender_type = 'agent' AND read = false`,
            [room.id]
        );
        enrichedRoom.unread_count = countUnread[0]?.count || 0;

        enrichedRooms.push(enrichedRoom);
    }

    return enrichedRooms;
}

async function save_chat_message(roomId, senderId, senderType, senderName, message, messageType = 'text', fileUrl = null, fileName = null, latitude = null, longitude = null) {
    const query = `
        INSERT INTO chat_messages (room_id, sender_id, sender_type, sender_name, message, message_type, file_url, file_name, latitude, longitude)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *;
    `;
    const values = [roomId, senderId, senderType, senderName, message, messageType, fileUrl, fileName, latitude, longitude];
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
