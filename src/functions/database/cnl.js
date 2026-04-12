const { pi_pool, ma_pool } = require('../../db');
const { today } = require('../../utils/dates');

// ─── cnl ────────────────────────────────────────────────────────────────────────
async function cnl(state = 'pi', region = 'all', dateinit = today(), dateend = today()) {
    const params = [dateinit, dateend];
    let query = `
    SELECT instalacao, etapa, seccional, regional, ntlei, concluido, status_ds
    FROM matriz
    WHERE data_conclusao::date
      BETWEEN TO_DATE($1, 'DD.MM.YYYY') AND TO_DATE($2, 'DD.MM.YYYY')
      AND concluido = 'CONCLUIDO'
      AND ntlei NOT LIKE 'A%'
      AND ntlei NOT IN ('B09', 'B10', 'B15')
      AND status_ds = 'LG'
  `;
    if (region !== 'all') {
        params.push(region.toUpperCase());
        query += ` AND regional = $${params.length}`;
    }

    const { rows } = state === 'pi' ? await pi_pool.query(query, params) : await ma_pool.query(query, params);

    if (rows.length === 0) return { type: 'text', text: 'Nenhuma instalação encontrada.' };

    let query_last_update = `
    SELECT data
    FROM vars
    WHERE nome='abap2_hora'
  `;

    const { rows: rows_last_update } = state === 'pi' ? await pi_pool.query(query_last_update) : await ma_pool.query(query_last_update);
    const last_update = rows_last_update[0].data;

    const unified = {};
    for (const row of rows) {
        if (!unified[row.regional]) unified[row.regional] = {};
        if (!unified[row.regional][row.seccional]) unified[row.regional][row.seccional] = [];
        unified[row.regional][row.seccional].push(row);
    }

    let text = `Última atualização: ${last_update}\n\n`;
    for (const reg of Object.keys(unified)) {
        text += `REGIONAL ${reg}\n\n`;
        let total = 0;
        for (const sec of Object.keys(unified[reg])) {
            text += ` - ${sec.trim()} : ${unified[reg][sec].length}\n`;
            total += unified[reg][sec].length;
        }
        text += `\nTOTAL: ${total}\n`;
    }
    return { type: 'text', text };
}

// ─── firstCNLJson ───────────────────────────────────────────────────────────────
async function firstCNLJson(state = 'pi', region = 'all', dateinit = today(), dateend = today()) {
    const params = [dateinit, dateend];
    let query = `
   WITH historico_agentes AS (
    SELECT 
        instalacao, etapa, seccional, regional, ntlei, agente, nome_agente, supervisor,
        status_ds, data_conclusao, latitude, longitude,
        LAG(ntlei) OVER (PARTITION BY instalacao ORDER BY data_conclusao) as ntlei_ant,
        LAG(status_ds) OVER (PARTITION BY instalacao ORDER BY data_conclusao) as status_ant,
        LAG(ntlei, 2) OVER (PARTITION BY instalacao ORDER BY data_conclusao) as ntlei_ant2,
        LAG(status_ds, 2) OVER (PARTITION BY instalacao ORDER BY data_conclusao) as status_ant2
        FROM matriz
    )
    SELECT instalacao, etapa, seccional, regional, ntlei, agente, nome_agente, supervisor,
        status_ds, data_conclusao, latitude, longitude
    FROM historico_agentes
    WHERE data_conclusao::date
        BETWEEN TO_DATE($1, 'DD.MM.YYYY') AND TO_DATE($2, 'DD.MM.YYYY')
    AND (ntlei NOT LIKE 'A%' AND ntlei NOT IN ('B09', 'B10', 'B15'))
    AND (ntlei_ant  LIKE 'A%' OR ntlei_ant  IN ('B09', 'B10', 'B15') )
    AND (ntlei_ant2  LIKE 'A%' OR ntlei_ant2  IN ('B09', 'B10', 'B15'))
  `;


    if (region !== 'all') {
        params.push(region.toUpperCase());
        query += ` AND regional = $${params.length}`;
    }
    const { rows } = state === 'pi' ? await pi_pool.query(query, params) : await ma_pool.query(query, params);
    return rows;
}

// ─── CNLToLidoJson ──────────────────────────────────────────────────────────────
async function CNLToLidoJson(state = 'pi', region = 'all', dateinit = today()) {
    const params = [dateinit];
    let query = `
   WITH historico_agentes AS (
    SELECT 
        instalacao, etapa, seccional, regional, ntlei, agente, nome_agente,
        status_ds, data_conclusao, latitude, longitude,
        LAG(ntlei) OVER (PARTITION BY instalacao ORDER BY data_conclusao) as ntlei_ant,
        LAG(ntlei, 2) OVER (PARTITION BY instalacao ORDER BY data_conclusao) as ntlei_ant2
    FROM matriz
    )
    SELECT instalacao, etapa, seccional, regional, ntlei, agente, nome_agente,
        status_ds, data_conclusao, latitude, longitude
    FROM historico_agentes
    WHERE data_conclusao::date = TO_DATE($1, 'DD.MM.YYYY')
    AND (ntlei LIKE 'A%' OR ntlei IN ('B09', 'B10', 'B15'))
    AND (ntlei_ant NOT LIKE 'A%' AND ntlei_ant NOT IN ('B09', 'B10', 'B15'))
    AND (ntlei_ant2 NOT LIKE 'A%' AND ntlei_ant2 NOT IN ('B09', 'B10', 'B15'));
  `;


    if (region !== 'all') {
        params.push(region.toUpperCase());
        query += ` AND regional = $${params.length}`;
    }
    const { rows } = state === 'pi' ? await pi_pool.query(query, params) : await ma_pool.query(query, params);
    return rows;
}

module.exports = {
    cnl,
    firstCNLJson,
    CNLToLidoJson
};
