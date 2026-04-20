const { pi_pool, ma_pool, localizacoes_pi_pool, cenos_pool } = require('../../db');
const { today } = require('../../utils/dates');


const userIsAdmin = (user) => {
    return user.role.toLowerCase().includes('admin');
}

// ─── inventory ───────────────────────────────────────────────────────────
async function get_inventory_admin({ user }) {
    let activeState = (user.estado || 'pi').toLowerCase();
    if(userIsAdmin(user)) activeState = null;

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
        SELECT * FROM inventory
    `;

    if(activeState){
        query += ` WHERE estado = $1`;
        const { rows } = await pool.query(query, [activeState]);
        return rows;
    }
    const { rows } = await pool.query(query);
    return rows;
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

    const { rows } = await pool.query(query,params);
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
    get_instalations_admin
};
