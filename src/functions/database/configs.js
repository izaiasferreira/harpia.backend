const { pi_pool, ma_pool } = require('../../db');

/**
 * Obtém a conexão (pool) do banco de acordo com o estado
 * @param {string} state - 'pi' ou 'ma'
 */
function getPoolByState(state) {
    const s = String(state).toLowerCase();
    if (s === 'ma') return ma_pool;
    return pi_pool;
}

/**
 * Lista todas as etapas de leitura de um estado, ordenadas numericamente
 * @param {string} state - 'pi' ou 'ma'
 */
async function listEtapas(state) {
    const pool = getPoolByState(state);
    const query = 'SELECT etapa, data FROM etapas';
    const { rows } = await pool.query(query);

    // Ordenação robusta no Javascript
    return rows.sort((a, b) => {
        const numA = parseInt(a.etapa) || 9999;
        const numB = parseInt(b.etapa) || 9999;
        return numA - numB;
    });
}

/**
 * Atualiza a data de uma etapa de leitura
 * @param {string} state - 'pi' ou 'ma'
 * @param {string} etapa - Identificador da etapa (ex: '1' ou '12,28,43')
 * @param {string} data - Nova data formatada como DD/MM/YYYY (ex: '05/05/2026')
 */
async function updateEtapa(state, etapa, data) {
    const pool = getPoolByState(state);
    const query = 'UPDATE etapas SET data = $1 WHERE etapa = $2 RETURNING *';
    const { rows } = await pool.query(query, [data, etapa]);
    return rows[0];
}

/**
 * Lista todos os feriados de um estado, ordenados cronologicamente
 * @param {string} state - 'pi' ou 'ma'
 */
async function listFeriados(state) {
    const pool = getPoolByState(state);
    const query = 'SELECT id, date FROM feriados';
    const { rows } = await pool.query(query);

    // Ordenação cronológica baseada no formato DD/MM/YYYY
    return rows.sort((a, b) => {
        if (!a.date) return 1;
        if (!b.date) return -1;
        const [dA, mA, yA] = a.date.split('/').map(Number);
        const [dB, mB, yB] = b.date.split('/').map(Number);
        const dateA = new Date(yA, mA - 1, dA);
        const dateB = new Date(yB, mB - 1, dB);
        return dateA - dateB;
    });
}

/**
 * Adiciona um novo feriado na base de dados
 * @param {string} state - 'pi' ou 'ma'
 * @param {string} date - Data do feriado formatada como DD/MM/YYYY (ex: '12/10/2026')
 */
async function addFeriado(state, date) {
    const pool = getPoolByState(state);
    const query = 'INSERT INTO feriados (date) VALUES ($1) RETURNING *';
    const { rows } = await pool.query(query, [date]);
    return rows[0];
}

/**
 * Exclui um feriado da base de dados pelo seu ID
 * @param {string} state - 'pi' ou 'ma'
 * @param {number|string} id - ID do feriado
 */
async function deleteFeriado(state, id) {
    const pool = getPoolByState(state);
    const query = 'DELETE FROM feriados WHERE id = $1 RETURNING *';
    const { rows } = await pool.query(query, [parseInt(id, 10)]);
    return rows.length > 0;
}

module.exports = {
    listEtapas,
    updateEtapa,
    listFeriados,
    addFeriado,
    deleteFeriado
};
