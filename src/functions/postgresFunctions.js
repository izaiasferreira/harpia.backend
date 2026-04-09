require('dotenv').config();
const { pi_pool, ma_pool, localizacoes_pi_pool } = require('../db');
const { today } = require('../utils/dates');


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

// ─── pendencias ────────────────────────────────────────────────────────────────
async function pendencias(state = 'pi', region = 'all') {
    let query = `
    SELECT instalacao, etapa, seccional, regional, concluido
    FROM matriz
    WHERE concluido = 'PENDENTE'
    AND TO_CHAR(data_leit_prev, 'MM.YYYY') = TO_CHAR(CURRENT_DATE, 'MM.YYYY')
  `;
    const params = [];
    if (region !== 'all') {
        query += ` AND regional = $1`;
        params.push(region.toUpperCase());
    }

    const { rows } = state === 'pi' ? await pi_pool.query(query, params) : await ma_pool.query(query, params);
    if (rows.length === 0) return { type: 'text', text: 'Nenhuma instalação encontrada.' };

    let query_last_update = `
    SELECT data
    FROM vars
    WHERE nome='abap_hora'
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
        let total = 0;
        text += `REGIONAL ${reg}\n\n`;
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

async function pontualidade(state = 'pi', region = 'all') {
    let query = `
    SELECT *
    FROM matriz
    WHERE TO_CHAR(data_leit_prev, 'MM.YYYY') = TO_CHAR(CURRENT_DATE, 'MM.YYYY')
  `;
    const params = [];
    if (region !== 'all') {
        query += ` AND regional = $1`;
        params.push(region.toUpperCase());
    }

    const { rows } = state === 'pi' ? await pi_pool.query(query, params) : await ma_pool.query(query, params);
    if (rows.length === 0) return { type: 'text', text: 'Nenhuma instalação encontrada.' };

    let query_last_update = `
    SELECT data
    FROM vars
    WHERE nome='abap_hora'
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
        let total_concluido = 0;
        let total_geral = 0;
        text += `REGIONAL ${reg}\n\n`;
        for (const sec of Object.keys(unified[reg])) {
            text += ` - *${sec.trim()} :* \n`;
            const etapas = [...new Set(unified[reg][sec].map(r => r.etapa))].sort();
            for (const etapa of etapas) {
                const data_prev = unified[reg][sec].filter(r => r.etapa === etapa)[0].data_leit_prev;
                console.log(data_prev, etapa);
                const now = new Date();

                const dataPrevDate = new Date(data_prev);
                const limitePontualidade = new Date(dataPrevDate);
                limitePontualidade.setDate(limitePontualidade.getDate() + 1);
                limitePontualidade.setHours(10, 0, 0, 0);
                
                const aindaNaJanela = now <= limitePontualidade;
                
                const quant_total = unified[reg][sec].filter(r => r.etapa === etapa).length;
                const quant_concluido = unified[reg][sec].filter(r => {
                    if (r.etapa !== etapa || r.concluido !== 'CONCLUIDO') return false;
                    const dataPrev = new Date(r.data_leit_prev);
                    const dataConclusao = new Date(r.data_conclusao);
                    const limite = new Date(dataPrev);
                    limite.setDate(limite.getDate() + 1);
                    limite.setHours(10, 0, 0, 0);
                    return dataConclusao <= limite;
                }).length;

                const quant_pendente = unified[reg][sec].filter(r => r.etapa === etapa && r.concluido === 'PENDENTE').length;

                const is_parcial = quant_pendente > 0 && quant_pendente < quant_total && aindaNaJanela;
                
                text += `> Etapa ${etapa}: ${((quant_concluido / quant_total) * 100).toFixed(2)}% ${is_parcial ? `(Parcial)` : ''}\n`;
                text += `> NP: ${quant_concluido} | FP: ${quant_total - quant_concluido - quant_pendente} | PEND: ${quant_pendente}\n\n`;
                total_concluido += quant_concluido;
                total_geral += quant_total;
            }
        }
        text += `\nTOTAL: ${((total_concluido / total_geral) * 100).toFixed(2)}%\n`;
    }
    return { type: 'text', text };
}

// ─── pendencias_json ────────────────────────────────────────────────────────────
async function pendenciasJson(state = 'pi', region = 'all') {
    let query = `
    SELECT instalacao, etapa, seccional, regional, concluido, data_leit_prev, agente, nome_agente, supervisor
    FROM matriz
    WHERE concluido = 'PENDENTE'
    AND TO_CHAR(data_leit_prev, 'MM.YYYY') = TO_CHAR(CURRENT_DATE, 'MM.YYYY')
  `;
    const params = [];
    if (region !== 'all') {
        query += ` AND regional = $1`;
        params.push(region.toUpperCase());
    }
    const { rows } = state === 'pi' ? await pi_pool.query(query, params) : await ma_pool.query(query, params);
    return rows;
}

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

// ─── c12Json ────────────────────────────────────────────────────────────────────
async function c12_out_hour_Json(state = 'pi', region = 'all', dateinit = today(), dateend = today()) {
    const params = [dateinit, dateend];
    let query = `
    SELECT instalacao, etapa, seccional, regional, ntlei, agente, nome_agente, supervisor,
           status_ds, data_conclusao, latitude, longitude
    FROM matriz
    WHERE data_conclusao::date
      BETWEEN TO_DATE($1, 'DD.MM.YYYY') AND TO_DATE($2, 'DD.MM.YYYY')
      AND ntlei = 'C12'
      AND status_ds = 'LG'
      AND tipo_perda NOT LIKE 'CLIENTE CR SEM EVOLUCAO%'
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

async function firstC12Json(state = 'pi', region = 'all', dateinit = today(), dateend = today()) {
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
    AND ntlei = 'C12'
    AND status_ds = 'LG'
    AND (ntlei_ant  LIKE 'A%' OR ntlei_ant  IN ('B09', 'B10', 'B15') )
    AND (ntlei_ant2  LIKE 'A%' OR ntlei_ant2  IN ('B09', 'B10', 'B15'))
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

async function licacaoNovaC12Json(state = 'pi', region = 'all', dateinit = today(), dateend = today()) {
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
    SELECT instalacao, etapa, seccional, regional, ntlei, agente, nome_agente,
        status_ds, data_conclusao, latitude, longitude
    FROM historico_agentes
    WHERE data_conclusao::date
        BETWEEN TO_DATE($1, 'DD.MM.YYYY') AND TO_DATE($2, 'DD.MM.YYYY')
    AND ntlei = 'C12'
    AND instalacao LIKE '200%'
    AND status_ds = 'LG'
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

async function fastC12Json(state = 'pi', region = 'all', dateinit = today(), dateend = today()) {
    const params = [dateinit, dateend];
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
                -- Diferença em segundos. Se for o primeiro do dia, assume 60s
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
        WHERE data_conclusao::date BETWEEN TO_DATE($1, 'DD.MM.YYYY') AND TO_DATE($2, 'DD.MM.YYYY')
        AND ntlei = 'C12'
        -- FILTRO: Apenas execuções menores que 1 minuto
        AND tempo_execucao_segundos < 60
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
}

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
// ─── e02Json ────────────────────────────────────────────────────────────────────
async function e02Json(state = 'pi', region = 'all', dateinit = today(), dateend = today()) {
    const params = [dateinit, dateend];
    let query = `
    SELECT instalacao, etapa, seccional, regional, ntlei, agente, nome_agente, supervisor,
           status_ds, data_conclusao, latitude, longitude
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
        return r;
    });
}

// ─── c16Json ────────────────────────────────────────────────────────────────────
async function c16Json(state = 'pi', region = 'all', dateinit = today(), dateend = today()) {
    const params = [dateinit, dateend];
    let query = `
    SELECT instalacao, etapa, seccional, regional, ntlei, agente, nome_agente, supervisor,
           status_ds, data_conclusao, latitude, longitude
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
        return r;
    });
}

// ─── notStartServices ──────────────────────────────────────────────────────────
async function notStartServices(state = 'pi',) {
    const query = `
    SELECT 
    agente, 
    nome_agente, 
    seccional, 
    regional,
    supervisor,
    COUNT(*) FILTER (WHERE concluido = 'CONCLUIDO' AND data_conclusao::date = CURRENT_DATE) AS total_concluidas,
    COUNT(*) FILTER (WHERE concluido <> 'CONCLUIDO') AS total_pend,
    TO_CHAR(CURRENT_DATE, 'DD/MM/YYYY') AS date
    FROM matriz
    WHERE 
        TO_CHAR(data_leit_prev, 'MM.YYYY') = TO_CHAR(CURRENT_DATE, 'MM.YYYY')
        AND agente <> ''
    GROUP BY agente, nome_agente,supervisor, seccional, regional
    HAVING 
        COUNT(*) FILTER (WHERE concluido = 'CONCLUIDO' AND data_conclusao::date = CURRENT_DATE) = 0
        AND COUNT(*) FILTER (WHERE concluido <> 'CONCLUIDO') > 0;
  `;
    const { rows } = state === 'pi' ? await pi_pool.query(query) : await ma_pool.query(query);
    return rows;
}

// ─── completedServices ────────────────────────────────────────────────────────
async function completedServices(state = 'pi',) {
    const query = `
    WITH servicos_detalhados AS (
    -- 1. Buscamos todos os registros: concluídos hoje (para tempo) e pendentes (para contagem)
    SELECT 
        agente, nome_agente, seccional, regional, concluido, data_conclusao, data_leit_prev, supervisor,
        -- Extraímos a hora do timestamp para cálculos matemáticos
        data_conclusao::time as hora_fim_time,
        -- Buscamos a hora do serviço anterior do mesmo agente no mesmo dia
        LAG(data_conclusao::time) OVER (
            PARTITION BY agente, data_conclusao::date
            ORDER BY data_conclusao ASC
        ) as hora_fim_anterior
    FROM matriz
    WHERE agente <> ''
      AND (
          (concluido = 'CONCLUIDO' AND data_conclusao::date = CURRENT_DATE)
          OR 
          concluido = 'PENDENTE'
      )
),
calculo_intervalos AS (
    -- 2. Aplicamos suas regras de negócio para os tempos
    SELECT 
        *,
        CASE 
            WHEN concluido <> 'CONCLUIDO' THEN INTERVAL '0'
            -- REGRA: Primeiro serviço do dia = 60 segundos
            WHEN hora_fim_anterior IS NULL THEN INTERVAL '60 seconds'
            -- REGRA: Hora Atual - Hora Anterior
            ELSE (hora_fim_time - hora_fim_anterior)
        END as diff_servico
    FROM servicos_detalhados
    )
    -- 3. Agrupamento final com contagens e métricas de tempo
    SELECT 
        agente, 
        nome_agente, 
        seccional, 
        regional,
        supervisor,
        -- Contagens solicitadas
        COUNT(*) FILTER (WHERE concluido = 'CONCLUIDO' AND data_conclusao::date = CURRENT_DATE) AS total_conc,
        COUNT(*) FILTER (WHERE concluido = 'PENDENTE') AS total_pend,
        -- Horários de Início e Fim (Baseado no primeiro e último concluído)
        TO_CHAR(MIN(hora_fim_time) FILTER (WHERE concluido = 'CONCLUIDO'), 'HH24:MI:SS') as hora_inicio,
        TO_CHAR(MAX(hora_fim_time) FILTER (WHERE concluido = 'CONCLUIDO'), 'HH24:MI:SS') as hora_fim,
        -- Cálculos de Intervalo
        TO_CHAR(SUM(diff_servico), 'HH24:MI:SS') as tempo_total,
        TO_CHAR(SUM(CASE WHEN diff_servico > INTERVAL '20 minutes' THEN diff_servico ELSE INTERVAL '0' END), 'HH24:MI:SS') as tempo_pausas
    FROM calculo_intervalos
    WHERE TO_CHAR(data_leit_prev, 'MM.YYYY') = TO_CHAR(CURRENT_DATE, 'MM.YYYY')
    GROUP BY agente, nome_agente, supervisor, seccional, regional
    HAVING 
        -- Filtro: Teve pelo menos 1 concluído hoje
        COUNT(*) FILTER (WHERE concluido = 'CONCLUIDO' AND data_conclusao::date = CURRENT_DATE) > 10
        -- Filtro: Tem mais de 10 pendentes
        AND COUNT(*) FILTER (WHERE concluido = 'PENDENTE') = 0;
  `;
    const { rows } = state === 'pi' ? await pi_pool.query(query) : await ma_pool.query(query);
    return rows;
}

async function incompletedServices(state = 'pi',) {
    const query = `
    WITH servicos_detalhados AS (
    -- 1. Buscamos todos os registros: concluídos hoje (para tempo) e pendentes (para contagem)
    SELECT 
        agente, nome_agente, seccional, regional, concluido, data_conclusao, data_leit_prev, supervisor,
        -- Extraímos a hora do timestamp para cálculos matemáticos
        data_conclusao::time as hora_fim_time,
        -- Buscamos a hora do serviço anterior do mesmo agente no mesmo dia
        LAG(data_conclusao::time) OVER (
            PARTITION BY agente, data_conclusao::date
            ORDER BY data_conclusao ASC
        ) as hora_fim_anterior
    FROM matriz
    WHERE agente <> ''
      AND (
          (concluido = 'CONCLUIDO' AND data_conclusao::date = CURRENT_DATE)
          OR 
          concluido = 'PENDENTE'
      )
    ),
    calculo_intervalos AS (
        -- 2. Aplicamos suas regras de negócio para os tempos
        SELECT 
            *,
            CASE 
                WHEN concluido <> 'CONCLUIDO' THEN INTERVAL '0'
                -- REGRA: Primeiro serviço do dia = 60 segundos
                WHEN hora_fim_anterior IS NULL THEN INTERVAL '60 seconds'
                -- REGRA: Hora Atual - Hora Anterior
                ELSE (hora_fim_time - hora_fim_anterior)
            END as diff_servico
        FROM servicos_detalhados
    )
    -- 3. Agrupamento final com contagens e métricas de tempo
    SELECT 
        agente, 
        nome_agente, 
        seccional, 
        regional,
        supervisor,
        -- Contagens solicitadas
        COUNT(*) FILTER (WHERE concluido = 'CONCLUIDO' AND data_conclusao::date = CURRENT_DATE) AS total_conc,
        COUNT(*) FILTER (WHERE concluido = 'PENDENTE') AS total_pend,
        -- Horários de Início e Fim (Baseado no primeiro e último concluído)
        TO_CHAR(MIN(hora_fim_time) FILTER (WHERE concluido = 'CONCLUIDO'), 'HH24:MI:SS') as hora_inicio,
        TO_CHAR(MAX(hora_fim_time) FILTER (WHERE concluido = 'CONCLUIDO'), 'HH24:MI:SS') as hora_fim,
        -- Cálculos de Intervalo
        TO_CHAR(SUM(diff_servico), 'HH24:MI:SS') as tempo_total,
        TO_CHAR(SUM(CASE WHEN diff_servico > INTERVAL '20 minutes' THEN diff_servico ELSE INTERVAL '0' END), 'HH24:MI:SS') as tempo_pausas
    FROM calculo_intervalos
    WHERE TO_CHAR(data_leit_prev, 'MM.YYYY') = TO_CHAR(CURRENT_DATE, 'MM.YYYY')
    GROUP BY agente, nome_agente,supervisor, seccional, regional
    HAVING 
        -- Filtro: Teve pelo menos 1 concluído hoje
        COUNT(*) FILTER (WHERE concluido = 'CONCLUIDO' AND data_conclusao::date = CURRENT_DATE) > 10
        -- Filtro: Tem mais de 10 pendentes
        AND COUNT(*) FILTER (WHERE concluido = 'PENDENTE') > 10;
  `;

    const { rows } = state === 'pi' ? await pi_pool.query(query) : await ma_pool.query(query);
    return rows;
}

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
           perda_prevista_mensal, agente, nome_agente, latitude, longitude, data_conclusao, supervisor, tipo_perda, ntlei as apontamento_atual, apontamento as apontamento_anterior, grupo_cnl
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
        data_foto: row.data_conclusao,
        hora_foto: row.hora,
        apontamento: row.apontamento,
        foto: process.env.API_URL + '/' + row.caminho_foto,
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
      (SELECT array_agg(DISTINCT TO_CHAR(data_conclusao, 'DD.MM.YYYY')) FROM matriz WHERE data_conclusao IS NOT NULL) AS datas_conclusao
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

// ─── agentes ─────────────────────────────────────────────────────────────────

async function getCalendarForAgent({ state = 'pi' }) {
    const query = `
    SELECT 
        *
    FROM etapas
    `;
    const { rows } = state === 'pi' ? await pi_pool.query(query) : await ma_pool.query(query);
    return rows;
}

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
async function getLeiturasForAgent({ state = 'pi', id, date = today(), page = 1, limit = 20, filter = 'all' }) {
    const result = [];

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

async function getAgentTelegramId({ state = 'pi', id }) {
    const query = `
    SELECT * 
    FROM login 
    WHERE id in ('${id.toUpperCase()}', '${id.toLowerCase()}')
    `;

    const { rows } = await pi_pool.query(query);
    return rows;
}

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

    const result = rows.map((r,i) => {
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
    pontualidade,
    pendencias,
    pendenciasJson,
    cnl,
    c12Json: c12_out_hour_Json,
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
    firstC12Json,
    C12ToLidoJson,
    fastC12Json,
    licacaoNovaC12Json,
    CNLToLidoJson,
    firstCNLJson,
    incompletedServices,
    getLeiturasForAgent,
    firstC12ForAgent,
    fastC12ForAgent,
    licacaoNovaC12ForAgent,
    getCalendarForAgent,
    getAgentTelegramId,
    lastUpdate,
    get_instalations,
    get_predicted
};
