const { pi_pool, ma_pool } = require('../../db');
const { today } = require('../../utils/dates');

// ─── perdas ────────────────────────────────────────────────────────────────────
async function perdas(state = 'pi', region = 'all', dateinit = today(), dateend = today()) {
    const params = [dateinit, dateend];
    let query = `
    SELECT instalacao, etapa, seccional, regional, ntlei,
           apontamento, tem_perda, motivo_perda, perda_prevista_mensal
    FROM matriz
    WHERE data_conclusao::date
      BETWEEN TO_DATE($1, 'DD.MM.YYYY') AND TO_DATE($2, 'DD.MM.YYYY')
      AND tem_perda = 'PERDA'
      AND perda_prevista_mensal <> '0'
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
        text += `REGIONAL ${reg}\n`;
        let perdaRegional = 0;
        for (const sec of Object.keys(unified[reg])) {
            const perdaSeccional = unified[reg][sec].reduce((acc, r) => acc + parseInt(r.perda_prevista_mensal || 0), 0);
            perdaRegional += perdaSeccional;
            text += ` - ${sec.trim()} : ${perdaSeccional} kWh\n`;
        }
        text += `\nTOTAL: ${perdaRegional} kWh\n`;
    }
    return { type: 'text', text };
}

// ─── perdasJson ───────────────────────────────────────────────────────────────
async function perdasJson(state = 'pi', region = 'all', dateinit = today(), dateend = today()) {
    const params = [dateinit, dateend];
    let query = `
    SELECT instalacao, etapa, seccional, regional, motivo_perda,
           perda_prevista_mensal, agente, nome_agente, latitude, longitude, data_conclusao, supervisor, tipo_perda,status_perda, ntlei as apontamento_atual, apontamento as apontamento_anterior, grupo_cnl
    FROM matriz
    WHERE data_conclusao::date
      BETWEEN TO_DATE($1, 'DD.MM.YYYY') AND TO_DATE($2, 'DD.MM.YYYY')
      AND tem_perda = 'PERDA'
      AND perda_prevista_mensal <> '0'
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
        return r;
    });
}

module.exports = {
    perdas,
    perdasJson
};
