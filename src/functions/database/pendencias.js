const { pi_pool, ma_pool } = require('../../db');

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

// ─── pendenciasJson ────────────────────────────────────────────────────────────
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

// ─── notStartServices ──────────────────────────────────────────────────────────
async function notStartServices(state = 'pi') {
    const query = `
    SELECT 
    agente, 
    nome_agente, 
    seccional, 
    regional,
    supervisor,
    COUNT(*) FILTER (WHERE concluido = 'CONCLUIDO' AND data_conclusao::date = CURRENT_DATE) AS total_concluidas,
    COUNT(*) FILTER (WHERE concluido <> 'CONCLUIDO') AS total_pend,
    -- Nova coluna JSON com valores únicos
    COALESCE(json_agg(DISTINCT unidade_leitura) FILTER (WHERE concluido <> 'CONCLUIDO'), '[]') AS unidades_leitura,
    TO_CHAR(CURRENT_DATE, 'DD/MM/YYYY') AS date
    FROM matriz
    WHERE 
        TO_CHAR(data_leit_prev, 'MM.YYYY') = TO_CHAR(CURRENT_DATE, 'MM.YYYY')
        AND agente <> ''
    GROUP BY agente, nome_agente, supervisor, seccional, regional
    HAVING 
        COUNT(*) FILTER (WHERE concluido = 'CONCLUIDO' AND data_conclusao::date = CURRENT_DATE) = 0
        AND COUNT(*) FILTER (WHERE concluido <> 'CONCLUIDO') > 0;
  `;
    const { rows } = state === 'pi' ? await pi_pool.query(query) : await ma_pool.query(query);
    return rows;
}

// ─── completedServices ────────────────────────────────────────────────────────
async function completedServices(state = 'pi') {
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

// ─── incompletedServices ────────────────────────────────────────────────────────
async function incompletedServices(state = 'pi') {
    const query = `
    WITH servicos_detalhados AS (
    -- 1. Buscamos todos os registros: incluídos hoje e pendentes
    SELECT 
        agente, nome_agente, seccional, regional, concluido, data_conclusao, data_leit_prev, supervisor,
        instalacao, unidade_leitura, -- Adicionado para permitir o agrupamento JSON
        data_conclusao::time as hora_fim_time,
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
        -- 2. Aplicamos as regras de negócio para os tempos
        SELECT 
            *,
            CASE 
                WHEN concluido <> 'CONCLUIDO' THEN INTERVAL '0'
                WHEN hora_fim_anterior IS NULL THEN INTERVAL '60 seconds'
                ELSE (hora_fim_time - hora_fim_anterior)
            END as diff_servico
        FROM servicos_detalhados
    )
    -- 3. Agrupamento final com contagens, métricas e listas JSON
    SELECT 
        agente, 
        nome_agente, 
        seccional, 
        regional,
        supervisor,
        COUNT(*) FILTER (WHERE concluido = 'CONCLUIDO' AND data_conclusao::date = CURRENT_DATE) AS total_conc,
        COUNT(*) FILTER (WHERE concluido = 'PENDENTE') AS total_pend,
        TO_CHAR(MIN(hora_fim_time) FILTER (WHERE concluido = 'CONCLUIDO'), 'HH24:MI:SS') as hora_inicio,
        TO_CHAR(MAX(hora_fim_time) FILTER (WHERE concluido = 'CONCLUIDO'), 'HH24:MI:SS') as hora_fim,
        TO_CHAR(SUM(diff_servico), 'HH24:MI:SS') as tempo_total,
        TO_CHAR(SUM(CASE WHEN diff_servico > INTERVAL '20 minutes' THEN diff_servico ELSE INTERVAL '0' END), 'HH24:MI:SS') as tempo_pausas,
        
        -- NOVAS COLUNAS EM JSON
        COALESCE(jsonb_agg(DISTINCT instalacao) FILTER (WHERE concluido = 'PENDENTE'), '[]') as instalacoes,
        COALESCE(jsonb_agg(DISTINCT unidade_leitura) FILTER (WHERE concluido = 'PENDENTE'), '[]') as unidades_leitura
        
    FROM calculo_intervalos
    WHERE TO_CHAR(data_leit_prev, 'MM.YYYY') = TO_CHAR(CURRENT_DATE, 'MM.YYYY')
    GROUP BY agente, nome_agente, supervisor, seccional, regional
    HAVING 
        COUNT(*) FILTER (WHERE concluido = 'CONCLUIDO' AND data_conclusao::date = CURRENT_DATE) > 10
        AND COUNT(*) FILTER (WHERE concluido = 'PENDENTE') > 10;
  `;

    const { rows } = state === 'pi' ? await pi_pool.query(query) : await ma_pool.query(query);
    return rows;
}

module.exports = {
    pendencias,
    pendenciasJson,
    notStartServices,
    completedServices,
    incompletedServices
};
