require('dotenv').config();
const pool = require('../db');

function today() {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

// ─── pendencias ────────────────────────────────────────────────────────────────
async function pendencias(region = 'all') {
    let query = `
    SELECT instalacao, etapa, seccional, regional, concluido
    FROM matriz
    WHERE concluido = 'PENDENTE'
    AND data_leit_prev LIKE '%' || TO_CHAR(CURRENT_DATE, 'MM.YYYY')
  `;
    const params = [];
    if (region !== 'all') {
        query += ` AND regional = $1`;
        params.push(region.toUpperCase());
    }

    const { rows } = await pool.query(query, params);
    if (rows.length === 0) return { type: 'text', text: 'Nenhuma instalação encontrada.' };

    const unified = {};
    for (const row of rows) {
        if (!unified[row.regional]) unified[row.regional] = {};
        if (!unified[row.regional][row.seccional]) unified[row.regional][row.seccional] = [];
        unified[row.regional][row.seccional].push(row);
    }

    let text = '';
    for (const reg of Object.keys(unified)) {
        let total = 0;
        text += `REGIONAL ${reg}\n`;
        for (const sec of Object.keys(unified[reg])) {
            text += ` - ${sec.trim()} : \n`;
            const etapas = [...new Set(unified[reg][sec].map(r => r.etapa))].sort();
            for (const etapa of etapas) {
                const quant = unified[reg][sec].filter(r => r.etapa === etapa).length;
                text += `  - Etapa ${etapa}: ${quant}\n`;
                total += quant;
            }
        }
        text += `\nTOTAL:${total}\n`;
    }
    return { type: 'text', text };
}

// ─── pendencias_json ────────────────────────────────────────────────────────────
async function pendenciasJson(region = 'all') {
    let query = `
    SELECT instalacao, etapa, seccional, regional, concluido, data_leit_prev, agente, nome_agente
    FROM matriz
    WHERE concluido = 'PENDENTE'
    AND data_leit_prev LIKE '%' || TO_CHAR(CURRENT_DATE, 'MM.YYYY')
  `;
    const params = [];
    if (region !== 'all') {
        query += ` AND regional = $1`;
        params.push(region.toUpperCase());
    }
    const { rows } = await pool.query(query, params);
    return rows;
}

// ─── cnl ────────────────────────────────────────────────────────────────────────
async function cnl(region = 'all', dateinit = today(), dateend = today()) {
    const params = [dateinit, dateend];
    let query = `
    SELECT instalacao, etapa, seccional, regional, ntlei, concluido, status_ds
    FROM matriz
    WHERE TO_DATE(NULLIF(data_leit_prev, '00.00.0000'), 'DD.MM.YYYY')
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

    const { rows } = await pool.query(query, params);
    console.log(rows.length);
    if (rows.length === 0) return { type: 'text', text: 'Nenhuma instalação encontrada.' };

    const unified = {};
    for (const row of rows) {
        if (!unified[row.regional]) unified[row.regional] = {};
        if (!unified[row.regional][row.seccional]) unified[row.regional][row.seccional] = [];
        unified[row.regional][row.seccional].push(row);
    }

    let text = '';
    for (const reg of Object.keys(unified)) {
        text += `REGIONAL ${reg}\n`;
        let total = 0;
        for (const sec of Object.keys(unified[reg])) {
            text += ` - ${sec.trim()} : ${unified[reg][sec].length}\n`;
            total += unified[reg][sec].length;
        }
        text += `\nTOTAL: ${total}\n`;
    }
    return { type: 'text', text };
}

// ─── c12Json ────────────────────────────────────────────────────────────────────
async function c12Json(region = 'all', dateinit = today(), dateend = today()) {
    const params = [dateinit, dateend];
    let query = `
    SELECT instalacao, etapa, seccional, regional, ntlei, agente, nome_agente,
           status_ds, hora_conclusao, latitude, longitude
    FROM matriz
    WHERE TO_DATE(NULLIF(data_leit_prev, '00.00.0000'), 'DD.MM.YYYY')
      BETWEEN TO_DATE($1, 'DD.MM.YYYY') AND TO_DATE($2, 'DD.MM.YYYY')
      AND ntlei = 'C12'
      AND status_ds = 'LG'
  `;
    if (region !== 'all') {
        params.push(region.toUpperCase());
        query += ` AND regional = $${params.length}`;
    }
    const { rows } = await pool.query(query, params);
    return rows;
}

// ─── e02Json ────────────────────────────────────────────────────────────────────
async function e02Json(region = 'all', dateinit = today(), dateend = today()) {
    const params = [dateinit, dateend];
    let query = `
    SELECT instalacao, etapa, seccional, regional, ntlei, agente, nome_agente,
           status_ds, hora_conclusao, latitude, longitude
    FROM matriz
    WHERE TO_DATE(NULLIF(data_leit_prev, '00.00.0000'), 'DD.MM.YYYY')
      BETWEEN TO_DATE($1, 'DD.MM.YYYY') AND TO_DATE($2, 'DD.MM.YYYY')
      AND ntlei = 'E02'
  `;
    if (region !== 'all') {
        params.push(region.toUpperCase());
        query += ` AND regional = $${params.length}`;
    }
    const { rows } = await pool.query(query, params);
    return rows;
}

// ─── c16Json ────────────────────────────────────────────────────────────────────
async function c16Json(region = 'all', dateinit = today(), dateend = today()) {
    const params = [dateinit, dateend];
    let query = `
    SELECT instalacao, etapa, seccional, regional, ntlei, agente, nome_agente,
           status_ds, hora_conclusao, latitude, longitude
    FROM matriz
    WHERE TO_DATE(NULLIF(data_leit_prev, '00.00.0000'), 'DD.MM.YYYY')
      BETWEEN TO_DATE($1, 'DD.MM.YYYY') AND TO_DATE($2, 'DD.MM.YYYY')
      AND ntlei = 'C16'
  `;
    if (region !== 'all') {
        params.push(region.toUpperCase());
        query += ` AND regional = $${params.length}`;
    }
    const { rows } = await pool.query(query, params);
    return rows;
}

// ─── notStartServices ──────────────────────────────────────────────────────────
async function notStartServices() {
    const query = `
    SELECT agente, nome_agente, seccional, regional,
           COUNT(*) FILTER (WHERE concluido = 'PENDENTE') AS total_pendencias,
           TO_CHAR(CURRENT_DATE, 'DD.MM.YYYY') as date
    FROM matriz
    WHERE data_leit_prev LIKE '%' || TO_CHAR(CURRENT_DATE, 'MM.YYYY')
      AND agente <> ''
    GROUP BY agente, nome_agente, seccional, regional
    HAVING
      COUNT(*) FILTER (WHERE concluido = 'CONCLUIDO' AND data_conclusao = TO_CHAR(CURRENT_DATE, 'DD.MM.YYYY')) = 0
      AND COUNT(*) FILTER (WHERE concluido = 'PENDENTE') > 0
  `;
    const { rows } = await pool.query(query);
    return rows;
}

// ─── completedServices ────────────────────────────────────────────────────────
async function completedServices() {
    const query = `
    SELECT agente, nome_agente, seccional, regional,
           COUNT(*) FILTER (WHERE concluido = 'CONCLUIDO') AS total_concluidas,
           TO_CHAR(CURRENT_DATE, 'DD.MM.YYYY') as date
    FROM matriz
    WHERE data_leit_prev LIKE '%' || TO_CHAR(CURRENT_DATE, 'MM.YYYY')
      AND agente <> ''
    GROUP BY agente, nome_agente, seccional, regional
    HAVING
      COUNT(*) FILTER (WHERE concluido = 'CONCLUIDO' AND data_conclusao = TO_CHAR(CURRENT_DATE, 'DD.MM.YYYY')) > 0
      AND COUNT(*) FILTER (WHERE concluido = 'PENDENTE') = 0
  `;
    const { rows } = await pool.query(query);
    return rows;
}

// ─── perdas ────────────────────────────────────────────────────────────────────
async function perdas(region = 'all', dateinit = today(), dateend = today()) {
    const params = [dateinit, dateend];
    let query = `
    SELECT instalacao, etapa, seccional, regional, ntlei,
           apontamento, tem_perda, motivo_perda, perda_prevista_mensal
    FROM matriz
    WHERE TO_DATE(NULLIF(data_leit_prev, '00.00.0000'), 'DD.MM.YYYY')
      BETWEEN TO_DATE($1, 'DD.MM.YYYY') AND TO_DATE($2, 'DD.MM.YYYY')
      AND tem_perda = 'PERDA'
      AND perda_prevista_mensal <> '0'
  `;
    if (region !== 'all') {
        params.push(region.toUpperCase());
        query += ` AND regional = $${params.length}`;
    }

    const { rows } = await pool.query(query, params);
    if (rows.length === 0) return { type: 'text', text: 'Nenhuma instalação encontrada.' };

    const unified = {};
    for (const row of rows) {
        if (!unified[row.regional]) unified[row.regional] = {};
        if (!unified[row.regional][row.seccional]) unified[row.regional][row.seccional] = [];
        unified[row.regional][row.seccional].push(row);
    }

    let text = '';
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
async function perdasJson(region = 'all', dateinit = today(), dateend = today()) {
    const params = [dateinit, dateend];
    let query = `
    SELECT instalacao, etapa, seccional, regional, motivo_perda,
           perda_prevista_mensal, agente, nome_agente, latitude, longitude
    FROM matriz
    WHERE TO_DATE(NULLIF(data_leit_prev, '00.00.0000'), 'DD.MM.YYYY')
      BETWEEN TO_DATE($1, 'DD.MM.YYYY') AND TO_DATE($2, 'DD.MM.YYYY')
      AND tem_perda = 'PERDA'
      AND perda_prevista_mensal <> '0'
  `;
    if (region !== 'all') {
        params.push(region.toUpperCase());
        query += ` AND regional = $${params.length}`;
    }
    const { rows } = await pool.query(query, params);
    return rows;
}

// ─── getInstallation ──────────────────────────────────────────────────────────
async function getInstallation(insts) {
    const query = `
    SELECT INSTALACAO, CONTA_CONTRATO, MEDIDOR, NOME, ENDERECO, COMPLEMENTO,
           BAIRRO, LOCALIDADE, CEP, PONTO_REFERENCIA, TEL_MOVEL, LATITUDE, LONGITUDE,
           LTRIM(MEDIDOR_ANTERIOR, '0') AS MEDIDOR_ANTERIOR,
           LTRIM(MEDIDOR_POSTERIOR, '0') AS MEDIDOR_POSTERIOR
    FROM cadastro
    WHERE LTRIM(INSTALACAO, '0') = LTRIM($1, '0')
  `;
    console.log(query);
    const { rows } = await pool.query(query, [String(insts)]);
    if (rows.length === 0) return [];
    const d = rows[0];
    return {
        instalacao: d.instalacao,
        conta_contrato: d.conta_contrato,
        medidor: d.medidor,
        nome: d.nome,
        endereco: d.endereco,
        complemento: d.complemento,
        bairro: d.bairro,
        localidade: d.localidade,
        cep: d.cep,
        ponto_referencia: d.ponto_referencia,
        contato: d.tel_movel,
        medidor_anterior: d.medidor_anterior,
        medidor_posterior: d.medidor_posterior,
        localizacao: `https://www.google.com/maps?q=${d.latitude},${d.longitude}`,
    };
}

// ─── getFilesForRevalidate ────────────────────────────────────────────────────
async function getFilesForRevalidate() {
    const query = `
    SELECT *
    FROM auditoria
    WHERE VALIDACAO = 'FALSO'
    AND revalidacao = 'None'
  `;
    const { rows } = await pool.query(query);
    if (rows.length === 0) return [];
    console.log(rows[0]);
    return rows.map(row => ({
        instalacao: row.instalacao,
        data_foto: row.data_conclusao,
        hora_foto: row.hora,
        apontamento: row.apontamento,
        foto: process.env.API_URL + '/' + row.caminho_foto,
    }));
}

// ─── getFilesForView ──────────────────────────────────────────────────────────
async function getFilesForView(date = today(), regional = null, seccional = null, agent = null, validacao = null) {
    date = date.replace('/', '.');
    const params = [date];
    let query = `
    SELECT *
    FROM auditoria
    WHERE data_conclusao = $1
    AND validacao <> 'None'
  `;
    if (regional) { params.push(regional.toUpperCase()); query += ` AND regional = $${params.length}`; }
    if (seccional) { params.push(seccional.toUpperCase()); query += ` AND seccional = $${params.length}`; }
    if (agent) { params.push(agent.toUpperCase()); query += ` AND agente = $${params.length}`; }
    if (validacao) { params.push(validacao.toUpperCase()); query += ` AND validacao = $${params.length}`; }

    const { rows } = await pool.query(query, params);
    if (rows.length === 0) { console.log('Nenhuma instalação encontrada.'); return []; }

    const filtered = rows.filter(r => {
        const v = r.validacao;
        const rv = r.revalidacao;
        return (v === 'FALSO' && rv !== 'None') || v === 'VERDADEIRO';
    });

    return filtered.map(row => ({
        instalacao: row.instalacao,
        data_foto: row.data_foto,
        hora_foto: row.hora_foto,
        apontamento: row.apontamento,
        foto: process.env.API_URL + '/' + row.foto,
        validacao: row.validacao,
    }));
}

// ─── saveRevalidateFile ───────────────────────────────────────────────────────
async function saveRevalidateFile(instalacao, data, validation) {
    const query = `
    UPDATE auditoria
    SET revalidacao = $1
    WHERE instalacao = $2
    AND data_conclusao = $3
  `;
    await pool.query(query, [validation, instalacao, data]);
    return { status: 'success' };
}

// ─── getFilterOptions ─────────────────────────────────────────────────────────
async function getFilterOptions() {
    const query = `
    SELECT
      (SELECT array_agg(DISTINCT agente) FROM matriz WHERE agente IS NOT NULL AND agente != '') AS agentes,
      (SELECT array_agg(DISTINCT seccional) FROM matriz WHERE seccional IS NOT NULL AND seccional != '') AS seccionais,
      (SELECT array_agg(DISTINCT regional) FROM matriz WHERE regional IS NOT NULL AND regional != '') AS regionais,
      (SELECT array_agg(DISTINCT data_conclusao) FROM matriz WHERE data_conclusao IS NOT NULL AND data_conclusao != '') AS datas_conclusao
  `;
    const { rows } = await pool.query(query);
    const res = rows[0];
    return {
        agentes: res.agentes || [],
        seccionais: res.seccionais || [],
        regionais: res.regionais || [],
        datas_conclusao: res.datas_conclusao || [],
        validacoes: ['VERDADEIRO', 'FALSO'],
    };
}

module.exports = {
    pendencias,
    pendenciasJson,
    cnl,
    c12Json,
    e02Json,
    c16Json,
    notStartServices,
    completedServices,
    perdas,
    perdasJson,
    getInstallation,
    getFilesForRevalidate,
    getFilesForView,
    saveRevalidateFile,
    getFilterOptions,
};
