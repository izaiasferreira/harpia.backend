const axios = require('axios');
const { pi_pool, ma_pool, localizacoes_pi_pool, cenos_pool } = require('../../db');
const { today } = require('../../utils/dates');


const userIsAdmin = (user) => {
    if (!user || !user.role) return false;
    return user.role.toLowerCase().includes('admin');
}


const setor = {
    "NEG": 'NEGOCIAÇÃO',
    "LEI": 'LEITURA',
    "COB": 'COBRANÇA'
}
const veiculo = {
    "MOT": 'AGENTE COMERCIAL MOTOCICLISTA',
    "PE": 'AGENTE COMERCIAL A PÉ',
    "PÉ": 'AGENTE COMERCIAL A PÉ'
}

const getUserAllowedStatePools = (user) => {
    if (!user) return [];

    const isMainAdmin = userIsAdmin(user);
    const userFilters = user?.permissions?.map(p => p.filters).flat() || [];
    const statesFilters = userFilters.filter(f => f.type === 'estado').map(f => f.value.toLowerCase());

    const available = [];
    if (isMainAdmin || statesFilters.includes('pi')) available.push({ state: 'pi', pool: pi_pool });
    if (isMainAdmin || statesFilters.includes('ma')) available.push({ state: 'ma', pool: ma_pool });
    return available;
};

const getFilterUser = (user) => {
    const userFilters = user?.permissions?.map(p => p.filters).flat() || [];
    const othersFilters = userFilters.filter(f => f.type !== 'estado')
    return othersFilters.length > 0 ? othersFilters[0] : null;
}

async function get_users_agents_admin_paginated({ user, ids = [], page = 1, limit = 50, search, regional, seccional, gestor, estado }) {
    const availablePools = getUserAllowedStatePools(user);
    const filterUser = getFilterUser(user);

    let targetPools = availablePools;
    if (estado) {
        targetPools = availablePools.filter(p => p.state === estado.toLowerCase());
    }

    // Busca IDs no login (cenos_pool) se houver busca por texto
    let searchIdsFromLogin = [];
    if (search) {
        const { rows: loginMatches } = await cenos_pool.query(
            `SELECT id FROM login WHERE id ILIKE $1`,
            [`%${search}%`]
        );
        searchIdsFromLogin = loginMatches.map(l => l.id.toUpperCase());
    }

    // Busca quais agentes têm inventário cadastrado
    let inventoryAgentsSet = new Set();
    try {
        const { rows: inventoryAgents } = await cenos_pool.query(`SELECT DISTINCT agente FROM inventory`);
        inventoryAgents.forEach(i => {
            if (i.agente) inventoryAgentsSet.add(i.agente.toString().toUpperCase());
        });
    } catch (e) {
        console.error('Erro ao buscar inventários ativos:', e.message);
    }

    // Busca contagem de mensagens de chat não lidas enviadas pelos agentes
    let unreadChatsSet = new Map();
    try {
        const { rows: unreadCounts } = await cenos_pool.query(`
            SELECT r.agent_id, COUNT(m.id)::integer as count 
            FROM chat_messages m 
            JOIN chat_rooms r ON m.room_id = r.id 
            WHERE m.sender_type = 'agent' AND m.read = false 
            GROUP BY r.agent_id
        `);
        unreadCounts.forEach(c => {
            if (c.agent_id) unreadChatsSet.set(c.agent_id.toString().toUpperCase(), c.count);
        });
    } catch (e) {
        console.error('Erro ao buscar chats não lidos:', e.message);
    }

    const allowedStates = targetPools.map(p => p.state);

    // Busca total (COUNT único em cenos_pool)
    let countQuery = `SELECT COUNT(*) as total FROM colaboradores WHERE estado = ANY($1)`;
    const countParams = [allowedStates];
    let paramIdx = 2;

    if (search) {
        const conditions = [`"Nome" ILIKE $2`, `"ID" ILIKE $2`];
        countParams.push(`%${search}%`);
        paramIdx++;
        if (searchIdsFromLogin.length > 0) {
            conditions.push(`"ID" = ANY($${paramIdx})`);
            countParams.push(searchIdsFromLogin);
            paramIdx++;
        }
        countQuery += ` AND (${conditions.join(' OR ')})`;
    }
    if (ids && ids.length > 0) {
        countQuery += ` AND "ID" = ANY($${paramIdx})`;
        countParams.push(ids.map(id => id.toUpperCase()));
        paramIdx++;
    }
    if (regional) {
        countQuery += ` AND "regional" ILIKE $${paramIdx}`;
        countParams.push(`%${regional}%`);
        paramIdx++;
    }
    if (seccional) {
        countQuery += ` AND "seccional" ILIKE $${paramIdx}`;
        countParams.push(`%${seccional}%`);
        paramIdx++;
    }
    if (gestor) {
        countQuery += ` AND "GESTOR IMEDIATO" ILIKE $${paramIdx}`;
        countParams.push(`%${gestor}%`);
        paramIdx++;
    }

    const { rows: countRows } = await cenos_pool.query(countQuery, countParams);
    const grandTotal = parseInt(countRows[0]?.total || 0);

    // Busca dados paginados (query única em cenos_pool)
    const limitVal = parseInt(limit) || 50;
    const offsetVal = (parseInt(page) - 1) * limitVal;

    let colabQuery = `SELECT * FROM colaboradores WHERE estado = ANY($1)`;
    const colabParams = [allowedStates];
    let cpIdx = 2;

    if (search) {
        const conditions = [`"Nome" ILIKE $2`, `"ID" ILIKE $2`];
        colabParams.push(`%${search}%`);
        cpIdx++;
        if (searchIdsFromLogin.length > 0) {
            conditions.push(`"ID" = ANY($${cpIdx})`);
            colabParams.push(searchIdsFromLogin);
            cpIdx++;
        }
        colabQuery += ` AND (${conditions.join(' OR ')})`;
    }
    if (ids && ids.length > 0) {
        colabQuery += ` AND "ID" = ANY($${cpIdx})`;
        colabParams.push(ids.map(id => id.toUpperCase()));
        cpIdx++;
    }
    if (regional) {
        colabQuery += ` AND "regional" ILIKE $${cpIdx}`;
        colabParams.push(`%${regional}%`);
        cpIdx++;
    }
    if (seccional) {
        colabQuery += ` AND "seccional" ILIKE $${cpIdx}`;
        colabParams.push(`%${seccional}%`);
        cpIdx++;
    }
    if (gestor) {
        colabQuery += ` AND "GESTOR IMEDIATO" ILIKE $${cpIdx}`;
        colabParams.push(`%${gestor}%`);
        cpIdx++;
    }

    colabQuery += ` ORDER BY "Nome" ASC LIMIT $${cpIdx} OFFSET $${cpIdx + 1}`;
    colabParams.push(limitVal, offsetVal);

    const { rows } = await cenos_pool.query(colabQuery, colabParams);

    const result = rows.map(r => {
        const mapped = {
            ...r,
            gestor: r['GESTOR IMEDIATO'],
            matricula: `${parseInt(r['MAT'])}`,
            nome: r['Nome'],
            id: (r['ID']).toUpperCase(),
            estado: r['estado']
        };

        delete mapped['GESTOR IMEDIATO'];
        delete mapped['MAT'];
        delete mapped['Nome'];
        delete mapped['ID'];

        let cargo = r?.Cargo;
        let setor_key = Object.keys(setor).find(k => cargo?.includes(k));
        
        mapped['setor'] = r?.processo;
        mapped['cargo'] = r?.Cargo;
        delete mapped['Cargo'];

        return mapped;
    });

    // Enriquecimento com login data
    if (result.length > 0) {
        const { rows: loginData } = await cenos_pool.query(
            `SELECT * FROM login WHERE id IN (${result.map((_, i) => `$${i + 1}`).join(',')})`,
            result.map(r => r.id)
        );

        result.forEach(r => {
            const login = loginData.find(l => l.id === r.id);
            r.telegram_id = login?.telegram_id || null;
            r.seccional = r.seccional || null;
            r.regional = r.regional || null;
            r.has_inventory = inventoryAgentsSet.has(r.id);
            r.unread_chat_count = unreadChatsSet.get(r.id) || 0;
        });
    }

    let filteredResult = result;

    if (filterUser && !userIsAdmin(user)) {
        filteredResult = filteredResult.filter(r => {
            return r[filterUser.type] === filterUser.value;
        });
    }

    return {
        data: filteredResult,
        total: grandTotal,
        page: parseInt(page),
        limit: limitVal
    };
}

async function get_users_agents_admin({ user, ids = [], page = 1, limit = 9999, search, regional, seccional, gestor, estado }) {
    const res = await get_users_agents_admin_paginated({ user, ids, page, limit, search, regional, seccional, gestor, estado });
    return res.data;
}

async function get_users_only_login_paginated({ user, page = 1, limit = 50, search, estado }) {
    const availablePools = getUserAllowedStatePools(user);
    let targetPools = availablePools;
    if (estado) {
        targetPools = availablePools.filter(p => p.state === estado.toLowerCase());
    }
    const allowedStates = targetPools.map(p => p.state);

    let inventoryAgentsSet = new Set();
    try {
        const { rows: inventoryAgents } = await cenos_pool.query(`SELECT DISTINCT agente FROM inventory`);
        inventoryAgents.forEach(i => {
            if (i.agente) inventoryAgentsSet.add(i.agente.toString().toUpperCase());
        });
    } catch (e) {}

    let unreadChatsSet = new Map();
    try {
        const { rows: unreadCounts } = await cenos_pool.query(`
            SELECT r.agent_id, COUNT(m.id)::integer as count 
            FROM chat_messages m 
            JOIN chat_rooms r ON m.room_id = r.id 
            WHERE m.sender_type = 'agent' AND m.read = false 
            GROUP BY r.agent_id
        `);
        unreadCounts.forEach(c => {
            if (c.agent_id) unreadChatsSet.set(c.agent_id.toString().toUpperCase(), c.count);
        });
    } catch (e) {}

    let whereConditions = [
        `NOT EXISTS (SELECT 1 FROM colaboradores c WHERE TRIM(UPPER(c."ID")) = TRIM(UPPER(l.id)))`,
        `(l.estado IS NULL OR LOWER(l.estado) = ANY($1))`
    ];
    let queryParams = [allowedStates];
    let paramIdx = 2;

    if (search) {
        whereConditions.push(`l.id ILIKE $${paramIdx}`);
        queryParams.push(`%${search}%`);
        paramIdx++;
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    const countQuery = `SELECT COUNT(*) as total FROM login l ${whereClause}`;
    const { rows: countRows } = await cenos_pool.query(countQuery, queryParams);
    const grandTotal = parseInt(countRows[0]?.total || 0);

    const limitVal = parseInt(limit) || 50;
    const offsetVal = (parseInt(page) - 1) * limitVal;

    const dataQuery = `
        SELECT l.* 
        FROM login l 
        ${whereClause} 
        ORDER BY l.id ASC 
        LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `;
    queryParams.push(limitVal, offsetVal);

    const { rows } = await cenos_pool.query(dataQuery, queryParams);

    const data = rows.map(r => ({
        id: (r.id || '').toUpperCase(),
        nome: 'NÃO CADASTRADO',
        estado: r.estado || 'pi',
        status: true,
        situacao: 'active',
        regional: '-',
        seccional: '-',
        setor: '-',
        gestor: '-',
        cargo: 'Apenas Login',
        telegram_id: r.telegram_id || null,
        last_heartbeat_at: r.last_heartbeat_at || null,
        has_inventory: inventoryAgentsSet.has((r.id || '').toUpperCase()),
        unread_chat_count: unreadChatsSet.get((r.id || '').toUpperCase()) || 0,
        only_login: true
    }));

    return {
        data,
        total: grandTotal,
        page: parseInt(page),
        limit: limitVal
    };
}

async function get_user_agent_options({ estado }) {
    let result = {
        gestores: [],
        cargos: [],
        regionais: [],
        seccionais: [],
        processos: [],
        estados: []
    };

    const queryCond = estado ? `AND estado = $1` : ``;
    const queryParams = estado ? [estado] : [];

    const query = `SELECT DISTINCT "GESTOR IMEDIATO" FROM colaboradores WHERE "GESTOR IMEDIATO" IS NOT NULL ${queryCond}`;
    const { rows } = await cenos_pool.query(query, queryParams);
    result.gestores = rows.map(r => r['GESTOR IMEDIATO']);

    const query2 = `SELECT DISTINCT uac FROM localidades WHERE uac IS NOT NULL`;
    if (estado) {
        const { rows: rows2 } = await (estado === 'pi' ? pi_pool.query(query2) : ma_pool.query(query2));
        result.seccionais = rows2.map(r => r['uac']);
    } else {
        const [resPi, resMa] = await Promise.all([pi_pool.query(query2), ma_pool.query(query2)]);
        result.seccionais = [...new Set([...resPi.rows.map(r => r.uac), ...resMa.rows.map(r => r.uac)])];
    }

    const query3 = `SELECT DISTINCT regional FROM localidades WHERE regional IS NOT NULL`;
    if (estado) {
        const { rows: rows3 } = await (estado === 'pi' ? pi_pool.query(query3) : ma_pool.query(query3));
        result.regionais = rows3.map(r => r['regional']);
    } else {
        const [resPi, resMa] = await Promise.all([pi_pool.query(query3), ma_pool.query(query3)]);
        result.regionais = [...new Set([...resPi.rows.map(r => r.regional), ...resMa.rows.map(r => r.regional)])];
    }

    const query4 = `SELECT DISTINCT "Cargo" FROM colaboradores WHERE "Cargo" IS NOT NULL ${queryCond}`;
    const { rows: rows4 } = await cenos_pool.query(query4, queryParams);
    result.cargos = rows4.map(r => r['Cargo']);

    const query5 = `SELECT DISTINCT "processo" FROM colaboradores WHERE "processo" IS NOT NULL ${queryCond}`;
    const { rows: rows5 } = await cenos_pool.query(query5, queryParams);
    result.processos = rows5.map(r => r['processo']);

    const query6 = `SELECT DISTINCT estado FROM colaboradores WHERE estado IS NOT NULL ORDER BY estado`;
    const { rows: rows6 } = await cenos_pool.query(query6);
    result.estados = rows6.map(r => r.estado);

    return result;
}

async function create_user_agent_admin({ id, matricula, nome, estado: inputEstado, gestor, cargo, user, seccional, regional, status = true, situacao = 'active', processo }) {
    const allowedPools = getUserAllowedStatePools(user);
    const target = allowedPools.find(p => p.state === inputEstado.toLowerCase());

    if (!target) {
        return { error: `Você não tem permissão para cadastrar agentes no estado ${inputEstado.toUpperCase()}` };
    }

    const query = `
        INSERT INTO colaboradores ("ID", "MAT", "Nome", "GESTOR IMEDIATO", "Cargo", "seccional", "regional", "estado", "status", "situacao", "processo")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `;
    const params = [
        id?.toUpperCase(),
        matricula,
        nome,
        gestor,
        cargo,
        seccional,
        regional,
        inputEstado.toLowerCase(),
        status !== undefined ? status : true,
        situacao !== undefined ? situacao : 'active',
        processo
    ];

    try {
        await cenos_pool.query(query, params);
        await cenos_pool.query(
            `INSERT INTO login (id, estado) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET estado = EXCLUDED.estado`,
            [id?.toUpperCase(), inputEstado.toLowerCase()]
        );
        const result = await get_users_agents_admin({ user, ids: [id], estado: inputEstado });
        return result[0];
    } catch (err) {
        console.error('Erro ao criar usuário:', err.message);
        throw err;
    }
}

async function send_message_to_agent({ id, agent: providedAgent, text, file, webAppButtonText, webAppButtonUrl, options, user }) {
    let agent = providedAgent;
    if (!agent) {
        const userData = await get_users_agents_admin({ user, ids: [id] });
        if (!userData.length) return { error: 'Usuário não encontrado' };
        agent = userData[0];
    }
    const allowedPools = getUserAllowedStatePools(user);
    if (!allowedPools.find(p => p.state === agent.estado.toLowerCase())) {
        return { error: `Você não tem permissão para enviar mensagens para agentes do estado ${agent.estado.toUpperCase()}` };
    }

    let payload;
    let contentType = 'application/json';
    let result = { message: 'Mensagem salva no sistema (agente sem Telegram vinculado)' };

    if (agent.telegram_id) {
        // Se o arquivo for um objeto vindo do Multer (buffer), usamos FormData
        if (file && typeof file === 'object' && file.buffer) {
            const formData = new FormData();
            formData.append('chatId', agent.telegram_id);
            if (text) formData.append('text', text);
            if (webAppButtonText) formData.append('webAppButtonText', webAppButtonText);
            if (webAppButtonUrl) formData.append('webAppButtonUrl', webAppButtonUrl);
            if (options) formData.append('options', typeof options === 'string' ? options : JSON.stringify(options));

            let mediaType = 'document';
            const mimetype = file.mimetype || '';
            if (mimetype.startsWith('image/')) mediaType = 'image';
            else if (mimetype.startsWith('video/')) mediaType = 'video';
            else if (mimetype.startsWith('audio/')) mediaType = 'audio';

            formData.append('mediaType', mediaType);
            formData.append('media', new Blob([file.buffer]), file.originalname);

            payload = formData;
            contentType = undefined; // Deixa o axios definir o boundary
        } else {
            // Envio via JSON (Texto e/ou mídias por URL)
            payload = {
                chatId: agent.telegram_id,
                text,
                webAppButtonText,
                webAppButtonUrl,
                options
            };

            if (file && typeof file === 'string' && file.startsWith('http')) {
                const ext = file.split('.').pop().toLowerCase();
                if (['jpg', 'jpeg', 'png'].includes(ext)) {
                    payload.photo = file;
                } else if (['mp4', 'mov', 'avi'].includes(ext)) {
                    payload.video = file;
                } else {
                    payload.document = file;
                }
            }
        }

        try {
            const headers = {
                'Authorization': `Bearer ${process.env.TELEGRAM_API_TOKEN}`
            };
            if (contentType) headers['Content-Type'] = contentType;

            const response = await axios.post(`${process.env.TELEGRAM_API_URL}/sendMessage`, payload, { headers });
            result = { message: 'Mensagem enviada com sucesso', telegramResponse: response.data };
        } catch (error) {
            console.error('Erro ao enviar mensagem via Telegram:', error.response?.data || error.message);
            result = { error: 'Falha ao enviar mensagem via Telegram API', details: error.response?.data || error.message };
        }
    }

    // Gravar log no banco cenos_pool
    try {
        await cenos_pool.query(`
            CREATE TABLE IF NOT EXISTS sent_messages_admin (
                id SERIAL PRIMARY KEY,
                agente_id TEXT,
                operador_id TEXT,
                texto TEXT,
                arquivo TEXT,
                sucesso BOOLEAN,
                resposta JSONB,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        const insertQuery = `
            INSERT INTO sent_messages_admin (agente_id, operador_id, texto, arquivo, sucesso, resposta)
            VALUES ($1, $2, $3, $4, $5, $6)
        `;
        const logParams = [
            agent.id?.toUpperCase(),
            user.matricula || user.id || 'ADMIN',
            text || null,
            typeof file === 'string' ? file : (file?.originalname || null),
            !result.error,
            JSON.stringify(result.telegramResponse || result.details || result)
        ];
        await cenos_pool.query(insertQuery, logParams);
    } catch (logError) {
        console.error('Erro ao gravar log de mensagem:', logError.message);
    }

    return result;
}

async function send_telegram_to_agent_by_id(agentId, text, webAppButtonText, webAppButtonUrl) {
    // telegram_id fica na tabela login (cenos_pool)
    const { rows: loginRows } = await cenos_pool.query(
        `SELECT telegram_id FROM login WHERE id = $1 AND telegram_id IS NOT NULL`,
        [agentId.toUpperCase()]
    );
    if (!loginRows.length) return { error: 'Agente não encontrado ou sem Telegram ID vinculado' };
    const telegramId = loginRows[0].telegram_id;

    const payload = { chatId: telegramId, text };
    if (webAppButtonText && webAppButtonUrl) {
        payload.webAppButtonText = webAppButtonText;
        payload.webAppButtonUrl = webAppButtonUrl;
    }
    try {
        const headers = { 'Authorization': `Bearer ${process.env.TELEGRAM_API_TOKEN}` };
        const response = await axios.post(`${process.env.TELEGRAM_API_URL}/sendMessage`, payload, { headers });
        return { message: 'Mensagem enviada com sucesso', telegramResponse: response.data };
    } catch (error) {
        console.error('Erro ao enviar mensagem via Telegram (public):', error.response?.data || error.message);
        return { error: 'Falha ao enviar mensagem via Telegram API', details: error.response?.data || error.message };
    }
}

async function send_bulk_message_to_agents({ ids, text, file, webAppButtonText, webAppButtonUrl, options, user }) {
    if (!Array.isArray(ids)) throw new Error('O campo ids deve ser um array');

    const agents = await get_users_agents_admin({ user, ids });
    const results = [];

    for (const id of ids) {
        const agent = agents.find(a => a.id.toUpperCase() === id.toUpperCase());
        if (!agent) {
            results.push({ id, error: 'Usuário não encontrado ou sem permissão' });
            continue;
        }

        const res = await send_message_to_agent({ 
            agent, 
            text, 
            file, 
            webAppButtonText, 
            webAppButtonUrl, 
            options, 
            user 
        });
        results.push({ id, ...res });
    }

    return results;
}

async function delete_user_agent_admin({ id, user, deleteLogin = false }) {
    let agentState = null;
    const userData = await get_users_agents_admin({ user, ids: [id] });
    if (userData.length) {
        agentState = userData[0].estado;
    } else {
        const { rows: loginRows } = await cenos_pool.query(`SELECT estado FROM login WHERE UPPER(id) = $1`, [id?.toUpperCase()]);
        if (!loginRows.length) return { error: 'Usuário não encontrado' };
        agentState = loginRows[0].estado || 'pi';
        deleteLogin = true;
    }

    const allowedPools = getUserAllowedStatePools(user);
    const target = allowedPools.find(p => p.state === (agentState || '').toLowerCase());

    if (!target) {
        return { error: `Você não tem permissão para deletar agentes no estado ${(agentState || '').toUpperCase()}` };
    }

    try {
        await cenos_pool.query(`DELETE FROM colaboradores WHERE "ID" = $1`, [id?.toUpperCase()]);

        if (deleteLogin) {
            await cenos_pool.query(`DELETE FROM login WHERE UPPER(id) = $1`, [id?.toUpperCase()]);
        }

        return { message: 'Usuário deletado com sucesso' };
    } catch (err) {
        console.error('Erro ao deletar usuário:', err.message);
        throw err;
    }
}

async function update_user_agent_admin({ id, nome, gestor, cargo, seccional, regional, estado, status, situacao, processo, user }) {
    const userData = await get_users_agents_admin({ user, ids: [id] });
    if (!userData.length) return { error: 'Usuário não encontrado' };

    const agent = userData[0];
    const allowedPools = getUserAllowedStatePools(user);
    const target = allowedPools.find(p => p.state === agent.estado.toLowerCase());

    if (!target) {
        return { error: `Você não tem permissão para atualizar agentes no estado ${agent.estado.toUpperCase()}` };
    }

    const query = `
        UPDATE colaboradores 
        SET "Nome" = $1, "GESTOR IMEDIATO" = $2, "Cargo" = $3, "seccional" = $4, "regional" = $5,
            "estado" = COALESCE($6, "estado"), "status" = COALESCE($7, "status"), "situacao" = COALESCE($8, "situacao"), "processo" = COALESCE($10, "processo")
        WHERE "ID" = $9
    `;
    const params = [
        nome,
        gestor,
        cargo,
        seccional,
        regional,
        estado !== undefined ? estado.toLowerCase() : null,
        status !== undefined ? status : null,
        situacao !== undefined ? situacao : null,
        id?.toUpperCase(),
        processo !== undefined ? processo : null
    ];

    try {
        await cenos_pool.query(query, params);
        await cenos_pool.query(
            `INSERT INTO login (id, estado) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET estado = EXCLUDED.estado`,
            [id?.toUpperCase(), estado !== undefined ? estado.toLowerCase() : agent.estado.toLowerCase()]
        );
        const result = await get_users_agents_admin({ user, ids: [id], estado: estado || agent.estado });
        return result[0];
    } catch (err) {
        console.error('Erro ao atualizar usuário:', err.message);
        throw err;
    }
}

async function bulk_update_user_agents_admin({ ids, data, user }) {
    if (!Array.isArray(ids) || !ids.length) return { error: 'Nenhum ID selecionado' };
    
    const allowedStates = getUserAllowedStatePools(user).map(p => p.state);
    let updatedCount = 0;
    
    for (const rawId of ids) {
        const id = rawId?.toUpperCase();
        if (!id) continue;
        
        const { rows: colabRows } = await cenos_pool.query(`SELECT estado FROM colaboradores WHERE "ID" = $1`, [id]);
        let estado = null;
        let existsInColab = colabRows.length > 0;
        
        if (existsInColab) {
            estado = colabRows[0].estado;
        } else {
            const { rows: loginRows } = await cenos_pool.query(`SELECT estado FROM login WHERE UPPER(id) = $1`, [id]);
            if (!loginRows.length) continue;
            estado = loginRows[0].estado || 'pi';
        }
        
        if (!allowedStates.includes((estado || '').toLowerCase())) continue;
        
        const targetEstado = data.estado !== undefined && data.estado !== '' ? data.estado.toLowerCase() : (estado || 'pi').toLowerCase();
        if (!allowedStates.includes(targetEstado)) continue;
        
        if (existsInColab) {
            let setClauses = [];
            let params = [];
            let idx = 1;
            
            const fieldMap = {
                nome: '"Nome"',
                gestor: '"GESTOR IMEDIATO"',
                cargo: '"Cargo"',
                seccional: '"seccional"',
                regional: '"regional"',
                estado: '"estado"',
                status: '"status"',
                situacao: '"situacao"',
                processo: '"processo"'
            };
            
            for (const [key, col] of Object.entries(fieldMap)) {
                if (data[key] !== undefined && data[key] !== '') {
                    setClauses.push(`${col} = $${idx++}`);
                    params.push(key === 'estado' ? data[key].toLowerCase() : (key === 'status' ? (data[key] === 'true' || data[key] === true) : data[key]));
                }
            }
            
            if (setClauses.length > 0) {
                params.push(id);
                await cenos_pool.query(`UPDATE colaboradores SET ${setClauses.join(', ')} WHERE "ID" = $${idx}`, params);
                if (data.estado) {
                    await cenos_pool.query(`UPDATE login SET estado = $1 WHERE UPPER(id) = $2`, [targetEstado, id]);
                }
                updatedCount++;
            }
        } else {
            const insertQuery = `
                INSERT INTO colaboradores ("ID", "MAT", "Nome", "GESTOR IMEDIATO", "Cargo", "seccional", "regional", "estado", "status", "situacao", "processo")
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                ON CONFLICT ("ID") DO UPDATE SET
                    "GESTOR IMEDIATO" = COALESCE(EXCLUDED."GESTOR IMEDIATO", colaboradores."GESTOR IMEDIATO"),
                    "regional" = COALESCE(EXCLUDED."regional", colaboradores."regional"),
                    "seccional" = COALESCE(EXCLUDED."seccional", colaboradores."seccional"),
                    "Cargo" = COALESCE(EXCLUDED."Cargo", colaboradores."Cargo"),
                    "estado" = COALESCE(EXCLUDED."estado", colaboradores."estado"),
                    "processo" = COALESCE(EXCLUDED."processo", colaboradores."processo")
            `;
            const params = [
                id,
                data.matricula || null,
                data.nome || id,
                data.gestor || null,
                data.cargo || null,
                data.seccional || null,
                data.regional || null,
                targetEstado,
                data.status !== undefined && data.status !== '' ? (data.status === 'true' || data.status === true) : true,
                data.situacao || 'active',
                data.processo || null
            ];
            await cenos_pool.query(insertQuery, params);
            await cenos_pool.query(`UPDATE login SET estado = $1 WHERE UPPER(id) = $2`, [targetEstado, id]);
            updatedCount++;
        }
    }
    
    return { message: `${updatedCount} agente(s) atualizado(s) com sucesso.` };
}

async function bulk_delete_user_agents_admin({ ids, deleteLogin = false, user }) {
    if (!userIsAdmin(user)) {
        return { error: 'Somente administradores do sistema podem realizar exclusão em massa.' };
    }
    if (!Array.isArray(ids) || !ids.length) return { error: 'Nenhum ID selecionado' };
    
    let deletedCount = 0;
    for (const rawId of ids) {
        const id = rawId?.toUpperCase();
        if (!id) continue;
        
        const resColab = await cenos_pool.query(`DELETE FROM colaboradores WHERE "ID" = $1`, [id]);
        if (deleteLogin || resColab.rowCount === 0) {
            await cenos_pool.query(`DELETE FROM login WHERE UPPER(id) = $1`, [id]);
        }
        deletedCount++;
    }
    
    return { message: `${deletedCount} agente(s) excluído(s) com sucesso.` };
}


// ─── inventory ───────────────────────────────────────────────────────────
async function get_inventory_admin({ user, page = 1, limit = 9999, search, agente, estado }) {
    const allowedPools = getUserAllowedStatePools(user).map(p => p.state);
    const pool = cenos_pool;

    // Garante existência da tabela e colunas novas
    await pool.query(`
        CREATE TABLE IF NOT EXISTS inventory (
            id SERIAL PRIMARY KEY,
            agente TEXT,
            pda_imei_1 TEXT,
            pda_imei_2 TEXT,
            pda_numero_serie TEXT,
            pda_marca TEXT,
            pda_modelo TEXT,
            pda_numero_chip TEXT,
            pda_versao_android TEXT,
            pda_versao_bluetooth TEXT,
            impressora_numero_serie TEXT,
            impressora_modelo TEXT,
            impressora_marca TEXT,
            maquininha_numero_serie TEXT,
            maquininha_numero_logico TEXT,
            estado TEXT DEFAULT 'pi',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
    `);

    // Adiciona colunas novas caso a tabela já existisse
    await pool.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS maquininha_numero_serie TEXT;`).catch(() => {});
    await pool.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS maquininha_numero_logico TEXT;`).catch(() => {});

    let query = `SELECT DISTINCT ON (agente) * FROM inventory WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    if (!userIsAdmin(user)) {
        query += ` AND estado = ANY($${paramIndex})`;
        params.push(allowedPools);
        paramIndex++;
    }

    query += ` ORDER BY agente, created_at DESC`;

    const { rows } = await pool.query(query, params);

    // Obtém todos os agentes autorizados uma única vez
    const allowedAgentsRes = await get_users_agents_admin({ user });

    let filteredRows = rows.map(r => {
        const agentData = allowedAgentsRes.find(a => a.id?.toString().toUpperCase() === r.agente?.toString().toUpperCase());
        if (!agentData) return null;

        // Acopla dados do agente ao registro do inventário
        return { ...r, ...agentData };
    }).filter(Boolean);

    // Filtro por estado
    if (estado) {
        const est = estado.toLowerCase();
        filteredRows = filteredRows.filter(r => r.estado?.toLowerCase() === est);
    }

    // Filtro por agente (ID ou Nome)
    if (agente) {
        const ag = agente.toLowerCase();
        filteredRows = filteredRows.filter(r => 
            r.id?.toLowerCase().includes(ag) || 
            r.nome?.toLowerCase().includes(ag)
        );
    }

    // Busca Global em todas as propriedades do objeto (ID, Nome, IMEI, Regional, etc)
    if (search) {
        const s = search.toLowerCase();
        filteredRows = filteredRows.filter(r =>
            Object.values(r).some(v => String(v || '').toLowerCase().includes(s))
        );
    }

    // Paginação em memória
    const limitVal = parseInt(limit) || 9999;
    const offsetVal = (parseInt(page) - 1) * limitVal;
    return filteredRows.slice(offsetVal, offsetVal + limitVal);
}

async function save_inventory_admin(data) {
    const { agente, pda_imei_1, pda_imei_2, pda_numero_serie, pda_marca, pda_modelo, pda_numero_chip, pda_versao_android, pda_versao_bluetooth, impressora_numero_serie, impressora_modelo, impressora_marca, maquininha_numero_serie, maquininha_numero_logico, estado } = data;
    const pool = cenos_pool;
    const query = `
        INSERT INTO inventory (agente, pda_imei_1, pda_imei_2, pda_numero_serie, pda_marca, pda_modelo, pda_numero_chip, pda_versao_android, pda_versao_bluetooth, impressora_numero_serie, impressora_modelo, impressora_marca, maquininha_numero_serie, maquininha_numero_logico, estado)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *;
    `;
    const values = [agente, pda_imei_1, pda_imei_2, pda_numero_serie, pda_marca, pda_modelo, pda_numero_chip, pda_versao_android, pda_versao_bluetooth, impressora_numero_serie, impressora_modelo, impressora_marca, maquininha_numero_serie || null, maquininha_numero_logico || null, estado || 'pi'];
    const { rows } = await pool.query(query, values);
    return rows[0];
}

async function update_inventory_admin(id, data) {
    const pool = cenos_pool;
    const fields = Object.keys(data).filter(k => k !== 'id');
    const values = fields.map(k => data[k]);
    const setClause = fields.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const query = `UPDATE inventory SET ${setClause}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`;
    const { rows } = await pool.query(query, [...values, id]);
    return rows[0];
}

async function delete_inventory_admin(id) {
    const pool = cenos_pool;
    const { rows } = await pool.query('DELETE FROM inventory WHERE id = $1 RETURNING *', [id]);
    return rows[0];
}

// ─── justify ───────────────────────────────────────────────────────────
async function get_justify_types_admin() {
    const pool = cenos_pool;

    let query = `SELECT DISTINCT tipo FROM justificativas WHERE tipo IS NOT NULL AND tipo <> '' ORDER BY tipo ASC`;
    const { rows } = await pool.query(query);
    return rows.map(r => r.tipo);
}


async function get_justify_admin({ instalacao, tipo, data_leit_prev, estado, page = 1, limit = 9999, search, user }) {
    const allowedPools = getUserAllowedStatePools(user).map(p => p.state);
    const pool = cenos_pool;

    let query = `SELECT * FROM justificativas WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    if (!userIsAdmin(user)) {
        query += ` AND estado = ANY($${paramIndex})`;
        params.push(allowedPools);
        paramIndex++;
    }

    if (instalacao) {
        query += ` AND autor = $${paramIndex}`;
        params.push(instalacao);
        paramIndex++;
    }
    if (tipo) {
        query += ` AND tipo = $${paramIndex}`;
        params.push(tipo);
        paramIndex++;
    }
    if (data_leit_prev) {
        query += ` AND data_leit_prev = $${paramIndex}`;
        params.push(data_leit_prev);
        paramIndex++;
    }
    if (estado) {
        query += ` AND estado = $${paramIndex}`;
        params.push(estado.toLowerCase());
        paramIndex++;
    }

    query += ` ORDER BY created_at DESC`;

    // Buscamos um set maior para possibilitar filtragem por hierarquia em memória
    const { rows } = await pool.query(query, params);

    const result = (await get_users_agents_admin({ user }) || [])
    const allowedAgents = result.map(a => a.id?.toString().toUpperCase());

    // Filtra e enriquece os dados antes da busca global
    let enrichedRows = rows
        .filter(r => {
            if (userIsAdmin(user)) return true;
            return allowedAgents.includes(r.autor?.toString().toUpperCase());
        })
        .map(r => {
            const agentData = result.find(a => a.id?.toString().toUpperCase() === r.autor?.toString().toUpperCase());
            return { ...agentData, ...r };
        });

    // Busca Global em todas as propriedades do objeto resultante
    if (search) {
        const s = search.toLowerCase();
        enrichedRows = enrichedRows.filter(r =>
            Object.values(r).some(v => String(v || '').toLowerCase().includes(s))
        );
    }

    // Paginação em memória
    const limitVal = parseInt(limit) || 9999;
    const offsetVal = (parseInt(page) - 1) * limitVal;
    return enrichedRows.slice(offsetVal, offsetVal + limitVal);
}

async function save_justify_admin(data) {
    const { instalacao, tipo, motivo, justificativa, foto, data_leit_prev, author, estado, quantidade } = data;
    const pool = cenos_pool;
    const query = `
        INSERT INTO justificativas (instalacao, tipo, motivo, justificativa, foto, data_leit_prev, author, estado, quantidade, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        RETURNING *;
    `;
    const values = [instalacao, tipo, motivo, justificativa, foto, data_leit_prev, author, estado || 'pi', quantidade];
    const { rows } = await pool.query(query, values);
    return rows[0];
}

async function update_justify_admin(id, data) {
    const pool = cenos_pool;
    const fields = Object.keys(data).filter(k => k !== 'id');
    const values = fields.map(k => data[k]);
    const setClause = fields.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const query = `UPDATE justificativas SET ${setClause}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`;
    const { rows } = await pool.query(query, [...values, id]);
    return rows[0];
}

async function delete_justify_admin(id) {
    const pool = cenos_pool;
    const { rows } = await pool.query('DELETE FROM justificativas WHERE id = $1 RETURNING *', [id]);
    return rows[0];
}

// ─── justify_pending ───────────────────────────────────────────────────────────

async function get_pending_justifies_admin({ state, autor, status = 'pendente', page = 1, limit = 9999, user, search }) {
    const allowedPools = getUserAllowedStatePools(user).map(p => p.state);
    const pool = cenos_pool;

    let query = `SELECT * FROM justify_pending WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    // Se o usuário não for admin principal, ele só pode ver estados permitidos
    if (!userIsAdmin(user)) {
        query += ` AND estado = ANY($${paramIndex})`;
        params.push(allowedPools);
        paramIndex++;
    }

    // Filtro por estado explícito (vindo da query param)
    if (state) {
        query += ` AND estado = $${paramIndex}`;
        params.push(state.toLowerCase());
        paramIndex++;
    }

    if (autor) {
        query += ` AND autor = $${paramIndex}`;
        params.push(autor);
        paramIndex++;
    }
    if (status) {
        query += ` AND status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
    }

    query += ` ORDER BY created_at DESC`;

    const { rows } = await pool.query(query, params);

    // Obtém todos os agentes autorizados uma única vez (sem filtro de search aqui para podermos cruzar dados)
    const result = (await get_users_agents_admin({ user }) || []);
    const allowedAgents = result.map(a => a.id?.toString().toUpperCase());

    // Filtra apenas registros de agentes que o usuário tem permissão de ver
    let enrichedRows = rows
        .filter(r => allowedAgents.includes(r.autor?.toString().toUpperCase()))
        .map(r => {
            const agent = result.find(a => a.id?.toString().toUpperCase() === r.autor?.toString().toUpperCase());
            return {
                ...agent,
                ...r
            };
        });

    // Busca Global em todas as propriedades do objeto (ID, Nome, Unidade, Tipo, Gestor, etc)
    if (search) {
        const s = search.toLowerCase();
        enrichedRows = enrichedRows.filter(r =>
            Object.values(r).some(v => String(v || '').toLowerCase().includes(s))
        );
    }

    // Paginação em memória
    const limitVal = parseInt(limit) || 9999;
    const offsetVal = (parseInt(page) - 1) * limitVal;
    return enrichedRows.slice(offsetVal, offsetVal + limitVal);
}

async function create_pending_justify_admin(data) {
    const { autor, quantidade, tipo, unidade_leitura, foto, estado } = data;
    const pool = cenos_pool;
    const query = `
        INSERT INTO justify_pending (autor, quantidade, tipo, unidade_leitura, foto, estado, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, 'pendente', NOW(), NOW())
        RETURNING *;
    `;
    const values = [autor, quantidade, tipo, unidade_leitura, foto, estado || 'pi'];
    const { rows } = await pool.query(query, values);
    return rows[0];
}

async function update_pending_justify_admin(id, data) {
    const pool = cenos_pool;

    // Injetamos o status respondido para garantir que a pendência seja marcada como tratada
    // Fazemos isso no objeto data para evitar erro de duplicidade no SQL caso status venha no body
    data.status = 'respondido';

    const fields = Object.keys(data).filter(k => k !== 'id');
    const values = fields.map(k => data[k]);
    const setClause = fields.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const query = `UPDATE justify_pending SET ${setClause}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`;
    const { rows } = await pool.query(query, [...values, id]);
    return rows[0];
}

async function delete_pending_justify_admin(id) {
    const pool = cenos_pool;
    const { rows } = await pool.query('DELETE FROM justify_pending WHERE id = $1 RETURNING *', [id]);
    return rows[0];
}

// ─── daily_report ───────────────────────────────────────────────────────────
async function get_daily_reports_admin({ autor, data, limit = 9999, page = 1, includeAll = false, user, search, estado, motivo }) {
    const allowedPools = getUserAllowedStatePools(user).map(p => p.state);
    const pool = cenos_pool;

    let query = `SELECT * FROM daily_report WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    if (!userIsAdmin(user)) {
        query += ` AND estado = ANY($${paramIndex})`;
        params.push(allowedPools);
        paramIndex++;
    }

    if (autor) {
        query += ` AND autor = $${paramIndex}`;
        params.push(autor);
        paramIndex++;
    }
    if (data) {
        query += ` AND DATE(created_at) = $${paramIndex}`;
        params.push(data);
        paramIndex++;
    }
    if (motivo) {
        query += ` AND motivo = $${paramIndex}`;
        params.push(motivo);
        paramIndex++;
    }

    if (estado) {
        query += ` AND estado = $${paramIndex}`;
        params.push(estado.toLowerCase());
        paramIndex++;
    }

    query += ` ORDER BY created_at DESC`;

    const { rows } = await pool.query(query, params);

    const result = await get_users_agents_admin({ user }) || [];
    const allowedAgents = result.map(a => a.id?.toString().toUpperCase());

    // Filtra e enriquece os dados antes da busca global
    let enrichedRows = rows
        .filter(r => allowedAgents.includes(r.autor?.toString().toUpperCase()))
        .map(r => {
            const agent = result.find(a => a.id?.toString().toUpperCase() === r.autor?.toString().toUpperCase());
            return {
                ...agent,
                ...r
            };
        });

    // Busca Global em todas as propriedades do objeto resultante
    if (search) {
        const s = search.toLowerCase();
        enrichedRows = enrichedRows.filter(r =>
            Object.values(r).some(v => String(v || '').toLowerCase().includes(s))
        );
    }

    if (includeAll) return enrichedRows;

    // Paginação em memória
    const limitVal = parseInt(limit) || 9999;
    const offsetVal = (parseInt(page) - 1) * limitVal;
    return enrichedRows.slice(offsetVal, offsetVal + limitVal);
}

async function create_daily_report_admin(data) {
    const { autor, nota, motivo, observacao, foto, estado, data_report } = data;
    const pool = cenos_pool;
    const query = `
        INSERT INTO daily_report (autor, nota, motivo, observacao, foto, estado, data_report, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        RETURNING *;
    `;
    const values = [autor, nota, motivo, observacao, foto, estado || 'pi', data_report || today()];
    const { rows } = await pool.query(query, values);
    return rows[0];
}

async function update_daily_report_admin(id, data) {
    const pool = cenos_pool;
    const fields = Object.keys(data).filter(k => k !== 'id');
    const values = fields.map(k => data[k]);
    const setClause = fields.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const query = `UPDATE daily_report SET ${setClause}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`;
    const { rows } = await pool.query(query, [...values, id]);
    return rows[0];
}

async function delete_daily_report_admin(id) {
    const pool = cenos_pool;
    const { rows } = await pool.query('DELETE FROM daily_report WHERE id = $1 RETURNING *', [id]);
    return rows[0];
}

async function get_instalations_admin({ query = [], type }) {
    if (!query || query.length === 0) return [];

    let column = 'instalacao';
    if (type === 'medidor') column = 'medidor';
    if (type === 'contacontrato') column = 'conta_contrato';

    const placeholders = query.map((_, i) => `$${i + 1}`).join(',');
    const sql = `
        SELECT * 
        FROM dados_instalacoes 
        WHERE ${column} IN (${placeholders})
    `;

    const sql_state = `SELECT DISTINCT ON (${column}) * 
        FROM matriz 
        WHERE ${column} IN (${placeholders})
        AND LEFT(ntlei, 1) = 'A'
        AND latitude <> 0 AND latitude IS NOT NULL
        AND longitude <> 0 AND longitude IS NOT NULL
        ORDER BY ${column}, data_conclusao DESC
    `;

    try {
        const [resLocals, resMatrizPi, resMatrizMa] = await Promise.all([
            localizacoes_pi_pool.query(sql, query),
            pi_pool.query(sql_state, query),
            ma_pool.query(sql_state, query)
        ]);

        const locals = resLocals.rows;
        const matriz = [...resMatrizPi.rows?.map(row => ({ ...row, estado: 'pi' })), ...resMatrizMa.rows?.map(row => ({ ...row, estado: 'ma' }))];

        const resultsMap = [];

        matriz.forEach(m => {
            const data = locals.find(l => l['instalacao'] === m['instalacao']);
            if (!data) {
                resultsMap.push(
                    {
                        instalacao: m['instalacao'],
                        conta_contrato: null,
                        medidor: null,
                        md_vizinho: null,
                        unid_leit: null,
                        status: m['status_ds'] === 'LG' ? 'LIGADO' : 'DESLIGADO',
                        endereco: null,
                        nome_cliente: null,
                        lat_cad: null,
                        long_cad: null,
                        lat_leitura: m['latitude'],
                        long_leitura: m['longitude'],
                        lat_lig: null,
                        lon_lig: null
                    }
                )
                return;
            }
            resultsMap.push({ ...data, lat_leitura: m['latitude'], long_leitura: m['longitude'] });
        });
        
        // console.log(resultsMap);
        return resultsMap;
    } catch (err) {
        console.error('Erro em get_instalations:', err);
        throw err;
    }
}

module.exports = {
    get_inventory_admin,
    save_inventory_admin,
    update_inventory_admin,
    delete_inventory_admin,
    get_justify_admin,
    save_justify_admin,
    update_justify_admin,
    delete_justify_admin,
    get_pending_justifies_admin,
    create_pending_justify_admin,
    update_pending_justify_admin,
    delete_pending_justify_admin,
    get_daily_reports_admin,
    create_daily_report_admin,
    update_daily_report_admin,
    delete_daily_report_admin,
    get_instalations_admin,
    get_users_agents_admin,
    get_users_agents_admin_paginated,
    get_users_only_login_paginated,
    create_user_agent_admin,
    update_user_agent_admin,
    delete_user_agent_admin,
    bulk_update_user_agents_admin,
    bulk_delete_user_agents_admin,
    send_message_to_agent,
    send_telegram_to_agent_by_id,
    get_justify_types_admin,
    get_user_agent_options,
    getUserAllowedStatePools,
    getFilterUser,
    userIsAdmin,
};
