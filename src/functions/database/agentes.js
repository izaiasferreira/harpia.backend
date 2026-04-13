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
        r.tempo_segundos = diff;
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
                instalacao, etapa, ntlei, data_conclusao, data_leit_prev, agente,
                tem_perda, perda_prevista_mensal, nome_agente, latitude, longitude
            FROM matriz
            WHERE agente IN ($1, $2)
            AND data_conclusao >= TO_DATE($3, 'DD/MM/YYYY')
            AND data_conclusao < TO_DATE($3, 'DD/MM/YYYY') + interval '1 day'
            ORDER BY data_conclusao ASC
            LIMIT $4 OFFSET $5;`;

        const { rows } = state === 'pi' 
            ? await pi_pool.query(query_all, [id.toUpperCase(), id.toLowerCase(), date, limit, (page - 1) * limit]) 
            : await ma_pool.query(query_all, [id.toUpperCase(), id.toLowerCase(), date, limit, (page - 1) * limit]);
        if (rows.length === 0) return [];
        result.push(...orderLeituras(rows));
    }

    if (filter === 'cnl') {
        const query_all = `
            WITH historico_completo AS (
                SELECT 
                    instalacao, etapa, ntlei, data_conclusao, data_leit_prev, concluido, agente, tem_perda, perda_prevista_mensal, nome_agente, latitude, longitude
                FROM matriz
                WHERE agente IN ($1, $2)
                AND ntlei NOT LIKE 'A%'
                AND ntlei NOT IN ('B09', 'B10', 'B15')
                AND data_conclusao >= TO_DATE($3, 'DD/MM/YYYY')
                AND data_conclusao < TO_DATE($3, 'DD/MM/YYYY') + interval '1 day'
            )
            SELECT *
            FROM historico_completo
            LIMIT $4 OFFSET $5`;

        const { rows } = state === 'pi' 
            ? await pi_pool.query(query_all, [id.toUpperCase(), id.toLowerCase(), date, limit, (page - 1) * limit]) 
            : await ma_pool.query(query_all, [id.toUpperCase(), id.toLowerCase(), date, limit, (page - 1) * limit]);
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
    const first_month_day = `01.${date.slice(3, 10)}`;

    const query_all = `
            SELECT 
                instalacao, etapa, ntlei, data_conclusao, data_leit_prev, agente,
                tem_perda, perda_prevista_mensal, nome_agente, latitude, longitude
            FROM matriz
            WHERE agente IN ($1, $2)
            and concluido = 'CONCLUIDO'
            AND data_leit_prev >= TO_DATE($3, 'DD.MM.YYYY')
            AND data_leit_prev < TO_DATE($3, 'DD.MM.YYYY') + interval '1 day'
            LIMIT $4 OFFSET $5;`;

    const { rows } = state === 'pi' 
        ? await pi_pool.query(query_all, [id.toUpperCase(), id.toLowerCase(), first_month_day, limit, (page - 1) * limit]) 
        : await ma_pool.query(query_all, [id.toUpperCase(), id.toLowerCase(), first_month_day, limit, (page - 1) * limit]);
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
async function get_instalation_matriz({ estado, instalacao, data_leit_prev }) {
    if (!instalacao || !data_leit_prev) return {};

    const activeState = (estado || 'pi').toLowerCase();
    const pool = activeState === 'ma' ? ma_pool : pi_pool;

    console.log(`[DEBUG] get_instalation_matriz - Pool: ${activeState}, Instalacao: ${instalacao}`);

    const sql = `
        SELECT * FROM matriz
        WHERE TRIM(instalacao) = TRIM($1)
        AND data_leit_prev::date = TO_DATE($2, 'DD/MM/YYYY')
    `;

    const values = [instalacao, data_leit_prev];

    try {
        const { rows } = await pool.query(sql, values);
        if (rows.length === 0) {
            return {};
        }
        return rows[0];
    } catch (err) {
        console.error('Erro em get_instalations_matriz:', err);
        throw err;
    }
}

// ─── get_predicted ─────────────────────────────────────────────────────────────
async function get_predicted({ state = 'pi', id, status = 'PENDENTE', page = 1, limit = 100 }) {
    const offset = (page - 1) * limit;
    const status_filter = status === 'PENDENTE' ? '' : "AND tem_perda = 'PERDA'";
    const query = `
        SELECT instalacao, etapa, seccional, regional, agente, nome_agente, ntlei, apontamento, 
               perda_prevista_mensal, tipo_perda, status_perda, tem_perda, concluido, motivo_perda,
               TO_CHAR(data_leit_prev, 'DD/MM/YYYY') as data_leit_prev,
               TO_CHAR(data_conclusao, 'DD/MM/YYYY') as data_conclusao,
               TO_CHAR(data_conclusao, 'HH24:MI') as hora_conclusao,
               CASE 
                   WHEN tipo_perda LIKE '%87%' THEN 'LER OU APONTAR ' || COALESCE(apontamento, '')
                   WHEN tipo_perda LIKE '%113%' AND status_perda = 'SEM PERDA' THEN 'LER OU APONTAR ' || COALESCE(apontamento, '')
                   ELSE 'LER OU ENTRAR EM CONTATO COM A MONITORIA'
               END as action
        FROM matriz 
        WHERE agente IN ($1, $2) AND concluido = $3 ${status_filter}
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
        console.log(r);
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

async function save_justify({
    state = 'pi',
    instalacao,
    tipo,
    motivo,
    justificativa,
    foto,
    data_leit_prev,
    author,
    quantidade,
    created_at = new Date(),
    updated_at = new Date()
}) {
    // 1. Garantir que a tabela existe com a estrutura completa
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS justificativas (
            id SERIAL PRIMARY KEY,
            instalacao TEXT,
            tipo TEXT,
            motivo TEXT,
            justificativa TEXT,
            foto TEXT,
            data_leit_prev TEXT,
            author TEXT,
            estado TEXT,
            quantidade INTEGER,
            created_at TIMESTAMP,
            updated_at TIMESTAMP
        );
    `;

    const pool = state === 'pi' ? pi_pool : ma_pool;
    await pool.query(createTableQuery);

    const insertQuery = `
        INSERT INTO justificativas (
            instalacao, tipo, motivo, justificativa, foto, data_leit_prev, author, estado, quantidade, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *;
    `;
    const values = [
        instalacao,
        tipo,
        motivo,
        justificativa,
        foto,
        data_leit_prev,
        author,
        state,
        quantidade,
        created_at,
        updated_at
    ];

    const { rows } = await pool.query(insertQuery, values);
    return rows[0];
}

// ─── get_justify ─────────────────────────────────────────────────────────────
async function get_justify({ instalacao, data_leit_prev, estado = 'pi', author, tipo, quantidade }) {
    // Garantir que o estado seja minúsculo para a seleção do pool e filtro
    const activeState = (estado || 'pi').toLowerCase();

    // Garantir que a tabela existe antes de consultar
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS justificativas (
            id SERIAL PRIMARY KEY,
            instalacao TEXT,
            tipo TEXT,
            motivo TEXT,
            justificativa TEXT,
            foto TEXT,
            data_leit_prev TEXT,
            author TEXT,
            estado TEXT,
            quantidade INTEGER,
            created_at TIMESTAMP,
            updated_at TIMESTAMP
        );
    `;
    const pool = activeState === 'ma' ? ma_pool : pi_pool;
    await pool.query(createTableQuery);

    let querySql = `SELECT * FROM justificativas WHERE 1=1`;
    const params = [];

    if (instalacao) {
        params.push(instalacao.trim());
        querySql += ` AND TRIM(instalacao) = $${params.length}`;
    }
    if (data_leit_prev) {
        params.push(data_leit_prev.trim());
        querySql += ` AND TRIM(data_leit_prev) = $${params.length}`;
    }
    if (activeState) {
        params.push(activeState);
        querySql += ` AND LOWER(estado) = $${params.length}`;
    }
    if (author) {
        params.push(author.trim());
        querySql += ` AND author = $${params.length}`;
    }
    if (tipo) {
        params.push(tipo.trim().toLowerCase());
        querySql += ` AND LOWER(tipo) = $${params.length}`;
    }

    querySql += ` ORDER BY created_at DESC`;

    const { rows } = await pool.query(querySql, params);
    if (rows.length === 0) {
        return {};
    }
    return rows[0];
}

// ─── update_justify ───────────────────────────────────────────────────────────
async function update_justify({ id, estado = 'pi', ...fields }) {
    const activeState = (estado || 'pi').toLowerCase();
    const pool = activeState === 'ma' ? ma_pool : pi_pool;

    // Campos permitidos para atualização
    const allowedFields = ['instalacao', 'tipo', 'motivo', 'justificativa', 'foto', 'data_leit_prev', 'quantidade'];
    const updates = [];
    const values = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
        if (fields[field] !== undefined) {
            updates.push(`${field} = $${paramIndex}`);
            values.push(fields[field]);
            paramIndex++;
        }
    }

    if (updates.length === 0) {
        throw new Error('Nenhum campo para atualizar');
    }

    // Sempre atualiza o updated_at
    updates.push(`updated_at = $${paramIndex}`);
    values.push(new Date());
    paramIndex++;

    // ID é o último parâmetro
    values.push(id);

    const sql = `
        UPDATE justificativas
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *;
    `;

    const { rows } = await pool.query(sql, values);
    if (rows.length === 0) return null;
    return rows[0];
}

// ─── delete_justify ───────────────────────────────────────────────────────────
async function delete_justify({ id, estado = 'pi' }) {
    const activeState = (estado || 'pi').toLowerCase();
    const pool = activeState === 'ma' ? ma_pool : pi_pool;

    const sql = `DELETE FROM justificativas WHERE id = $1 RETURNING *;`;
    const { rows } = await pool.query(sql, [id]);
    if (rows.length === 0) return null;
    return rows[0];
}

async function getWeeklyCNLStats({ state = 'pi', id, date = today() }) {
    // Converte a string date (DD.MM.YYYY) para objeto Date para saber o dia da semana no JS
    const [d, m, y] = date.split('.');
    const target_date = new Date(y, m - 1, d);
    // ISODOW 1(Seg)-7(Dom). JS getDay 0(Dom)-6(Sab).
    const currentDayIso = target_date.getDay() === 0 ? 7 : target_date.getDay();
    
    const query = `
        SELECT 
            EXTRACT(ISODOW FROM data_conclusao)::INTEGER as dow,
            COUNT(*)::INTEGER as total
        FROM matriz
        WHERE agente IN ($1, $2)
        AND data_conclusao >= date_trunc('week', TO_DATE($3, 'DD/MM/YYYY'))
        AND data_conclusao < date_trunc('week', TO_DATE($3, 'DD/MM/YYYY')) + interval '6 days'
        AND ntlei NOT LIKE 'A%'
        AND ntlei NOT IN ('B09', 'B10', 'B15')
        GROUP BY 1
        ORDER BY 1;
    `;

    const { rows } = state === 'pi' 
        ? await pi_pool.query(query, [id.toUpperCase(), id.toLowerCase(), date]) 
        : await ma_pool.query(query, [id.toUpperCase(), id.toLowerCase(), date]);

    const labels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
    const values = [0, 0, 0, 0, 0, 0];

    rows.forEach(r => {
        if (r.dow >= 1 && r.dow <= 6) {
            values[r.dow - 1] = r.total;
        }
    });

    // Zera dias futuros conforme regra: "se hoje é quinta, mostra de segunda a quinta... e o resto não"
    for (let i = 0; i < 6; i++) {
        const dayIso = i + 1;
        if (dayIso > currentDayIso) {
            values[i] = 0;
        }
    }

    return { labels, series: values };
}

module.exports = {
    getLeiturasForAgent,
    getLeiturasPendingForAgent,
    getCalendarForAgent,
    getAgentTelegramId,
    get_instalations_matriz: get_instalation_matriz,    
    get_instalations,
    get_predicted,
    save_justify,
    get_justify,
    update_justify,
    delete_justify,
    getWeeklyCNLStats
};
