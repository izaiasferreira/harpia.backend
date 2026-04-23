const { pi_pool, ma_pool } = require('../../db');
const { today } = require('../../utils/dates');

// ─── e02Json ────────────────────────────────────────────────────────────────────
async function e02Json(state = 'pi', region = 'all', dateinit = today(), dateend = today()) {
    const params = [dateinit, dateend];
    let query = `
    SELECT instalacao, etapa, seccional, regional, ntlei, agente, nome_agente, supervisor,
           status_ds, data_conclusao, latitude, longitude, data_leit_prev
    FROM matriz
    WHERE data_conclusao::date
      BETWEEN TO_DATE($1, 'DD.MM.YYYY') AND TO_DATE($2, 'DD.MM.YYYY')
      AND ntlei = 'E02'
  `;
    if (region !== 'all') {
        params.push(region.toUpperCase());
        query += ` AND regional = $${params.length}`;
    }
    const { rows } = state === 'pi' ? await pi_pool.query(query, params) : await ma_pool.query(query, params);
    return rows?.map(r => {
        const dt = new Date(r.data_conclusao);
        r.data_conclusao = dt.toLocaleDateString('pt-BR');
        r.hora_conclusao = dt.toLocaleTimeString('pt-BR', { hour12: false, hour: '2-digit', minute: '2-digit' });
        r.data_leit_prev = new Date(r.data_leit_prev).toLocaleDateString('pt-BR');
        return r;
    });
}

// ─── c16Json ────────────────────────────────────────────────────────────────────
async function c16Json(state = 'pi', region = 'all', dateinit = today(), dateend = today()) {
    const params = [dateinit, dateend];
    let query = `
    SELECT instalacao, etapa, seccional, regional, ntlei, agente, nome_agente, supervisor,
           status_ds, data_conclusao, latitude, longitude, data_leit_prev
    FROM matriz
    WHERE data_conclusao::date
      BETWEEN TO_DATE($1, 'DD.MM.YYYY') AND TO_DATE($2, 'DD.MM.YYYY')
      AND ntlei = 'C16'
  `;
    if (region !== 'all') {
        params.push(region.toUpperCase());
        query += ` AND regional = $${params.length}`;
    }
    const { rows } = state === 'pi' ? await pi_pool.query(query, params) : await ma_pool.query(query, params);
    return rows?.map(r => {
        const dt = new Date(r.data_conclusao);
        r.data_conclusao = dt.toLocaleDateString('pt-BR');
        r.hora_conclusao = dt.toLocaleTimeString('pt-BR', { hour12: false, hour: '2-digit', minute: '2-digit' });
        r.data_leit_prev = new Date(r.data_leit_prev).toLocaleDateString('pt-BR');
        return r;
    });
}

module.exports = {
    e02Json,
    c16Json
};
