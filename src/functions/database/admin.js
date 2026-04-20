const { pi_pool, ma_pool, localizacoes_pi_pool, cenos_pool } = require('../../db');
const { today } = require('../../utils/dates');


const userIsAdmin = (user) => {
    return user.role.toLowerCase().includes('admin');
}

async function get_users_agents_admin({ user, ids = [] }) {
    const pool = cenos_pool;
    let query = `SELECT * FROM login WHERE 1=1`;
    const params = [];
    let paramIndex = 1;
    
    if (user.estado && !userIsAdmin(user)) {
        query += ` AND estado = $${paramIndex}`;
        params.push(user.estado.toLowerCase());
        paramIndex++;
    }
    if (ids.length > 0) {
        const upperIds = ids.map(id => id.toString().toUpperCase());
        const placeholders = upperIds.map((_, i) => `$${paramIndex + i}`).join(',');
        query += ` AND UPPER("id") IN (${placeholders})`;
        params.push(...upperIds);
        paramIndex += upperIds.length;
    }

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
            let {rows: usersDataPi} = await pi_pool.query(`SELECT * FROM colaboradores WHERE "ID" IN (${placeholders})`, usersIds);
            const {rows: localDataPi} = await pi_pool.query(`SELECT DISTINCT ON (TRIM(UPPER(agente))) agente as id, seccional, regional, data_conclusao FROM matriz WHERE TRIM(UPPER(agente)) IN (${placeholders}) ORDER BY TRIM(UPPER(agente)), data_conclusao DESC;`, usersIds);
            usersDataPi = usersDataPi.map(r => {
                let localDataFind = localDataPi.find(l => l.id?.toString().toLowerCase() === r.ID?.toString().toLowerCase());
                return { ...r, ...(localDataFind || {}) };
            });
            
            let {rows: usersDataMa} = await ma_pool.query(`SELECT * FROM colaboradores WHERE "ID" IN (${placeholders})`, usersIds);
            const {rows: localDataMa} = await ma_pool.query(`SELECT DISTINCT ON (TRIM(UPPER(agente))) agente as id, seccional, regional, data_conclusao FROM matriz WHERE TRIM(UPPER(agente)) IN (${placeholders}) ORDER BY TRIM(UPPER(agente)), data_conclusao DESC;`, usersIds);
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

// ─── inventory ───────────────────────────────────────────────────────────
async function get_inventory_admin({ user, with_users = false }) {

    let activeState = (user.estado || 'pi').toLowerCase();
    if (userIsAdmin(user)) activeState = null;

    let pool = cenos_pool;

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

    let query = `
        SELECT DISTINCT ON (agente) * FROM inventory
    `;

    if (activeState) {
        query += ` WHERE estado = $1`;
        query += ` ORDER BY agente, created_at DESC`;
        const { rows } = await pool.query(query, [activeState]);
        return rows;
    }

    query += ` ORDER BY agente, created_at DESC`;
    const { rows } = await pool.query(query);

    if (!with_users) return rows;

    const users_agents = await get_users_agents_admin({ user, ids: rows.map(r => r.agente) });

    return rows.map(r => {
        let userDataFind = users_agents.find(u => u.id?.toString().toUpperCase() === r.agente?.toString().toUpperCase());
        let userDataFormated = { ...r, ...(userDataFind || {}) };
        return userDataFormated;
    });
}

// ─── justify ───────────────────────────────────────────────────────────
async function get_justify_admin({ instalacao, tipo, data_leit_prev, estado }) {
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

    query += ` ORDER BY created_at DESC`;

    const { rows } = await pool.query(query, params);
    return rows;
}

// ─── justify_pending ───────────────────────────────────────────────────────────
async function get_pending_justifies_admin({ state = 'pi', autor, status = 'pendente', page = 1, limit = 20, user }) {
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

    const limitVal = parseInt(limit) || 20;
    const offsetVal = (parseInt(page) - 1) * limitVal;

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limitVal, offsetVal);

    const { rows } = await pool.query(query, params);
    return rows;
}

// ─── daily_report ───────────────────────────────────────────────────────────
async function get_daily_reports_admin({ autor, data, limit = 10, page = 1, includeAll = false, user }) {
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
    if (!userIsAdmin(user)) {
        query += ` AND estado = $${paramIndex}`;
        params.push(user.estado.toLowerCase());
        paramIndex++;
    }

    query += ` ORDER BY created_at DESC`;

    if (!includeAll) {
        const limitVal = parseInt(limit) || 10;
        const offsetVal = (parseInt(page) - 1) * limitVal;

        query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limitVal, offsetVal);
    }

    const { rows } = await pool.query(query, params);
    return rows;
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
    get_justify_admin,
    get_pending_justifies_admin,
    get_daily_reports_admin,
    get_instalations_admin,
    get_users_agents_admin
};
