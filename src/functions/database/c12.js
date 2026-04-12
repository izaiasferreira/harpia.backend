const { pi_pool, ma_pool } = require('../../db');
const { today } = require('../../utils/dates');

// ─── c12Json ────────────────────────────────────────────────────────────────────
async function c12_Json(state = 'pi', region = 'all', dateinit = today(), dateend = today()) {
    try {
        const params = [dateinit, dateend];
        let query = `
            WITH base_calculos AS (
                SELECT 
                    instalacao, etapa, TRIM(seccional) as seccional, TRIM(regional) as regional, TRIM(ntlei) as ntlei, agente, nome_agente, supervisor,
                    status_ds, data_conclusao, latitude, longitude, tipo_perda,
                    -- Histórico por Instalação
                    LAG(ntlei) OVER (PARTITION BY instalacao ORDER BY data_conclusao) as ntlei_ant,
                    LAG(ntlei, 2) OVER (PARTITION BY instalacao ORDER BY data_conclusao) as ntlei_ant2,
                    -- Timeline por Agente (mesmo dia)
                    LAG(data_conclusao) OVER (
                        PARTITION BY agente, data_conclusao::date 
                        ORDER BY data_conclusao
                    ) as conclusao_anterior
                FROM matriz
            ),
            calculo_tempo AS (
                SELECT 
                    *,
                    -- Adicionado ROUND e conversão para INTEGER para remover os .000000
                    COALESCE(
                        ROUND(EXTRACT(EPOCH FROM (data_conclusao - conclusao_anterior)))::INTEGER, 
                        60
                    ) as tempo_execucao_segundos
                FROM base_calculos
            )
            SELECT 
                instalacao, etapa, seccional, regional, ntlei, ntlei_ant, ntlei_ant2, 
                agente, nome_agente, supervisor, status_ds, data_conclusao, latitude, longitude,
                tempo_execucao_segundos,
                -- Formatação HH:MM:SS
                to_char(tempo_execucao_segundos * interval '1 second', 'HH24:MI:SS') as tempo_formatado
            FROM calculo_tempo
            WHERE (data_conclusao::date BETWEEN TO_DATE($1, 'DD.MM.YYYY') AND TO_DATE($2, 'DD.MM.YYYY'))
            AND ntlei = 'C12'
            AND status_ds = 'LG'
            AND tipo_perda NOT LIKE 'CLIENTE CR SEM EVOLUCAO%'
            ORDER BY agente, data_conclusao;
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
    } catch (error) {
        console.error('Erro ao buscar c12_out_hour_Json:', error);
        return [];
    }
}

// ─── C12ToLidoJson ──────────────────────────────────────────────────────────────
async function C12ToLidoJson(state = 'pi', region = 'all', dateinit = today()) {
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
    AND (ntlei_ant = 'C12')
    AND (ntlei_ant2 = 'C12');
  `;


    if (region !== 'all') {
        params.push(region.toUpperCase());
        query += ` AND regional = $${params.length}`;
    }
    const { rows } = state === 'pi' ? await pi_pool.query(query, params) : await ma_pool.query(query, params);
    return rows;
}

// ─── firstC12ForAgent ────────────────────────────────────────────────────────────
async function firstC12ForAgent({ state = 'pi', id, date = today() }) {
    let query = `
   WITH historico_agentes AS (
    SELECT 
        instalacao, etapa, ntlei, agente,
        status_ds, data_conclusao,
        LAG(ntlei) OVER (PARTITION BY instalacao ORDER BY data_conclusao) as ntlei_ant,
        LAG(status_ds) OVER (PARTITION BY instalacao ORDER BY data_conclusao) as status_ant,
        LAG(ntlei, 2) OVER (PARTITION BY instalacao ORDER BY data_conclusao) as ntlei_ant2,
        LAG(status_ds, 2) OVER (PARTITION BY instalacao ORDER BY data_conclusao) as status_ant2
        FROM matriz
    )
    SELECT instalacao, etapa, ntlei, agente, status_ds, data_conclusao
    FROM historico_agentes
    WHERE 
    agente = '${id}'
    AND data_conclusao BETWEEN TO_TIMESTAMP('${date} 00:00:00', 'DD.MM.YYYY HH24:MI:SS') AND TO_TIMESTAMP('${date} 23:59:59', 'DD.MM.YYYY HH24:MI:SS')
    AND ntlei = 'C12'
    AND status_ds = 'LG'
    AND (ntlei_ant  LIKE 'A%' OR ntlei_ant  IN ('B09', 'B10', 'B15') )
    AND (ntlei_ant2  LIKE 'A%' OR ntlei_ant2  IN ('B09', 'B10', 'B15'))
  `;


    const { rows } = state === 'pi' ? await pi_pool.query(query) : await ma_pool.query(query);
    return rows;
}

// ─── licacaoNovaC12ForAgent ─────────────────────────────────────────────────────
async function licacaoNovaC12ForAgent({ state = 'pi', id, date = today() }) {
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
    SELECT instalacao, etapa, seccional, regional, ntlei, agente, nome_agente,
        status_ds, data_conclusao, latitude, longitude
    FROM historico_agentes
    WHERE UPPER(agente) = '${id}'
    AND data_conclusao::date = TO_DATE('${date}', 'DD.MM.YYYY')
    AND ntlei = 'C12'
    AND instalacao LIKE '200%'
    AND status_ds = 'LG'
  `;

    const { rows } = state === 'pi' ? await pi_pool.query(query) : await ma_pool.query(query);
    return rows?.map(r => {
        const dt = new Date(r.data_conclusao);
        r.data_conclusao = dt.toLocaleDateString('pt-BR');
        r.hora_conclusao = dt.toLocaleTimeString('pt-BR', { hour12: false, hour: '2-digit', minute: '2-digit' });
        return r;
    });
}

// ─── fastC12ForAgent ────────────────────────────────────────────────────────────
async function fastC12ForAgent({ state = 'pi', id, date = today() }) {
    let query = `
    WITH timeline_agente AS (
        SELECT 
            *,
            -- Pega a conclusão do serviço anterior do mesmo agente no mesmo dia
            LAG(data_conclusao) OVER (
                PARTITION BY agente, data_conclusao::date 
                ORDER BY data_conclusao
            ) as conclusao_anterior
        FROM matriz
        ),
        calculo_tempo AS (
            SELECT 
                *,
                COALESCE(
                    EXTRACT(EPOCH FROM (data_conclusao - conclusao_anterior)), 
                    60
                ) as tempo_execucao_segundos
            FROM timeline_agente
        )
        SELECT 
            instalacao, etapa, seccional, regional, ntlei, agente, nome_agente, supervisor,
            status_ds, data_conclusao, latitude, longitude,
            tempo_execucao_segundos,
            to_char((tempo_execucao_segundos || ' seconds')::interval, 'HH24:MI:SS') as tempo_formatado
        FROM calculo_tempo
        WHERE UPPER(agente) = '${id}'
        AND data_conclusao::date = TO_DATE('${date}', 'DD.MM.YYYY')
        AND ntlei = 'C12'
        AND tempo_execucao_segundos < 60
        ORDER BY agente, data_conclusao;
  `;


    const { rows } = state === 'pi' ? await pi_pool.query(query) : await ma_pool.query(query);
    return rows?.map(r => {
        const dt = new Date(r.data_conclusao);
        r.data_conclusao = dt.toLocaleDateString('pt-BR');
        r.hora_conclusao = dt.toLocaleTimeString('pt-BR', { hour12: false, hour: '2-digit', minute: '2-digit' });
        return r;
    });
}

module.exports = {
    c12_Json,
    C12ToLidoJson,
    firstC12ForAgent,
    licacaoNovaC12ForAgent,
    fastC12ForAgent
};
