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

async function get_users_agents_admin({ user, ids = [], page = 1, limit = 9999, search, regional, seccional, gestor, estado }) {
    const availablePools = getUserAllowedStatePools(user);
    const filterUser = getFilterUser(user);

    // Filtra pelo estado solicitado, se houver
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


    let rowsACC = [];

    for (const { state, pool } of targetPools) {
        let colabQuery = `SELECT * FROM colaboradores WHERE 1=1`;
        const colabParams = [];
        let paramIdx = 1;

        if (search) {
            // Busca por Nome ou ID ou IDs encontrados via busca de Email
            const conditions = [`"Nome" ILIKE $${paramIdx}`, `"ID" ILIKE $${paramIdx}`];
            colabParams.push(`%${search}%`);
            paramIdx++;

            if (searchIdsFromLogin.length > 0) {
                conditions.push(`"ID" = ANY($${paramIdx})`);
                colabParams.push(searchIdsFromLogin);
                paramIdx++;
            }
            colabQuery += ` AND (${conditions.join(' OR ')})`;
        }

        if (ids && ids.length > 0) {
            colabQuery += ` AND "ID" = ANY($${paramIdx})`;
            colabParams.push(ids.map(id => id.toUpperCase()));
            paramIdx++;
        }

        if (regional) {
            colabQuery += ` AND "regional" ILIKE $${paramIdx}`;
            colabParams.push(`%${regional}%`);
            paramIdx++;
        }

        if (seccional) {
            colabQuery += ` AND "seccional" ILIKE $${paramIdx}`;
            colabParams.push(`%${seccional}%`);
            paramIdx++;
        }

        if (gestor) {
            colabQuery += ` AND "GESTOR IMEDIATO" ILIKE $${paramIdx}`;
            colabParams.push(`%${gestor}%`);
            paramIdx++;
        }

        const { rows } = await pool.query(colabQuery, colabParams);

        const result = rows.map(r => {
            const mapped = {
                ...r,
                gestor: r['GESTOR IMEDIATO'],
                matricula: `${parseInt(r['MAT'])}`,
                nome: r['Nome'],
                id: (r['ID']).toUpperCase(),
                estado: state
            };

            delete mapped['GESTOR IMEDIATO'];
            delete mapped['MAT'];
            delete mapped['Nome'];
            delete mapped['ID'];

            let cargo = r?.Cargo;
            let setor_key = Object.keys(setor).find(k => cargo?.includes(k));
            let veiculo_key = Object.keys(veiculo).find(k => cargo?.includes(k));

            mapped['setor'] = setor[setor_key] || null;
            mapped['cargo'] = veiculo[veiculo_key] || null;
            delete mapped['Cargo'];

            return mapped;
        });

        // Complementa com dados do cenos_pool.login para pegar telegram_id e outros campos
        if (result.length > 0) {
            const { rows: loginData } = await cenos_pool.query(
                `SELECT * FROM login WHERE id IN (${result.map((_, i) => `$${i + 1}`).join(',')})`,
                result.map(r => r.id)
            );

            result.forEach(r => {
                const login = loginData.find(l => l.id === r.id);
                r.telegram_id = login?.telegram_id || null;
                // Garante valores null para campos vazios
                r.seccional = r.seccional || null;
                r.regional = r.regional || null;
                r.has_inventory = inventoryAgentsSet.has(r.id);
                r.unread_chat_count = unreadChatsSet.get(r.id) || 0;
            });
        }

        rowsACC.push(...result);
    }

    // Ordenação básica (pode ser expandida se necessário)
    rowsACC.sort((a, b) => a.nome.localeCompare(b.nome));

    // console.log(filterUser, !userIsAdmin(user));
    if (filterUser && !userIsAdmin(user)) {
        rowsACC = rowsACC.filter(r => {
            // console.log(filterUser.type);
            return r[filterUser.type] === filterUser.value
        });
    }

    // Paginação em memória
    const offset = (parseInt(page) - 1) * parseInt(limit);
    return rowsACC.slice(offset, offset + parseInt(limit));
}

async function get_user_agent_options({ estado }) {
    let result = {
        gestores: [],
        cargos: [],
        regionais: [],
        seccionais: []
    };
    const query = `SELECT DISTINCT "GESTOR IMEDIATO" FROM colaboradores WHERE "GESTOR IMEDIATO" IS NOT NULL`;
    const { rows } = await estado === 'pi' ? await pi_pool.query(query) : await ma_pool.query(query);
    result.gestores = rows.map(r => r['GESTOR IMEDIATO']);


    const query2 = `SELECT DISTINCT uac FROM localidades WHERE uac IS NOT NULL`;
    const { rows: rows2 } = await estado === 'pi' ? await pi_pool.query(query2) : await ma_pool.query(query2);
    result.seccionais = rows2.map(r => r['uac']);

    const query3 = `SELECT DISTINCT regional FROM localidades WHERE regional IS NOT NULL`;
    const { rows: rows3 } = await estado === 'pi' ? await pi_pool.query(query3) : await ma_pool.query(query3);
    result.regionais = rows3.map(r => r['regional']);

    const query4 = `SELECT DISTINCT "Cargo" FROM colaboradores WHERE "Cargo" IS NOT NULL`;
    const { rows: rows4 } = await estado === 'pi' ? await pi_pool.query(query4) : await ma_pool.query(query4);
    result.cargos = rows4.map(r => r['Cargo']);

    return result;
}

async function create_user_agent_admin({ id, matricula, nome, estado, gestor, cargo, user, seccional, regional }) {
    const allowedPools = getUserAllowedStatePools(user);
    const target = allowedPools.find(p => p.state === estado.toLowerCase());

    if (!target) {
        return { error: `Você não tem permissão para cadastrar agentes no estado ${estado.toUpperCase()}` };
    }

    const query = `INSERT INTO colaboradores ("ID", "MAT", "Nome", "GESTOR IMEDIATO", "Cargo", "seccional", "regional") VALUES ($1, $2, $3, $4, $5, $6, $7)`;
    const params = [id?.toUpperCase(), matricula, nome, gestor, cargo, seccional, regional];

    try {
        await target.pool.query(query, params);
        const result = await get_users_agents_admin({ user, ids: [id], estado });
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
    if (!agent.telegram_id) return { error: 'Este agente não possui Telegram ID vinculado' };

    const allowedPools = getUserAllowedStatePools(user);
    if (!allowedPools.find(p => p.state === agent.estado.toLowerCase())) {
        return { error: `Você não tem permissão para enviar mensagens para agentes do estado ${agent.estado.toUpperCase()}` };
    }

    let payload;
    let contentType = 'application/json';

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

    let result;
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
    const userData = await get_users_agents_admin({ user, ids: [id] });
    if (!userData.length) return { error: 'Usuário não encontrado' };

    const agent = userData[0];
    const allowedPools = getUserAllowedStatePools(user);
    const target = allowedPools.find(p => p.state === agent.estado.toLowerCase());

    if (!target) {
        return { error: `Você não tem permissão para deletar agentes no estado ${agent.estado.toUpperCase()}` };
    }

    try {
        await target.pool.query(`DELETE FROM colaboradores WHERE "ID" = $1`, [id?.toUpperCase()]);

        if (deleteLogin) {
            await cenos_pool.query(`DELETE FROM login WHERE id = $1`, [id?.toUpperCase()]);
        }

        return { message: 'Usuário deletado com sucesso' };
    } catch (err) {
        console.error('Erro ao deletar usuário:', err.message);
        throw err;
    }
}

async function update_user_agent_admin({ id, nome, gestor, cargo, seccional, regional, user }) {
    const userData = await get_users_agents_admin({ user, ids: [id] });
    if (!userData.length) return { error: 'Usuário não encontrado' };

    const agent = userData[0];
    const allowedPools = getUserAllowedStatePools(user);
    const target = allowedPools.find(p => p.state === agent.estado.toLowerCase());

    if (!target) {
        return { error: `Você não tem permissão para atualizar agentes no estado ${agent.estado.toUpperCase()}` };
    }

    const query = `UPDATE colaboradores SET "Nome" = $1, "GESTOR IMEDIATO" = $2, "Cargo" = $3, "seccional" = $4, "regional" = $5 WHERE "ID" = $6`;
    const params = [nome, gestor, cargo, seccional, regional, id?.toUpperCase()];

    try {
        await target.pool.query(query, params);
        const result = await get_users_agents_admin({ user, ids: [id], estado: agent.estado });
        return result[0];
    } catch (err) {
        console.error('Erro ao atualizar usuário:', err.message);
        throw err;
    }
}


// ─── inventory ───────────────────────────────────────────────────────────
async function get_inventory_admin({ user, page = 1, limit = 9999, search, agente, estado }) {
    const allowedPools = getUserAllowedStatePools(user).map(p => p.state);
    const pool = cenos_pool;

    // Garante existência da tabela e colunas novas
    await pool.query(`
        CREATE TABLE IF NOT EXISTS inventory (
            id SERIAL PRIMARY KEY,
            agente TEXT NOT NULL,
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
async function get_justify_pending_types() {
    const pool = cenos_pool;
    const { rows } = await pool.query("SELECT DISTINCT tipo FROM justify_pending WHERE tipo IS NOT NULL AND tipo <> '' ORDER BY tipo ASC");
    return rows.map(r => r.tipo);
}

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
    create_user_agent_admin,
    update_user_agent_admin,
    delete_user_agent_admin,
    send_message_to_agent,
    send_bulk_message_to_agents,
    get_justify_types_admin,
     get_justify_pending_types,
      get_user_agent_options,
      getUserAllowedStatePools,
};
