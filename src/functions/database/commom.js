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
            COALESCE(
                NULLIF(m.latitude, 0), 
                (SELECT sub.latitude FROM matriz sub 
                WHERE sub.instalacao = m.instalacao 
                AND sub.latitude <> 0 AND sub.latitude IS NOT NULL 
                AND sub.data_conclusao < m.data_conclusao 
                ORDER BY sub.data_conclusao DESC LIMIT 1)
            ) as latitude,
            COALESCE(
                NULLIF(m.longitude, 0), 
                (SELECT sub.longitude FROM matriz sub 
                WHERE sub.instalacao = m.instalacao 
                AND sub.longitude <> 0 AND sub.longitude IS NOT NULL 
                AND sub.data_conclusao < m.data_conclusao 
                ORDER BY sub.data_conclusao DESC LIMIT 1)
            ) as longitude,
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
        ORDER BY TRIM(m.instalacao), m.data_conclusao DESC NULLS LAST;
    `;



    const values = [instalacao.map(i => i.trim())];
    console.log(values, estado, pool_state);
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