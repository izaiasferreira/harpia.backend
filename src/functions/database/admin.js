const { pi_pool, ma_pool, localizacoes_pi_pool, cenos_pool } = require('../../db');
const { today } = require('../../utils/dates');


const userIsAdmin = (user) => {
    return user.role.toLowerCase().includes('admin');
}



async function get_users_agents_admin({ user, ids = [], page = 1, limit = 9999, search, regional, seccional, gestor, estado }) {
    const pool = cenos_pool;
    let query = `SELECT * FROM login WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    let activeEstado = estado || user.estado;

    if (activeEstado && !userIsAdmin(user)) {
        query += ` AND estado = $${paramIndex}`;
        params.push(activeEstado.toLowerCase());
        paramIndex++;
    }

    // Handle regional/seccional filtering from external matriz tables
    if (regional || seccional) {
        let externalIds = [];
        try {
            let poolsToQuery = [];
            if (activeEstado) {
                poolsToQuery = [activeEstado.toLowerCase() === 'pi' ? pi_pool : ma_pool];
            } else {
                poolsToQuery = [pi_pool, ma_pool];
            }

            for (const p of poolsToQuery) {
                let mQuery = `SELECT DISTINCT TRIM(UPPER(agente)) as id FROM matriz WHERE 1=1`;
                const mParams = [];
                let mIndex = 1;
                if (regional) {
                    mQuery += ` AND regional = $${mIndex}`;
                    mParams.push(regional.toUpperCase());
                    mIndex++;
                }
                if (seccional) {
                    mQuery += ` AND seccional = $${mIndex}`;
                    mParams.push(seccional.toUpperCase());
                    mIndex++;
                }
                const { rows } = await p.query(mQuery, mParams);
                externalIds.push(...rows.map(r => r.id));
            }

            if (externalIds.length > 0) {
                ids = ids.length > 0 ? ids.filter(id => externalIds.includes(id.toUpperCase())) : externalIds;
            } else {
                return []; // No agents found in this regional/seccional
            }
        } catch (err) {
            console.error('Erro ao filtrar por regional/seccional:', err.message);
        }
    }

    // Handle gestor filtering from external colaboradores table
    if (gestor) {
        let externalIds = [];
        try {
            let poolsToQuery = [];
            if (activeEstado) {
                poolsToQuery = [activeEstado.toLowerCase() === 'pi' ? pi_pool : ma_pool];
            } else {
                poolsToQuery = [pi_pool, ma_pool];
            }

            for (const p of poolsToQuery) {
                let cQuery = `SELECT DISTINCT TRIM(UPPER("ID")) as id FROM colaboradores WHERE "GESTOR IMEDIATO" ILIKE $1`;
                const { rows } = await p.query(cQuery, [`%${gestor}%`]);
                externalIds.push(...rows.map(r => r.id));
            }

            if (externalIds.length > 0) {
                ids = ids.length > 0 ? ids.filter(id => externalIds.includes(id.toUpperCase())) : externalIds;
            } else {
                return []; // No agents found with this gestor
            }
        } catch (err) {
            console.error('Erro ao filtrar por gestor:', err.message);
        }
    }

    if (ids.length > 0) {
        const upperIds = ids.map(id => id.toString().toUpperCase());
        const placeholders = upperIds.map((_, i) => `$${paramIndex + i}`).join(',');
        query += ` AND UPPER("id") IN (${placeholders})`;
        params.push(...upperIds);
        paramIndex += upperIds.length;
    }
    if (search) {
        query += ` AND (id ILIKE $${paramIndex} OR nome ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
    }

    const limitVal = parseInt(limit) || 9999;
    const offsetVal = (parseInt(page) - 1) * limitVal;

    query += ` ORDER BY id DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limitVal, offsetVal);

    const { rows } = await pool.query(query, params);
    let usersData = [];

    if (rows.length === 0) return [];

    const usersIds = rows.map(r => r.id);
    const placeholders = usersIds.map((_, i) => `$${i + 1}`).join(',');

    if (user.estado && !userIsAdmin(user)) {
        const pool_state = user.estado.toLowerCase() === 'pi' ? pi_pool : ma_pool;
        try {
            const usersData = await pool_state.query(`SELECT * FROM colaboradores WHERE id IN (${placeholders})`, usersIds);
            const localData = await pool_state.query(`SELECT DISTINCT ON (TRIM(UPPER(agente))) agente as id, seccional, regional, data_conclusao FROM matriz WHERE TRIM(UPPER(agente)) IN (${placeholders}) ORDER BY TRIM(UPPER(agente)), data_conclusao DESC;`, usersIds);

            usersData = usersData.rows.map(r => {
                let localDataFind = localData.rows.find(l => l?.id?.toString().toLowerCase() === r?.ID?.toString().toLowerCase());
                return { ...r, ...(localDataFind || {}) };
            });
        } catch (err) {
            console.error('Erro ao buscar dados dos colaboradores:', err.message);
        }
    } else {
        try {
            let { rows: usersDataPi } = await pi_pool.query(`SELECT * FROM colaboradores WHERE "ID" IN (${placeholders})`, usersIds);
            const { rows: localDataPi } = await pi_pool.query(`SELECT DISTINCT ON (TRIM(UPPER(agente))) agente as id, seccional, regional, data_conclusao FROM matriz WHERE TRIM(UPPER(agente)) IN (${placeholders}) ORDER BY TRIM(UPPER(agente)), data_conclusao DESC;`, usersIds);
            usersDataPi = usersDataPi.map(r => {
                let localDataFind = localDataPi.find(l => l.id?.toString().toLowerCase() === r.ID?.toString().toLowerCase());
                return { ...r, ...(localDataFind || {}) };
            });

            let { rows: usersDataMa } = await ma_pool.query(`SELECT * FROM colaboradores WHERE "ID" IN (${placeholders})`, usersIds);
            const { rows: localDataMa } = await ma_pool.query(`SELECT DISTINCT ON (TRIM(UPPER(agente))) agente as id, seccional, regional, data_conclusao FROM matriz WHERE TRIM(UPPER(agente)) IN (${placeholders}) ORDER BY TRIM(UPPER(agente)), data_conclusao DESC;`, usersIds);
            usersDataMa = usersDataMa.map(r => {
                let localDataFind = localDataMa.find(l => l.id?.toString().toLowerCase() === r.ID?.toString().toLowerCase());
                return { ...r, ...(localDataFind || {}) };
            });
            usersData = [...usersDataPi, ...usersDataMa];
        } catch (err) {
            console.error('Erro ao buscar dados dos colaboradores (PI/MA):', err.message);
        }
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
    return rows.map(r => {
        let userDataFind = usersData.find(u => u.ID?.toString().toUpperCase() === r.id?.toString().toUpperCase());
        let userDataFormated = { ...r, ...(userDataFind || {}) };
        let cargo = userDataFormated?.Cargo;
        let setor_key = Object.keys(setor).find(k => cargo?.includes(k));
        let veiculo_key = Object.keys(veiculo).find(k => cargo?.includes(k));

        userDataFormated['setor'] = setor[setor_key] || 'SEM SETOR';
        userDataFormated['cargo'] = veiculo[veiculo_key] || 'SEM VEICULO';
        delete userDataFormated?.Cargo;

        userDataFormated['gestor'] = userDataFormated['GESTOR IMEDIATO']
        delete userDataFormated['GESTOR IMEDIATO'];

        userDataFormated['matricula'] = userDataFormated['MAT']
        delete userDataFormated['MAT'];

        delete userDataFormated['data_conclusao'];
        delete userDataFormated['ID'];

        return userDataFormated;
    });
}

async function create_user_agent_admin({ id, matricula, nome, estado, gestor, cargo, user }) {
    let query = `INSERT INTO colaboradores ("ID", "MAT", "Nome", "GESTOR IMEDIATO", "Cargo") VALUES ($1, $2, $3, $4, $5)`;
    const params = [id?.toUpperCase(), matricula, nome, gestor, cargo];

    if (user.estado !== estado && !userIsAdmin(user)) return { error: 'Você não está autorizado a criar usuários em outros estados' };
    try {
        await estado === 'pi' ? await pi_pool.query(query, params) : await ma_pool.query(query, params);
        let result = await get_users_agents_admin({ user, ids: [id] });
        return result[0];
    } catch (err) {
        console.error('Erro ao criar usuário:', err.message);
        throw err;
    }
}

async function send_message_to_agent({ id, text, file, user }) {
    const userData = await get_users_agents_admin({ user, ids: [id] });
    if (!userData.length) return { error: 'Usuário não encontrado' };

    const params = [id?.toUpperCase(), text, file];
    if (user.estado !== userData[0].estado && !userIsAdmin(user)) return { error: 'Você não está autorizado a enviar mensagens para usuários de outros estados' };

    return { message: 'Mensagem enviada com sucesso' };
}

async function delete_user_agent_admin({ id, user }) {
    const userData = await get_users_agents_admin({ user, ids: [id] });
    if (!userData.length) return { error: 'Usuário não encontrado' };

    const params = [id?.toUpperCase()];
    if (user.estado !== userData[0].estado && !userIsAdmin(user)) return { error: 'Você não está autorizado a deletar usuários em outros estados' };

    try {
        let query = `DELETE FROM colaboradores WHERE "ID" = $1`;
        await user.estado === 'pi' ? await pi_pool.query(query, params) : await ma_pool.query(query, params);
        return { message: 'Usuário deletado com sucesso' };
    } catch (err) {
        console.error('Erro ao deletar usuário:', err.message);
        throw err;
    }
}

async function update_user_agent_admin({ id, matricula, nome, gestor, cargo, user }) {
    const userData = await get_users_agents_admin({ user, ids: [id] });
    if (!userData.length) return { error: 'Usuário não encontrado' };

    const params = [matricula, nome, gestor, cargo, id?.toUpperCase()];
    if (user.estado !== userData[0].estado && !userIsAdmin(user)) return { error: 'Você não está autorizado a atualizar usuários em outros estados' };

    try {
        let query = `UPDATE colaboradores SET "MAT" = $1, "Nome" = $2, "GESTOR IMEDIATO" = $3, "Cargo" = $4 WHERE "ID" = $5`;
        await user.estado === 'pi' ? await pi_pool.query(query, params) : await ma_pool.query(query, params);
        let result = await get_users_agents_admin({ user, ids: [id] });
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
    send_message_to_agent
};
