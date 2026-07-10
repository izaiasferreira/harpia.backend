const { pi_pool, ma_pool } = require('../../db');
const { checkJustifiedByInstallations } = require('../postgresFunctions');
const { today } = require('../../utils/dates');

// Helper function to order readings
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

async function getLeiturasGeral({ states = ['pi'], date = today(), page = 1, limit = 20, search = '', regional = '', seccional = '', supervisor = '', allowedAgentIds = null }) {
    const hasSearch = search && search.trim() !== '';
    const searchPattern = hasSearch ? `%${search.trim().toLowerCase()}%` : null;
    
    // Params: $1=date, $2=limit, $3=offset
    let params = [date, limit, (page - 1) * limit];
    let whereAdditions = [];
    
    if (regional) {
        whereAdditions.push(`LOWER(regional) = $${params.length + 1}::text`);
        params.push(regional.toLowerCase());
    }
    if (seccional) {
        whereAdditions.push(`LOWER(seccional) = $${params.length + 1}::text`);
        params.push(seccional.toLowerCase());
    }
    if (supervisor) {
        whereAdditions.push(`LOWER(supervisor) = $${params.length + 1}::text`);
        params.push(supervisor.toLowerCase());
    }
    if (allowedAgentIds && allowedAgentIds.length > 0) {
        whereAdditions.push(`agente = ANY($${params.length + 1}::text[])`);
        params.push(allowedAgentIds.map(id => String(id)));
    }
    
    let searchClause = '';
    if (hasSearch) {
        const searchIdx = params.length + 1;
        searchClause = ` AND (
            LOWER(instalacao) LIKE $${searchIdx}::text OR
            LOWER(regional) LIKE $${searchIdx}::text OR
            LOWER(seccional) LIKE $${searchIdx}::text OR
            LOWER(nome_agente) LIKE $${searchIdx}::text OR
            LOWER(supervisor) LIKE $${searchIdx}::text OR
            LOWER(ntlei) LIKE $${searchIdx}::text OR
            LOWER(tem_perda) LIKE $${searchIdx}::text
        )`;
        params.push(searchPattern);
    }
    
    const whereClause = `data_conclusao >= TO_DATE($1, 'DD/MM/YYYY') AND data_conclusao < TO_DATE($1, 'DD/MM/YYYY') + interval '1 day' ${whereAdditions.length > 0 ? 'AND ' + whereAdditions.join(' AND ') : ''}`;
    
    const query = `
        SELECT 
            m.instalacao, m.etapa, m.ntlei, m.data_conclusao, m.data_leit_prev, m.agente,
            m.tem_perda, m.perda_prevista_mensal, m.nome_agente, m.seccional, m.regional, m.unidade_leitura,
            m.supervisor,
            COALESCE(NULLIF(m.latitude, 0), 
                (SELECT sub.latitude FROM matriz sub 
                WHERE sub.instalacao = m.instalacao 
                AND sub.latitude <> 0 AND sub.latitude IS NOT NULL 
                AND sub.data_conclusao < m.data_conclusao 
                ORDER BY sub.data_conclusao DESC LIMIT 1)) as latitude,
            COALESCE(NULLIF(m.longitude, 0), 
                (SELECT sub.longitude FROM matriz sub 
                WHERE sub.instalacao = m.instalacao 
                AND sub.longitude <> 0 AND sub.longitude IS NOT NULL 
                AND sub.data_conclusao < m.data_conclusao 
                ORDER BY sub.data_conclusao DESC LIMIT 1)) as longitude
        FROM matriz m
        WHERE ${whereClause}
        ${searchClause}
        ORDER BY m.data_conclusao ASC
        LIMIT $2 OFFSET $3;
    `;
    
    let allRows = [];
    for (const state of states) {
        const pool = state === 'pi' ? pi_pool : ma_pool;
        try {
            const { rows } = await pool.query(query, params);
            allRows = allRows.concat(rows);
        } catch (err) {
            console.log(`Error querying state ${state}:`, err.message);
        }
    }
    
    if (allRows.length === 0) return [];
    
    const instalacoes = allRows.map(r => r.instalacao);
    const justified = await checkJustifiedByInstallations(instalacoes, states[0]);
    
    return orderLeituras(allRows).map(r => ({
        ...r,
        justificado: !!justified[r.instalacao]
    }));
}

module.exports = { getLeiturasGeral };
