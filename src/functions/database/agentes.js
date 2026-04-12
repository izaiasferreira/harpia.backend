const { pi_pool, ma_pool, localizacoes_pi_pool } = require('../../db');
const { today } = require('../../utils/dates');

// ─── orderLeituras (Helper) ───────────────────────────────────────────────────
function orderLeituras(rows) {
    const ordenados = rows.sort((a, b) => new Date(a.data_conclusao) - new Date(b.data_conclusao));
    let prevDt = null;
    return ordenados.reduce((acc, r) => {
        const dt = new Date(r.data_conclusao);
        let diff = 60;

        if (prevDt) {
            diff = Math.floor((dt - prevDt) / 1000);

            if (diff < 0) diff = 60;
        }

        prevDt = dt;

        const h = Math.floor(diff / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const s = diff % 60;

        r.tempo_execucao = [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
        r.data_conclusao = dt.toLocaleDateString('pt-BR');
        r.hora_conclusao = dt.toLocaleTimeString('pt-BR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        r.time = dt.toLocaleTimeString('pt-BR', { hour12: false });

        acc.push(r);
        return acc;
    }, []);
}

// ─── getLeiturasForAgent ───────────────────────────────────────────────────────
async function getLeiturasForAgent({ state = 'pi', id, date = today(), page = 1, limit = 20, filter = 'all' }) {
    const result = [];

    if (filter === 'pending') {
        return getLeiturasPendingForAgent({ state, id, date, page, limit });
    }

    if (filter === 'all') {
        const query_all = `
            SELECT 
            instalacao, 
            etapa, 
            ntlei, 
            data_conclusao, 
            data_leit_prev, 
            agente,
            tem_perda, 
            perda_prevista_mensal, 
            nome_agente, 
            latitude, 
            longitude
        FROM matriz
        WHERE agente IN ('${id?.toUpperCase()}', '${id?.toLowerCase()}')
        AND data_conclusao::date = TO_DATE('${date}', 'DD.MM.YYYY')
        ORDER BY data_conclusao ASC
        LIMIT ${limit} OFFSET ${(page - 1) * limit};`;

        const { rows } = state === 'pi' ? await pi_pool.query(query_all) : await ma_pool.query(query_all);
        if (rows.length === 0) return [];
        result.push(...orderLeituras(rows));
    }

    if (filter === 'cnl') {
        const query_all = `
            WITH historico_completo AS (
                SELECT 
                    instalacao, etapa, ntlei, data_conclusao, data_leit_prev,concluido, agente,tem_perda, perda_prevista_mensal, nome_agente, latitude, longitude
                FROM matriz
                WHERE agente IN ('${id?.toUpperCase()}', '${id?.toLowerCase()}')
                AND ntlei NOT LIKE 'A%'
                AND ntlei NOT IN ('B09', 'B10', 'B15')
                AND data_conclusao::date = TO_DATE('${date}', 'DD.MM.YYYY')
            )
            SELECT *
            FROM historico_completo
            LIMIT ${limit} OFFSET ${(page - 1) * limit}`;

        const { rows } = state === 'pi' ? await pi_pool.query(query_all) : await ma_pool.query(query_all);
        if (rows.length === 0) return [];
        result.push(...orderLeituras(rows));
    }

    if (filter === 'c12') {
        const query_all = `
            WITH historico_completo AS (
                SELECT 
                    instalacao, etapa, ntlei, data_conclusao, data_leit_prev, agente,tem_perda, perda_prevista_mensal, nome_agente, latitude, longitude
                FROM matriz
                WHERE agente IN ('${id?.toUpperCase()}', '${id?.toLowerCase()}')
                AND ntlei = 'C12'
                AND data_conclusao::date = TO_DATE('${date}', 'DD.MM.YYYY')
            )
            SELECT *
            FROM historico_completo
            LIMIT ${limit} OFFSET ${(page - 1) * limit}`;

        const { rows } = state === 'pi' ? await pi_pool.query(query_all) : await ma_pool.query(query_all);
        if (rows.length === 0) return [];
        result.push(...orderLeituras(rows));

    }

    if (filter === 'c12_out_time') {
        const query_all = `
            WITH historico_completo AS (
                SELECT 
                    instalacao, etapa, ntlei, data_conclusao, data_leit_prev, agente,tem_perda, perda_prevista_mensal, nome_agente, latitude, longitude
                FROM matriz
                WHERE agente IN ('${id?.toUpperCase()}', '${id?.toLowerCase()}')
                AND ntlei = 'C12'
                AND data_conclusao::date = TO_DATE('${date}', 'DD.MM.YYYY')
            )
            SELECT *
            FROM historico_completo
            LIMIT ${limit} OFFSET ${(page - 1) * limit}`;

        const { rows } = state === 'pi' ? await pi_pool.query(query_all) : await ma_pool.query(query_all);
        if (rows.length === 0) return [];
        result.push(...rows);

    }

    if (filter === 'c12_ligacao_nova') {
        const query_all = `
            WITH historico_completo AS (
                SELECT 
                    instalacao, etapa, ntlei, data_conclusao, data_leit_prev, agente,tem_perda, perda_prevista_mensal, nome_agente, latitude, longitude
                FROM matriz
                WHERE agente IN ('${id?.toUpperCase()}', '${id?.toLowerCase()}')
                AND ntlei = 'C12'
                AND instalacao LIKE '200%'
                AND data_conclusao::date = TO_DATE('${date}', 'DD.MM.YYYY')
            )
            SELECT *
            FROM historico_completo
            LIMIT ${limit} OFFSET ${(page - 1) * limit}`;

        const { rows } = state === 'pi' ? await pi_pool.query(query_all) : await ma_pool.query(query_all);
        if (rows.length === 0) return [];
        result.push(...orderLeituras(rows));

    }

    if (filter === 'fast_c12') {
        const query_all = `
            WITH historico_completo AS (
                SELECT 
                    instalacao, etapa, ntlei, data_conclusao, data_leit_prev, agente,tem_perda, perda_prevista_mensal, nome_agente, latitude, longitude
                FROM matriz
                WHERE agente IN ('${id?.toUpperCase()}', '${id?.toLowerCase()}')
                AND ntlei = 'C12'
                AND data_conclusao::date = TO_DATE('${date}', 'DD.MM.YYYY')
            )
            SELECT *
            FROM historico_completo
            LIMIT ${limit} OFFSET ${(page - 1) * limit}`;
        const { rows } = state === 'pi' ? await pi_pool.query(query_all) : await ma_pool.query(query_all);
        if (rows.length === 0) return [];
        const ordered = orderLeituras(rows);
        result.push(...ordered.filter(r => {
            const parts = r.tempo_execucao.split(':');
            const totalSeconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
            return totalSeconds < 60;
        }));

    }

    if (filter === 'first_c12') {
        const query_all = `
            WITH historico_agentes AS (
                SELECT 
                    instalacao, etapa, ntlei, data_conclusao, data_leit_prev, agente, tem_perda, perda_prevista_mensal, nome_agente, latitude, longitude,
                    status_ds,
                    LAG(ntlei) OVER (PARTITION BY instalacao ORDER BY data_conclusao) as ntlei_ant,
                    LAG(ntlei, 2) OVER (PARTITION BY instalacao ORDER BY data_conclusao) as ntlei_ant2
                FROM matriz
            )
            SELECT instalacao, etapa, ntlei, data_conclusao, data_leit_prev, agente, tem_perda, nome_agente, latitude, longitude
            FROM historico_agentes
            WHERE agente IN ('${id?.toUpperCase()}', '${id?.toLowerCase()}')
            AND data_conclusao::date = TO_DATE('${date}', 'DD.MM.YYYY')
            AND ntlei = 'C12'
            AND status_ds = 'LG'
            AND (ntlei_ant LIKE 'A%' OR ntlei_ant IN ('B09', 'B10', 'B15'))
            AND (ntlei_ant2 LIKE 'A%' OR ntlei_ant2 IN ('B09', 'B10', 'B15'))
            LIMIT ${limit} OFFSET ${(page - 1) * limit}`;
        const { rows } = state === 'pi' ? await pi_pool.query(query_all) : await ma_pool.query(query_all);
        if (rows.length === 0) return [];
        result.push(...orderLeituras(rows));
    }

    return result;

}

// ─── getLeiturasPendingForAgent ───────────────────────────────────────────────
async function getLeiturasPendingForAgent({ state = 'pi', id, date = today(), page = 1, limit = 20 }) {
    const query_all = `
            SELECT 
            instalacao, 
            etapa, 
            ntlei, 
            data_conclusao, 
            data_leit_prev, 
            agente,
            tem_perda, 
            perda_prevista_mensal, 
            nome_agente, 
            latitude, 
            longitude
        FROM matriz
        WHERE agente IN ('${id?.toUpperCase()}', '${id?.toLowerCase()}')
        AND data_leit_prev::date = TO_DATE('${date.slice(3, 10)}', 'MM.YYYY')
        LIMIT ${limit} OFFSET ${(page - 1) * limit};`;

    const { rows } = state === 'pi' ? await pi_pool.query(query_all) : await ma_pool.query(query_all);
    if (rows.length === 0) return [];
    return rows;
}

// ─── getCalendarForAgent ──────────────────────────────────────────────────────
async function getCalendarForAgent({ state = 'pi' }) {
    const query = `
    SELECT 
        *
    FROM etapas
    `;
    const { rows } = state === 'pi' ? await pi_pool.query(query) : await ma_pool.query(query);
    return rows;
}

// ─── getAgentTelegramId ───────────────────────────────────────────────────────
async function getAgentTelegramId({ state = 'pi', id }) {
    const query = `
    SELECT * 
    FROM login 
    WHERE id in ('${id.toUpperCase()}', '${id.toLowerCase()}')
    `;

    const { rows } = await pi_pool.query(query);
    return rows;
}

// ─── get_instalations ──────────────────────────────────────────────────────────
async function get_instalations({ state, query = [], type }) {
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

// ─── get_predicted ─────────────────────────────────────────────────────────────
async function get_predicted({ state = 'pi', id, status = 'PENDENTE', page = 1, limit = 100 }) {
    const offset = (page - 1) * limit;
    const query = `
        SELECT 
            instalacao, 
            etapa, 
            seccional, 
            regional, 
            agente, 
            nome_agente, 
            ntlei, 
            apontamento, 
            perda_prevista_mensal, 
            tipo_perda, 
            status_perda, 
            tem_perda, 
            concluido,
            TO_CHAR(data_leit_prev, 'DD/MM/YYYY') as data_leit_prev,
            TO_CHAR(data_conclusao, 'DD/MM/YYYY') as data_conclusao,
            TO_CHAR(data_conclusao, 'HH24:MI') as hora_conclusao,
            CASE 
                WHEN tipo_perda LIKE '%87%' THEN 'LER OU APONTAR ' || COALESCE(apontamento, '')
                WHEN tipo_perda LIKE '%113%' AND status_perda = 'SEM PERDA' THEN 'LER OU APONTAR ' || COALESCE(apontamento, '')
                ELSE 'LER OU ENTRAR EM CONTATO COM A MONITORIA'
            END as action,
            motivo_perda
        FROM matriz 
        WHERE agente IN ($1, $2)
        AND concluido = $3
        AND (CASE WHEN perda_prevista_mensal::TEXT ~ '^[0-9]' THEN REPLACE(perda_prevista_mensal::TEXT, ',', '.')::NUMERIC ELSE 0 END) > 0
        ORDER BY (CASE WHEN etapa::TEXT ~ '^[0-9]' THEN etapa::TEXT::NUMERIC ELSE 9999 END) ASC, data_leit_prev ASC
        LIMIT $4 OFFSET $5
    `;

    const values = [id.toUpperCase(), id.toLowerCase(), status, limit, offset];
    const { rows } = state === 'pi' ? await pi_pool.query(query, values) : await ma_pool.query(query, values);

    if (rows.length === 0) return [];

    const rows_ids = rows.map(r => r.instalacao);
    const rows_instalations = await get_instalations({ state, query: rows_ids, type: 'instalacao' });

    const result = rows.map((r, i) => {
        const instalation = rows_instalations.find(i => i.instalacao === r.instalacao);
        if (instalation) {
            r['lat_cad'] = instalation.lat_cad;
            r['long_cad'] = instalation.long_cad;
            r['lat_leitura'] = instalation.lat_leitura;
            r['long_leitura'] = instalation.long_leitura;
            r['lat_lig'] = instalation.lat_lig;
            r['long_lig'] = instalation.long_lig;
        }
        return r;
    });

    return result;
}

module.exports = {
    getLeiturasForAgent,
    getLeiturasPendingForAgent,
    getCalendarForAgent,
    getAgentTelegramId,
    get_instalations,
    get_predicted
};
