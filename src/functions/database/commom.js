const { pi_pool, ma_pool } = require('../../db');

function getPoolByState(state) {
    return state === 'pi' ? pi_pool : ma_pool;
}

async function get_instalation_matriz({ estado, instalacao = [] }) {
    if (!instalacao.length) return {};

    const pool_state = getPoolByState(estado);

    const sql = `
        SELECT DISTINCT ON (TRIM(m.instalacao))
            m.*, 
            -- Busca a latitude atual, se for 0/null busca a última válida no histórico
            COALESCE(
                NULLIF(m.latitude, 0), 
                (SELECT sub.latitude FROM matriz sub 
                WHERE sub.instalacao = m.instalacao 
                AND sub.latitude <> 0 AND sub.latitude IS NOT NULL 
                AND sub.data_conclusao < m.data_conclusao 
                ORDER BY sub.data_conclusao DESC LIMIT 1)
            ) as latitude,

            -- Busca a longitude atual, se for 0/null busca a última válida no histórico
            COALESCE(
                NULLIF(m.longitude, 0), 
                (SELECT sub.longitude FROM matriz sub 
                WHERE sub.instalacao = m.instalacao 
                AND sub.longitude <> 0 AND sub.longitude IS NOT NULL 
                AND sub.data_conclusao < m.data_conclusao 
                ORDER BY sub.data_conclusao DESC LIMIT 1)
            ) as longitude,

            -- Histórico dos últimos 4 registros válidos (incluindo o atual se válido)
            COALESCE((
                SELECT jsonb_agg(h.row)
                FROM (
                    SELECT jsonb_build_object(
                        'ntlei', h.ntlei, 
                        'data_conclusao', TO_CHAR(h.data_conclusao, 'DD/MM/YYYY')
                    ) as row
                    FROM matriz h 
                    WHERE h.instalacao = m.instalacao 
                    AND h.ntlei <> 'SEM APONTAMENTO'
                    AND h.data_conclusao <= m.data_conclusao
                    ORDER BY h.data_conclusao DESC 
                    LIMIT 4
                ) h
            ), '[]'::jsonb) as ntlei_historico

        FROM matriz m
        WHERE TRIM(m.instalacao) = ANY($1)
        -- O ORDER BY deve começar obrigatoriamente pela coluna do DISTINCT ON
        ORDER BY TRIM(m.instalacao), m.data_conclusao DESC;
    `;
    
    const values = [instalacao.map(i => i.trim())];

    try {
        const { rows } = await pool_state.query(sql, values);
        return rows;
    } catch (err) {
        console.error('Erro em get_instalations_matriz:', err);
        return [];
    }
}


module.exports = {
    get_instalation_matriz,
    getPoolByState
}