const { pi_pool, ma_pool, localizacoes_pi_pool, cenos_pool } = require('../../db');
const { justificativaCreateSchema, justifyPendingCreateSchema } = require('../../db/schemas/justify');
const { dailyReportCreateSchema } = require('../../db/schemas/dailyReport');
const { inventoryCreateSchema } = require('../../db/schemas/inventory');
const { securityReportCreateSchema, securityCheckCreateSchema } = require('../../db/schemas/security');

const { today } = require('../../utils/dates');
const { fastC12ForAgent, firstC12ForAgent } = require('./c12');
const { listBadges } = require('../badges');
const { get_instalation_matriz, getPoolByState } = require('./commom');

async function getUserData({ id, state }) {
    let login = {};
    let colaborador = {};
    let profileData = {};

    const { rows: loginMatches } = await cenos_pool.query(
        `SELECT * FROM login WHERE lower(id) = $1`,
        [id.toLowerCase()]
    );


    if (loginMatches.length > 0) {
        login = loginMatches[0];
    }

    const pool_state = getPoolByState(state);

    const { rows: colaboradorMatches } = await pool_state.query(
        `SELECT * FROM colaboradores WHERE lower("ID") = $1`,
        [id.toLowerCase()]
    );

    if (colaboradorMatches.length > 0) {
        colaborador = colaboradorMatches[0];

        colaborador.gestor = colaborador['GESTOR IMEDIATO'];
        colaborador.matricula = `${parseInt(colaborador['MAT'])}`;
        colaborador.nome = colaborador['Nome'];
        colaborador.id = (colaborador['ID']).toUpperCase();
        colaborador.estado = state;
        colaborador.cargo = colaborador['Cargo'] || 'Sem cargo';

        delete colaborador['GESTOR IMEDIATO'];
        delete colaborador['MAT'];
        delete colaborador['Nome'];
        delete colaborador['ID'];
        delete colaborador['Cargo'];
    }

    const { rows: profileMatches } = await cenos_pool.query(
        `SELECT * FROM profiles WHERE lower(id) = $1`,
        [id.toLowerCase()]
    );

    if (profileMatches.length > 0) {
        profileData = profileMatches[0];
    }

    // Mapeia os IDs dos badges gravados para obter os objetos completos
    if (profileData.badges && profileData.badges.length > 0) {
        const availableBadges = await listBadges();
        const mappedBadges = profileData.badges
            .map(bId => availableBadges.find(ab => String(ab.id) === String(bId)))
            .filter(Boolean); // Remove nulos
        profileData.badges = mappedBadges;
    } else {
        profileData.badges = [];
    }

    return {
        ...colaborador,
        ...login,
        ...profileData
    };
}

async function addBadgeToProfile(id, badgeId) {
    const getQuery = `SELECT badges FROM profiles WHERE id = $1`;
    const { rows } = await cenos_pool.query(getQuery, [id]);

    let currentBadges = [];
    if (rows.length > 0) {
        currentBadges = rows[0].badges || [];
    } else {
        await cenos_pool.query(
            `INSERT INTO profiles (id, "profilePicUrl", badges) VALUES ($1, NULL, '[]'::jsonb)`,
            [id]
        );
    }

    // badgeId convertido pra inteiro
    const numericBadgeId = parseInt(badgeId);

    if (!currentBadges.includes(numericBadgeId)) {
        currentBadges.push(numericBadgeId);
        await cenos_pool.query(
            `UPDATE profiles SET badges = $1 WHERE id = $2`,
            [JSON.stringify(currentBadges), id]
        );
    }

    return currentBadges;
}

async function removeBadgeFromProfile(id, badgeId) {
    const getQuery = `SELECT badges FROM profiles WHERE id = $1`;
    const { rows } = await cenos_pool.query(getQuery, [id]);

    if (rows.length === 0) return [];

    let currentBadges = rows[0].badges || [];
    const numericBadgeId = parseInt(badgeId);

    if (currentBadges.includes(numericBadgeId)) {
        const updatedBadges = currentBadges.filter(bId => bId !== numericBadgeId);
        await cenos_pool.query(
            `UPDATE profiles SET badges = $1 WHERE id = $2`,
            [JSON.stringify(updatedBadges), id]
        );
        return updatedBadges;
    }

    return currentBadges;
}

async function updateProfilePic(id, imageUrl) {
    // Upsert para inserir se nao existir
    const query = `
        INSERT INTO profiles (id, "profilePicUrl", badges)
        VALUES ($1, $2, '[]'::jsonb)
        ON CONFLICT (id)
        DO UPDATE SET "profilePicUrl" = EXCLUDED."profilePicUrl"
        RETURNING *;
    `;
    const { rows } = await cenos_pool.query(query, [id, imageUrl]);
    return rows[0];
}

/**
 * Verifica quais instalações têm justificativas respondidas
 * Retorna mapa: { instalacao: true/false }
 */
async function checkJustifiedByInstallations(installations, estado = 'pi') {
    const pool = cenos_pool;

    if (!installations || installations.length === 0) return {};

    // Tabela justificativas criada via migration central

    // Busca justificativas respondidas para essas instalações
    const placeholders = installations.map((_, i) => `$${i + 1}`).join(', ');
    const query = `
        SELECT DISTINCT instalacao 
        FROM justificativas 
        WHERE TRIM(instalacao) IN (${placeholders})
        AND estado = $${installations.length + 1}
    `;
    const params = [...installations.map(i => i.trim()), estado.toLowerCase()];

    const { rows } = await pool.query(query, params);

    // Cria mapa de justificativas
    const justified = {};
    installations.forEach(inst => {
        justified[inst.trim()] = false;
    });
    rows.forEach(row => {
        justified[row.instalacao.trim()] = true;
    });

    return justified;
}

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
async function getLeiturasForAgent({ state = 'pi', id, date = today(), page = 1, limit = 20, filter = 'all', search = '' }) {
    const result = [];
    let params = [id.toUpperCase(), id.toLowerCase(), date, limit, (page - 1) * limit];

    // Adicionar parâmetro de busca se fornecido
    const hasSearch = search && search.trim() !== '';
    const searchPattern = hasSearch ? `%${search.trim().toLowerCase()}%` : null;

    if (filter === 'pending') {
        return getLeiturasPendingForAgent({ state, id, date, page, limit });
    }

    if (filter === 'all') {
        let searchClause = '';
        let finalParams = [...params];

        if (hasSearch) {
            searchClause = `AND (
                LOWER(m.instalacao) LIKE $6 OR
                LOWER(m.regional) LIKE $6 OR
                LOWER(m.seccional) LIKE $6 OR
                LOWER(m.nome_agente) LIKE $6 OR
                LOWER(m.supervisor) LIKE $6 OR
                LOWER(m.tem_perda) LIKE $6
            )`;
            finalParams.push(searchPattern);
        }

        const query_all = `
            SELECT 
                m.instalacao, m.etapa, m.ntlei, m.data_conclusao, m.data_leit_prev, m.agente,
                m.tem_perda, m.perda_prevista_mensal, m.nome_agente, m.seccional, m.regional, m.unidade_leitura,
                
                -- Lógica para Latitude: se for 0 ou null, busca o histórico da instalação
                COALESCE(
                    NULLIF(m.latitude,0), 
                    (SELECT sub.latitude FROM matriz sub 
                    WHERE sub.instalacao = m.instalacao 
                    AND sub.latitude <> 0 AND sub.latitude IS NOT NULL 
                    AND sub.data_conclusao < m.data_conclusao 
                    ORDER BY sub.data_conclusao DESC LIMIT 1)
                ) as latitude,
                
                -- Lógica para Longitude: se for 0 ou null, busca o histórico da instalação
                COALESCE(
                    NULLIF(m.longitude,0), 
                    (SELECT sub.longitude FROM matriz sub 
                    WHERE sub.instalacao = m.instalacao 
                    AND sub.longitude <> 0 AND sub.longitude IS NOT NULL 
                    AND sub.data_conclusao < m.data_conclusao 
                    ORDER BY sub.data_conclusao DESC LIMIT 1)
                ) as longitude

            FROM matriz m
            WHERE m.agente IN ($1, $2)
            AND m.data_conclusao >= TO_DATE($3, 'DD/MM/YYYY')
            AND m.data_conclusao < TO_DATE($3, 'DD/MM/YYYY') + interval '1 day'
            ${searchClause}
            ORDER BY m.data_conclusao ASC
            LIMIT $4 OFFSET $5;
        `;

        const { rows } = state === 'pi'
            ? await pi_pool.query(query_all, finalParams)
            : await ma_pool.query(query_all, finalParams);
        if (rows.length === 0) return [];
        result.push(...orderLeituras(rows));
    }

    if (filter === 'cnl') {
        let searchClause = '';
        let finalParams = [...params];

        if (hasSearch) {
            searchClause = `AND (
                LOWER(instalacao) LIKE $6 OR
                LOWER(regional) LIKE $6 OR
                LOWER(seccional) LIKE $6 OR
                LOWER(nome_agente) LIKE $6 OR
                LOWER(supervisor) LIKE $6 OR
                LOWER(tem_perda) LIKE $6
            )`;
            finalParams.push(searchPattern);
        }

        const query_all = `
            WITH historico_completo AS (
                SELECT 
                    instalacao, etapa, ntlei, data_conclusao, data_leit_prev, concluido, agente, tem_perda, perda_prevista_mensal, nome_agente, latitude, longitude, regional, seccional, supervisor
                FROM matriz
                WHERE agente IN ($1, $2)
                AND ntlei NOT LIKE 'A%'
                AND ntlei NOT IN ('B09', 'B10', 'B15')
                AND data_conclusao >= TO_DATE($3, 'DD/MM/YYYY')
                AND data_conclusao < TO_DATE($3, 'DD/MM/YYYY') + interval '1 day'
            )
            SELECT *
            FROM historico_completo
            ${searchClause}
            LIMIT $4 OFFSET $5`;

        const { rows } = state === 'pi'
            ? await pi_pool.query(query_all, params)
            : await ma_pool.query(query_all, params);
        if (rows.length === 0) return [];
        result.push(...orderLeituras(rows));
    }

    if (filter === 'c12') {
        let searchClause = '';
        let finalParams = [...params];

        if (hasSearch) {
            searchClause = `AND (
                LOWER(instalacao) LIKE $6 OR
                LOWER(regional) LIKE $6 OR
                LOWER(seccional) LIKE $6 OR
                LOWER(nome_agente) LIKE $6 OR
                LOWER(supervisor) LIKE $6 OR
                LOWER(tem_perda) LIKE $6
            )`;
            finalParams.push(searchPattern);
        }

        const query_all = `
            WITH historico_completo AS (
                SELECT 
                    instalacao, etapa, ntlei, data_conclusao, data_leit_prev, agente,tem_perda, perda_prevista_mensal, nome_agente, latitude, longitude, regional, seccional, supervisor
                FROM matriz
                WHERE agente IN ($1, $2)
                AND ntlei = 'C12'
                AND data_conclusao >= TO_DATE($3, 'DD/MM/YYYY')
                AND data_conclusao < TO_DATE($3, 'DD/MM/YYYY') + interval '1 day'
            )
            SELECT *
            FROM historico_completo
            ${searchClause}
            LIMIT $4 OFFSET $5`;

        const { rows } = state === 'pi' ? await pi_pool.query(query_all, params) : await ma_pool.query(query_all, params);
        if (rows.length === 0) return [];
        result.push(...orderLeituras(rows));

    }

    if (filter === 'c12_out_time') {
        const query_all = `
            SELECT 
                instalacao, etapa, ntlei, data_conclusao, data_leit_prev, agente,tem_perda, perda_prevista_mensal, nome_agente, latitude, longitude
            FROM matriz
                WHERE agente IN ($1, $2)
                AND ntlei = 'C12'
                AND data_conclusao >= TO_DATE($3, 'DD/MM/YYYY')
                AND data_conclusao < TO_DATE($3, 'DD/MM/YYYY') + interval '1 day'
                LIMIT $4 OFFSET $5`;

        const { rows } = state === 'pi' ? await pi_pool.query(query_all, params) : await ma_pool.query(query_all, params);
        console.log(rows[0])
        if (rows.length === 0) return [];

        const hourLimit = 'pi' ? 8 : 7
        result.push(
            ...rows
                ?.map(r => {
                    const dt = new Date(r.data_conclusao);
                    r.hora_conclusao = dt.toLocaleTimeString('pt-BR', { hour12: false, hour: '2-digit', minute: '2-digit' });
                    return r;
                })
                ?.filter(r => parseInt(r.hora_conclusao.split(':')[0]) < hourLimit)
        )


    }

    if (filter === 'c12_ligacao_nova') {
        const query_all = `
            SELECT 
                instalacao, etapa, ntlei, data_conclusao, data_leit_prev, agente,tem_perda, perda_prevista_mensal, nome_agente, latitude, longitude
            FROM matriz
                WHERE agente IN ($1, $2)
                AND ntlei = 'C12'
                AND data_conclusao >= TO_DATE($3, 'DD/MM/YYYY')
                AND data_conclusao < TO_DATE($3, 'DD/MM/YYYY') + interval '1 day'
                AND instalacao LIKE '200%'
                AND status_ds = 'LG'
                LIMIT $4 OFFSET $5`;

        const { rows } = state === 'pi' ? await pi_pool.query(query_all, params) : await ma_pool.query(query_all, params);
        if (rows.length === 0) return [];
        result.push(...orderLeituras(rows));

    }

    if (filter === 'fast_c12') {
        const rows = await fastC12ForAgent({ state, id, date, limit, page })
        if (rows.length === 0) return [];
        result.push(...rows.map(r => {
            r['tempo_execucao'] = r['tempo_formatado']
            delete r['tempo_formatado']
            return r
        }));

    }

    if (filter === 'first_c12') {
        const rows = await firstC12ForAgent({ state, id, date, limit, page });
        if (rows.length === 0) return [];
        result.push(...rows);
    }
    const locations = await get_instalation_matriz({ estado: state, instalacao: result.map(r => r.instalacao) })

    return result.map(r => {
        const data = locations.find(l => l.instalacao === r.instalacao);
        r.latitude = data?.latitude;
        r.longitude = data?.longitude;
        r.data_leit_prev = new Date(r.data_leit_prev).toLocaleDateString('pt-BR');
        return r
    });

}

async function getLeiturasForAgentInDateInterval({ state = 'pi', id, initDate = today(), endDate = today(), page = 1, limit = 20 }) {
    const result = [];
    let params = [
        id.toUpperCase(),
        id.toLowerCase(),
        initDate.replaceAll('.', '/'),
        endDate.replaceAll('.', '/'),
        limit,
        (page - 1) * limit
    ];

 

    const query_all = `
            SELECT 
                m.instalacao, m.etapa, m.ntlei, m.data_conclusao, m.data_leit_prev, m.agente,
                m.tem_perda, m.perda_prevista_mensal, m.nome_agente, m.seccional, m.regional, m.unidade_leitura
            FROM matriz m
            WHERE m.agente IN ($1, $2)
            AND m.data_conclusao >= TO_DATE($3, 'DD/MM/YYYY')
            AND m.data_conclusao < TO_DATE($4, 'DD/MM/YYYY') + interval '1 day'
            ORDER BY m.data_conclusao ASC
            LIMIT $5 OFFSET $6;
        `;

    const { rows } = state === 'pi'
        ? await pi_pool.query(query_all, params)
        : await ma_pool.query(query_all, params);

    if (rows.length === 0) return [];

    result.push(...orderLeituras(rows));

    return result.map(r => {
        r.data_leit_prev = new Date(r.data_leit_prev).toLocaleDateString('pt-BR');
        return r
    });

}

// ─── getLeiturasPendingForAgent ───────────────────────────────────────────────
async function getLeiturasPendingForAgent({ state = 'pi', id, date = today(), page = 1, limit = 20 }) {
    const first_month_day = (`01.${date.slice(3, 10)}`).replaceAll('/', '.');


    const query_all = `
            SELECT 
                instalacao, etapa, ntlei, data_conclusao, data_leit_prev, agente,
                tem_perda, perda_prevista_mensal, nome_agente, latitude, longitude, unidade_leitura
            FROM matriz
            WHERE agente IN ($1, $2)
            and concluido <> 'CONCLUIDO'
            AND data_leit_prev >= TO_DATE($3, 'DD.MM.YYYY')
            AND data_leit_prev < TO_DATE($4, 'DD.MM.YYYY') + interval '1 day'
            LIMIT $5 OFFSET $6;`;

    const { rows } = await getPoolByState(state).query(query_all, [id.toUpperCase(), id.toLowerCase(), first_month_day, date, limit, (page - 1) * limit]);
    if (rows.length === 0) return [];
    return rows;
}

// ─── getCalendarForAgent ──────────────────────────────────────────────────────
async function getCalendarForAgent({ state = 'pi', month = new Date().getMonth() + 1 }) {
    const pool = getPoolByState(state);
    const monthStr = parseInt(month);

    if (state == 'ma') {
        const { rows } = await pool.query(`SELECT * FROM etapas`);
        return rows.map(r => ({
            etapa: r.etapa,
            data: r.data
        }));
    } else {
        const { rows } = await pool.query(
            `SELECT * FROM calendario_anual WHERE "DATA" LIKE $1`,
            [`${monthStr}/%`]
        );
        return rows.map(r => ({
            etapa: r.ETAPA,
            data: new Date(r.DATA).toLocaleDateString('pt-BR')
        }));
    }
}

// ─── getAgentTelegramId ───────────────────────────────────────────────────────
async function getAgentTelegramId({ state = 'pi', id }) {
    const query = `
    SELECT * 
    FROM login 
    WHERE id in ($1, $2)
    `;

    const { rows } = await cenos_pool.query(query, [id.toUpperCase(), id.toLowerCase()]);
    return rows;
}

async function get_instalations({ state, query = [], type }) {
    if (!query || query.length === 0) return [];

    const pool = getPoolByState(state);

    let column = 'instalacao';
    if (type === 'medidor') column = 'medidor';
    if (type === 'contacontrato') column = 'conta_contrato';

    const placeholders = query.map((_, i) => `$${i + 1}`).join(',');
    const sql_loc = `
        SELECT * 
        FROM dados_instalacoes 
        WHERE ${column} IN (${placeholders})
    `;
    const sql_state = `SELECT DISTINCT ON (${column}) *
    FROM matriz m
        WHERE ${column} IN (${placeholders})
        AND LEFT(ntlei, 1) = 'A'
        AND (latitude <> 0 OR longitude <> 0)
        ORDER BY ${column}, data_conclusao DESC
    `;

    const sql_state_not_find = `SELECT DISTINCT ON (${column}) *
    FROM matriz m
        WHERE ${column} IN (${placeholders})
        ORDER BY ${column}, data_conclusao DESC
    `;

    try {
        const [resLocals, resMatriz, resMatrizNotFind] = await Promise.all([
            state == 'pi' ? localizacoes_pi_pool.query(sql_loc, query) : Promise.resolve({ rows: [] }),
            pool.query(sql_state, query),
            pool.query(sql_state_not_find, query)
        ]);

        const locals = resLocals.rows;
        const matriz = resMatrizNotFind?.rows?.map(ins => {
            const data = resMatriz.rows.find(l => l['instalacao'] === ins['instalacao']);
            if (data) {
                return data;
            }
            return ins
        });

        const resultsMap = [];

        matriz.forEach(m => {
            const data_loc = locals.find(l => l['instalacao'] === m['instalacao']);

            if (!data_loc) {
                resultsMap.push(
                    {
                        instalacao: m['instalacao'],
                        conta_contrato: "SEM DADOS",
                        medidor: "SEM DADOS",
                        md_vizinho: "SEM DADOS",
                        unid_leit: "SEM DADOS",
                        status: m['status_ds'] === 'LG' ? 'LIGADO' : 'DESLIGADO',
                        endereco: "SEM DADOS",
                        nome_cliente: "SEM DADOS",
                        lat_cad: null,
                        long_cad: null,
                        lat_leitura: m['latitude'],
                        long_leitura: m['longitude'],
                        lat_lig: null,
                        lon_lig: null,
                        ntlei_historico: m['ntlei_historico']
                    }
                )
                return;
            }
            resultsMap.push({
                ...data_loc,
                lat_leitura: m['latitude'],
                long_leitura: m['longitude'],
                ntlei_historico: m['ntlei_historico']
            });
        });

        // console.log(resultsMap)

        return resultsMap;
    } catch (err) {
        console.error('Erro em get_instalations:', err);
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
    const validated = justificativaCreateSchema.parse({
        state, instalacao, tipo, motivo, justificativa, foto,
        data_leit_prev, author, quantidade, created_at, updated_at
    });
    const pool = cenos_pool;

    const insertQuery = `
        INSERT INTO justificativas (
            instalacao, tipo, motivo, justificativa, foto, data_leit_prev, author, estado, quantidade, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *;
    `;
    const values = [
        validated.instalacao,
        validated.tipo,
        validated.motivo,
        validated.justificativa,
        validated.foto,
        validated.data_leit_prev,
        validated.author,
        validated.state,
        validated.quantidade,
        validated.created_at,
        validated.updated_at
    ];

    const { rows } = await pool.query(insertQuery, values);
    return rows[0];
}

// ─── get_justify ─────────────────────────────────────────────────────────────
async function get_justify({ instalacao, data_leit_prev, estado = 'pi', author, tipo, quantidade }) {
    const pool = cenos_pool;

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
    if (estado) {
        params.push(estado.toLowerCase());
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
    const pool = cenos_pool;

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
    const pool = cenos_pool;

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

// ─── justify_pending ───────────────────────────────────────────────────────────
async function pre_create_pending_justify({
    state = 'pi',
    autor,
    quantidade,
    tipo,
    unidade_leitura,
    instalacao = JSON.stringify([]),
    created_at = new Date(),
    updated_at = new Date()
}) {
    const validated = justifyPendingCreateSchema.parse({
        state, autor, quantidade, tipo, unidade_leitura, instalacao, created_at, updated_at
    });
    const pool = cenos_pool;

    const insertQuery = `
        INSERT INTO justify_pending (autor, quantidade, tipo, unidade_leitura, instalacao, foto, estado, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'pendente', $8, $9)
        RETURNING *;
    `;
    const { rows } = await pool.query(insertQuery, [validated.autor.toLowerCase(), validated.quantidade, validated.tipo, validated.unidade_leitura, JSON.stringify(validated.instalacao), null, validated.state.toLowerCase(), validated.created_at, validated.updated_at]);
    return rows[0];
}

async function respond_pending_justify({
    id,
    estado = 'pi',
    motivo,
    observacao,
    foto,
    updated_at = new Date()
}) {
    const pool = cenos_pool;

    const updateQuery = `
        UPDATE justify_pending 
        SET motivo = $1, observacao = $2, foto = COALESCE($3, foto), status = 'respondido', updated_at = $4
        WHERE id = $5
        RETURNING *;
    `;
    const { rows } = await pool.query(updateQuery, [motivo, observacao, foto, updated_at, id]);
    return rows[0] || null;
}

async function get_pending_justify_by_id({ id, estado = 'pi' }) {
    const pool = cenos_pool;

    const query = `SELECT * FROM justify_pending WHERE id = $1;`;
    const { rows } = await pool.query(query, [id]);
    return rows[0] || null;
}

async function get_pending_justifies({ autor, status = 'pendente', page = 1, limit = 20 }) {
    const pool = cenos_pool;

    let query = `SELECT * FROM justify_pending WHERE 1=1`;
    const params = [];

    if (autor) {
        params.push(autor.trim().toLowerCase());
        query += ` AND LOWER(autor) = $${params.length}`;
    }
    if (status) {
        params.push(status.trim().toLowerCase());
        query += ` AND LOWER(status) = $${params.length}`;
    }

    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0]?.total || 0);

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, (page - 1) * limit);

    const { rows } = await pool.query(query, params);
    return {
        data: rows,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
    };
}

async function delete_pending_justify({ id, estado = 'pi' }) {
    const pool = cenos_pool;

    const sql = `DELETE FROM justify_pending WHERE id = $1 RETURNING *;`;
    const { rows } = await pool.query(sql, [id]);
    if (rows.length === 0) return null;
    return rows[0];
}

// ─── daily_report ───────────────────────────────────────────────────────────
async function save_daily_report({
    state = 'pi',
    autor,
    nota,
    motivo,
    observacao,
    foto,
    created_at = new Date(),
    updated_at = new Date()
}) {
    const validated = dailyReportCreateSchema.parse({
        state, autor, nota, motivo, observacao, foto, created_at, updated_at
    });
    const pool = cenos_pool;

    const existingQuery = `
        SELECT id FROM daily_report
        WHERE LOWER(autor) = LOWER($1) AND DATE(created_at) = CURRENT_DATE;
    `;
    const existing = await pool.query(existingQuery, [validated.autor.toLowerCase()]);
    if (existing.rows.length > 0) {
        throw new Error('Já existe um report diário para hoje');
    }

    const insertQuery = `
        INSERT INTO daily_report (autor, nota, motivo, observacao, foto, estado, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *;
    `;
    const { rows } = await pool.query(insertQuery, [validated.autor.toLowerCase(), validated.nota, validated.motivo, validated.observacao, validated.foto, validated.state.toLowerCase(), validated.created_at, validated.updated_at]);
    return rows[0];
}

async function get_daily_reports({ state = 'pi', autor, data, limit = 10 }) {
    const pool = cenos_pool;

    let query = `SELECT * FROM daily_report WHERE 1=1`;
    const params = [];

    if (autor) {
        params.push(autor.trim().toLowerCase());
        query += ` AND LOWER(autor) = $${params.length}`;
    }
    if (data) {
        params.push(data.trim());
        query += ` AND DATE(created_at) = TO_DATE($${params.length}, 'YYYY-MM-DD')`;
    }

    query += ` ORDER BY created_at DESC LIMIT ${parseInt(limit) || 10}`;

    const { rows } = await pool.query(query, params);
    return rows;
}

async function get_daily_report_today({ state = 'pi', autor }) {
    const pool = cenos_pool;

    const query = `
        SELECT * FROM daily_report 
        WHERE LOWER(autor) = LOWER($1) AND DATE(created_at) = CURRENT_DATE;
    `;
    const { rows } = await pool.query(query, [autor.toLowerCase()]);
    return rows[0] || null;
}

async function delete_daily_report({ id, estado = 'pi' }) {
    const pool = cenos_pool;

    const sql = `DELETE FROM daily_report WHERE id = $1 RETURNING *;`;
    const { rows } = await pool.query(sql, [id]);
    if (rows.length === 0) return null;
    return rows[0];
}

// ─── inventory ───────────────────────────────────────────────────────────
async function get_inventory_by_agent({ agente, estado = 'pi' }) {
    const pool = cenos_pool;

    const query = `
        SELECT * FROM inventory 
        WHERE LOWER(agente) = LOWER($1)
        ORDER BY id DESC
        LIMIT 1;
    `;
    const { rows } = await pool.query(query, [agente]);
    return rows[0] || null;
}

async function save_inventory({
    state = 'pi',
    agente,
    pda_imei_1,
    pda_imei_2,
    pda_numero_serie,
    pda_marca,
    pda_modelo,
    pda_numero_chip,
    pda_versao_android,
    pda_versao_bluetooth,
    impressora_numero_serie,
    impressora_modelo,
    impressora_marca,
    maquininha_numero_serie,
    maquininha_numero_logico,
    created_at = new Date(),
    updated_at = new Date()
}) {
    const validated = inventoryCreateSchema.parse({
        state, agente, pda_imei_1, pda_imei_2, pda_numero_serie, pda_marca, pda_modelo,
        pda_numero_chip, pda_versao_android, pda_versao_bluetooth,
        impressora_numero_serie, impressora_modelo, impressora_marca,
        maquininha_numero_serie, maquininha_numero_logico, created_at, updated_at
    });
    const pool = cenos_pool;

    const existing = await get_inventory_by_agent({ agente: validated.agente, estado: validated.state });

    if (existing) {
        const updateQuery = `
            UPDATE inventory
            SET pda_imei_1 = $1,
                pda_imei_2 = $2,
                pda_numero_serie = $3,
                pda_marca = $4,
                pda_modelo = $5,
                pda_numero_chip = $6,
                pda_versao_android = $7,
                pda_versao_bluetooth = $8,
                impressora_numero_serie = $9,
                impressora_modelo = $10,
                impressora_marca = $11,
                maquininha_numero_serie = $12,
                maquininha_numero_logico = $13,
                updated_at = $14
            WHERE id = $15
            RETURNING *;
        `;
        const values = [
            validated.pda_imei_1,
            validated.pda_imei_2,
            validated.pda_numero_serie,
            validated.pda_marca,
            validated.pda_modelo,
            validated.pda_numero_chip,
            validated.pda_versao_android,
            validated.pda_versao_bluetooth,
            validated.impressora_numero_serie,
            validated.impressora_modelo,
            validated.impressora_marca,
            validated.maquininha_numero_serie,
            validated.maquininha_numero_logico,
            validated.updated_at,
            existing.id
        ];
        const { rows } = await pool.query(updateQuery, values);
        return { ...rows[0], action: 'updated' };
    }

    const insertQuery = `
        INSERT INTO inventory (
            agente, pda_imei_1, pda_imei_2, pda_numero_serie, pda_marca, pda_modelo,
            pda_numero_chip, pda_versao_android, pda_versao_bluetooth,
            impressora_numero_serie, impressora_modelo, impressora_marca,
            maquininha_numero_serie, maquininha_numero_logico,
            estado, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING *;
    `;
    const values = [
        validated.agente.toLowerCase(),
        validated.pda_imei_1,
        validated.pda_imei_2,
        validated.pda_numero_serie,
        validated.pda_marca,
        validated.pda_modelo,
        validated.pda_numero_chip,
        validated.pda_versao_android,
        validated.pda_versao_bluetooth,
        validated.impressora_numero_serie,
        validated.impressora_modelo,
        validated.impressora_marca,
        validated.maquininha_numero_serie,
        validated.maquininha_numero_logico,
        validated.state.toLowerCase(),
        validated.created_at,
        validated.updated_at
    ];
    const { rows } = await pool.query(insertQuery, values);
    const newId = rows[0].id;

    const deleteDuplicatesQuery = `
        DELETE FROM inventory
        WHERE agente = $1
        AND estado = $2
        AND id < $3
    `;
    await pool.query(deleteDuplicatesQuery, [validated.agente.toLowerCase(), validated.state.toLowerCase(), newId]);

    return { ...rows[0], action: 'created' };
}

// ─── security_report ───────────────────────────────────────────────────────────

async function create_security_report(data) {
    const validated = securityReportCreateSchema.parse(data);
    const { autor, motivo, observacao, latitude, longitude, estado } = validated;
    const query = `
        INSERT INTO security_report (autor, motivo, observacao, latitude, longitude, estado)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
    `;
    const { rows } = await cenos_pool.query(query, [autor, motivo, observacao, latitude, longitude, estado]);
    return rows[0];
}

async function get_security_report_points({ user }) {
    const query = `
        SELECT * FROM security_report WHERE estado = $1;
    `;
    const { rows } = await cenos_pool.query(query, [user.estado]);
    return rows;
}

async function get_security_reports({ user }) {
    const { id, estado } = user;
    let result = {
        risks_list: [],
        points: []
    }
    const leituras = await getLeiturasPendingForAgent({ id, state: estado, page: 1, limit: 1000000 });
    let uls_prefix = []
    for (const leitura of leituras) {
        uls_prefix.push(leitura.unidade_leitura.slice(0, 4))
    }
    uls_prefix = [...new Set(uls_prefix)]


    const pool_state = getPoolByState(estado)

    let locals = []
    let steps = []
    for (const prefix of uls_prefix) {
        const { rows } = await pool_state.query(
            `SELECT * FROM localidades WHERE ul = $1`,
            [prefix.slice(0, 2)]
        );
        locals.push(...rows)
        steps.push(prefix.slice(2, 4))
    }
    result.points = (await get_security_report_points({ user })).filter(point => point.motivo !== "Sem Risco")?.map(point => ({
        motivo: point.motivo,
        observacao: point.observacao,
        latitude: point.latitude,
        longitude: point.longitude,
        created_at: point.created_at
    }))
    if (locals.length > 0) {
        const municipios = [...new Set(locals.map(l => l.municipio))];
        const placeholders = municipios.map((_, i) => `$${i + 1}`).join(', ');
        const { rows } = await cenos_pool.query(
            `SELECT * FROM mapa_seguranca WHERE localidade IN (${placeholders})`,
            municipios
        );
        const risks = rows.filter(risk => [...new Set(steps.map(s => parseInt(s)))].includes(parseInt(risk.etapa)))

        result.risks_list = risks.map(risk => risk.risco)

        return result
    }

    return result;



}

// ─── security_check ─────────────────────────────────────────────────────────────

async function save_security_check({
    state = 'pi',
    autor,
    latitude,
    longitude,
    created_at = new Date(),
    updated_at = new Date()
}) {
    const validated = securityCheckCreateSchema.parse({
        state, autor, latitude, longitude, created_at, updated_at
    });
    const pool = cenos_pool;

    const existingQuery = `
        SELECT id FROM security_check
        WHERE LOWER(autor) = LOWER($1) AND DATE(created_at) = CURRENT_DATE;
    `;
    const existing = await pool.query(existingQuery, [validated.autor.toLowerCase()]);
    if (existing.rows.length > 0) {
        throw new Error('Já existe uma confirmação de segurança para hoje');
    }

    const insertQuery = `
        INSERT INTO security_check (autor, latitude, longitude, estado, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *;
    `;
    const { rows } = await pool.query(insertQuery, [validated.autor.toLowerCase(), validated.latitude, validated.longitude, validated.state.toLowerCase(), validated.created_at, validated.updated_at]);
    return rows[0];
}

async function get_security_checks({ state = 'pi', autor, data, limit = 10 }) {
    const pool = cenos_pool;

    let query = `SELECT * FROM security_check WHERE 1=1`;
    const params = [];

    if (autor) {
        params.push(autor.trim().toLowerCase());
        query += ` AND LOWER(autor) = $${params.length}`;
    }
    if (data) {
        params.push(data.trim());
        query += ` AND DATE(created_at) = TO_DATE($${params.length}, 'YYYY-MM-DD')`;
    }

    query += ` ORDER BY created_at DESC LIMIT ${parseInt(limit) || 10}`;

    const { rows } = await pool.query(query, params);
    return rows;
}

async function get_security_check_today({ state = 'pi', autor }) {
    const pool = cenos_pool;

    const query = `
        SELECT * FROM security_check 
        WHERE LOWER(autor) = LOWER($1) AND DATE(created_at) = CURRENT_DATE;
    `;
    const { rows } = await pool.query(query, [autor.toLowerCase()]);
    return rows[0] || null;
}

module.exports = {
    getLeiturasForAgent,
    getLeiturasPendingForAgent,
    getLeiturasForAgentInDateInterval,
    getCalendarForAgent,
    getAgentTelegramId,
    get_instalations,
    get_predicted,
    save_justify,
    get_justify,
    update_justify,
    delete_justify,
    getWeeklyCNLStats,
    checkJustifiedByInstallations,
    pre_create_pending_justify,
    respond_pending_justify,
    get_pending_justify_by_id,
    get_pending_justifies,
    delete_pending_justify,
    save_daily_report,
    get_daily_reports,
    get_daily_report_today,
    delete_daily_report,
    get_inventory_by_agent,
    save_inventory,
    create_security_report,
    getUserData,
    updateProfilePic,
    addBadgeToProfile,
    removeBadgeFromProfile,
    get_security_reports,
    save_security_check,
    get_security_checks,
    get_security_check_today
};
