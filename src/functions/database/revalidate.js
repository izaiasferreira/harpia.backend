const { pi_pool: pool } = require('../../db');
const { getBucketFileUrl } = require('../minio');

const AUDITORIAS_BUCKET = 'auditorias-pi';

function today() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    return `${day}.${month}.${year}`;
}

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
        foto: getBucketFileUrl(AUDITORIAS_BUCKET, row.caminho_foto),
    }));
}

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

    console.log(query, params);
    const { rows } = await pool.query(query, params);
    if (rows.length === 0) { console.log('Nenhuma instalação encontrada.'); return []; }

    const filtered = rows.filter(r => {
        const v = r.validacao;
        const rv = r.revalidacao;
        return (v === 'FALSO' && rv !== 'None') || v === 'VERDADEIRO';
    });

    return filtered.map(row => ({
        instalacao: row.instalacao,
        data_foto: row.data_conclusao,
        hora_foto: row.hora,
        apontamento: row.apontamento,
        foto: getBucketFileUrl(AUDITORIAS_BUCKET, row.caminho_foto),
        validacao: !row.revalidacao || row.revalidacao !== 'None' ? row.revalidacao : row.validacao,
    }));
}

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

// Cache em memória para filter_options — raramente mudam, evita full scan repetido
let _filterOptionsCache = null;
let _filterOptionsCacheAt = 0;
const FILTER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

async function getFilterOptions() {
    const now = Date.now();
    if (_filterOptionsCache && (now - _filterOptionsCacheAt) < FILTER_CACHE_TTL_MS) {
        return _filterOptionsCache;
    }

    let agentes = [], seccionais = [], regionais = [], datas_conclusao = [];

    // --- Datas de conclusão (coluna é TEXT 'DD.MM.YYYY', não DATE) ---
    try {
        const { rows } = await pool.query(`
            SELECT ARRAY(
                SELECT data_conclusao
                FROM (
                    SELECT DISTINCT data_conclusao
                    FROM auditoria
                    WHERE data_conclusao IS NOT NULL
                      AND data_conclusao != ''
                      AND data_conclusao != 'None'
                ) AS unique_dates
                ORDER BY
                  SUBSTRING(data_conclusao, 7, 4) DESC,
                  SUBSTRING(data_conclusao, 4, 2) DESC,
                  SUBSTRING(data_conclusao, 1, 2) DESC
            ) AS datas_conclusao
        `);
        datas_conclusao = rows[0]?.datas_conclusao || [];
    } catch (e) {
        console.error('[getFilterOptions] Erro ao buscar datas de auditoria:', e.message);
    }

    // --- Agentes / Seccionais / Regionais da tabela auditoria (se existirem) ---
    // Se as colunas não existirem, cai no catch e tenta matriz
    try {
        const { rows } = await pool.query(`
            SELECT
              ARRAY(SELECT DISTINCT agente    FROM auditoria WHERE agente    IS NOT NULL AND agente    != '' AND agente    != 'None' ORDER BY 1) AS agentes,
              ARRAY(SELECT DISTINCT seccional FROM auditoria WHERE seccional IS NOT NULL AND seccional != '' AND seccional != 'None' ORDER BY 1) AS seccionais,
              ARRAY(SELECT DISTINCT regional  FROM auditoria WHERE regional  IS NOT NULL AND regional  != '' AND regional  != 'None' ORDER BY 1) AS regionais
        `);
        agentes = rows[0]?.agentes || [];
        seccionais = rows[0]?.seccionais || [];
        regionais = rows[0]?.regionais || [];
    } catch (e) {
        console.warn('[getFilterOptions] auditoria sem colunas agente/seccional/regional — tentando matriz:', e.message);

        // Fallback: busca da matriz, mas limitado às colunas com dados não nulos
        // (mais lento na primeira carga sem índices, mas protegido pelo cache de 5 min)
        try {
            const { rows } = await pool.query(`
                SELECT
                  ARRAY(SELECT DISTINCT agente    FROM matriz WHERE agente    IS NOT NULL AND agente    != '' ORDER BY 1) AS agentes,
                  ARRAY(SELECT DISTINCT seccional FROM matriz WHERE seccional IS NOT NULL AND seccional != '' ORDER BY 1) AS seccionais,
                  ARRAY(SELECT DISTINCT regional  FROM matriz WHERE regional  IS NOT NULL AND regional  != '' ORDER BY 1) AS regionais
            `);
            agentes = rows[0]?.agentes || [];
            seccionais = rows[0]?.seccionais || [];
            regionais = rows[0]?.regionais || [];
        } catch (e2) {
            console.error('[getFilterOptions] Falha também na matriz:', e2.message);
        }
    }

    const result = { agentes, seccionais, regionais, datas_conclusao, validacoes: ['VERDADEIRO', 'FALSO'] };
    _filterOptionsCache = result;
    _filterOptionsCacheAt = now;
    return result;
}


/** Invalida o cache manualmente (útil após imports de dados novos) */
function invalidateFilterOptionsCache() {
    _filterOptionsCache = null;
    _filterOptionsCacheAt = 0;
}

module.exports = {
    getFilesForRevalidate,
    getFilesForView,
    saveRevalidateFile,
    getFilterOptions,
    invalidateFilterOptionsCache,
};
