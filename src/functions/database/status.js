const { pi_pool, ma_pool } = require('../../db');

// ─── lastUpdate ───────────────────────────────────────────────────────────────
async function lastUpdate(state = 'pi') {
    let query_last_update = `
    SELECT nome as title, data as value
    FROM vars
    WHERE nome in ('abap2_hora', 'abap_hora')
  `;
    var { rows } = state === 'pi' ? await pi_pool.query(query_last_update) : await ma_pool.query(query_last_update);
    let query_last_register = `
    SELECT MAX(data_conclusao) as value
    FROM matriz 
    WHERE TO_CHAR(data_conclusao, 'MM.YYYY') = TO_CHAR(CURRENT_DATE, 'MM.YYYY')
  `;
    const { rows: rows_last_register } = state === 'pi' ? await pi_pool.query(query_last_register) : await ma_pool.query(query_last_register);
    const val = rows_last_register[0]?.value;

    rows.push({ title: 'last_register', value: val ? new Date(val).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }).replace(',', ' às ') : val });

    return rows;
}

module.exports = {
    lastUpdate
};
