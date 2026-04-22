const axios = require('axios');
const { pi_pool, ma_pool, localizacoes_pi_pool, cenos_pool } = require('../../db');
const { today } = require('../../utils/dates');


const userIsAdmin = (user) => {
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
    const isMainAdmin = userIsAdmin(user);
    const userFilters = user?.permissions?.map(p => p.filters).flat() || [];
    const statesFilters = userFilters.filter(f => f.type === 'estado').map(f => f.value.toLowerCase());
    
    const available = [];
    if (isMainAdmin || statesFilters.includes('pi')) available.push({ state: 'pi', pool: pi_pool });
    if (isMainAdmin || statesFilters.includes('ma')) available.push({ state: 'ma', pool: ma_pool });
    return available;
};

async function get_users_agents_admin({ user, ids = [], page = 1, limit = 9999, search, regional, seccional, gestor, estado }) {
    const availablePools = getUserAllowedStatePools(user);

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
            });
        }

        rowsACC.push(...result);
    }

    // Ordenação básica (pode ser expandida se necessário)
    rowsACC.sort((a, b) => a.nome.localeCompare(b.nome));

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

async function send_message_to_agent({ id, text, file, webAppButtonText, webAppButtonUrl, options, user }) {
    const userData = await get_users_agents_admin({ user, ids: [id] });
    if (!userData.length) return { error: 'Usuário não encontrado' };

    const agent = userData[0];
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
            id?.toUpperCase(),
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
async function get_inventory_admin({ user, with_users = false, page = 1, limit = 9999, search }) {

    let activeState = (user.estado || 'pi').toLowerCase();
    if (userIsAdmin(user)) activeState = null;

    let pool = cenos_pool;

    // ... createTableQuery logic ...
    const createTableQuery = `
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
            estado TEXT DEFAULT 'pi',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
    `;
    await pool.query(createTableQuery);

    let query = `SELECT DISTINCT ON (agente) * FROM inventory WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    if (activeState) {
        query += ` AND estado = $${paramIndex}`;
        params.push(activeState);
        paramIndex++;
    }

    if (search) {
        query += ` AND (agente ILIKE $${paramIndex} OR pda_imei_1 ILIKE $${paramIndex} OR pda_marca ILIKE $${paramIndex} OR pda_modelo ILIKE $${paramIndex} OR impressora_numero_serie ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
    }

    const limitVal = parseInt(limit) || 9999;
    const offsetVal = (parseInt(page) - 1) * limitVal;

    query += ` ORDER BY agente, created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limitVal, offsetVal);

    const { rows } = await pool.query(query, params);

    if (!with_users) return rows;

    const users_agents = await get_users_agents_admin({ user, ids: rows.map(r => r.agente) });

    return rows.map(r => {
        let userDataFind = users_agents.find(u => u.id?.toString().toUpperCase() === r.agente?.toString().toUpperCase());
        let userDataFormated = { ...r, ...(userDataFind || {}) };
        return userDataFormated;
    });
}

async function save_inventory_admin(data) {
    const { agente, pda_imei_1, pda_imei_2, pda_numero_serie, pda_marca, pda_modelo, pda_numero_chip, pda_versao_android, pda_versao_bluetooth, impressora_numero_serie, impressora_modelo, impressora_marca, estado } = data;
    const pool = cenos_pool;
    const query = `
        INSERT INTO inventory (agente, pda_imei_1, pda_imei_2, pda_numero_serie, pda_marca, pda_modelo, pda_numero_chip, pda_versao_android, pda_versao_bluetooth, impressora_numero_serie, impressora_modelo, impressora_marca, estado)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *;
    `;
    const values = [agente, pda_imei_1, pda_imei_2, pda_numero_serie, pda_marca, pda_modelo, pda_numero_chip, pda_versao_android, pda_versao_bluetooth, impressora_numero_serie, impressora_modelo, impressora_marca, estado || 'pi'];
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


async function get_justify_admin({ instalacao, tipo, data_leit_prev, estado, page = 1, limit = 9999, search }) {
    const pool = cenos_pool;

    let query = `SELECT * FROM justificativas WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

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
    if (search) {
        query += ` AND (instalacao ILIKE $${paramIndex} OR tipo ILIKE $${paramIndex} OR motivo ILIKE $${paramIndex} OR justificativa ILIKE $${paramIndex} OR author ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
    }

    const limitVal = parseInt(limit) || 9999;
    const offsetVal = (parseInt(page) - 1) * limitVal;

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limitVal, offsetVal);

    const { rows } = await pool.query(query, params);
    return rows;
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

async function get_pending_justifies_admin({ state = 'pi', autor, status = 'pendente', page = 1, limit = 9999, user, search }) {
    const pool = cenos_pool;

    let query = `SELECT * FROM justify_pending WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

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
    if (state && !userIsAdmin(user)) {
        query += ` AND estado = $${paramIndex}`;
        params.push(state.toLowerCase());
        paramIndex++;
    }
    if (search) {
        query += ` AND (autor ILIKE $${paramIndex} OR unidade_leitura ILIKE $${paramIndex} OR tipo ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
    }

    const limitVal = parseInt(limit) || 9999;
    const offsetVal = (parseInt(page) - 1) * limitVal;

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limitVal, offsetVal);

    const { rows } = await pool.query(query, params);
    return rows;
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
    const pool = cenos_pool;

    let query = `SELECT * FROM daily_report WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

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

    let activeEstado = estado || (userIsAdmin(user) ? null : user.estado);
    if (activeEstado) {
        query += ` AND estado = $${paramIndex}`;
        params.push(activeEstado.toLowerCase());
        paramIndex++;
    }
    if (search) {
        query += ` AND (autor ILIKE $${paramIndex} OR motivo ILIKE $${paramIndex} OR observacao ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
    }

    query += ` ORDER BY created_at DESC`;

    if (!includeAll) {
        const limitVal = parseInt(limit) || 9999;
        const offsetVal = (parseInt(page) - 1) * limitVal;

        query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limitVal, offsetVal);
    }

    const { rows } = await pool.query(query, params);
    return rows;
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
    try {
        const { rows } = await localizacoes_pi_pool.query(sql, query);
        return rows;
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
    get_justify_types_admin,
    get_justify_pending_types,
    get_user_agent_options
};
