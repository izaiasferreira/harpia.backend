const { sinergia_pool } = require('../../db');

async function getManagerDashboardStats({ matricula, mes, ano, type }) {
    const periodStr = `${ano}-${String(mes).padStart(2, '0')}`;
    
    // We get all subordinates using the function isSubordinateOf from lists
    const query = `
        WITH RECURSIVE subordinates AS (
            SELECT "ID" as id, "MAT" as mat, "Nome" as nome
            FROM colaboradores
            WHERE TRIM(UPPER("MAT")) = TRIM(UPPER($1)) OR TRIM(UPPER("ID")) = TRIM(UPPER($1))
            
            UNION
            
            SELECT c."ID" as id, c."MAT" as mat, c."Nome" as nome
            FROM colaboradores c
            INNER JOIN subordinates s ON TRIM(UPPER(c."GESTOR IMEDIATO")) = TRIM(UPPER(s.mat)) OR TRIM(UPPER(c."GESTOR IMEDIATO")) = TRIM(UPPER(s.id)) OR TRIM(UPPER(c."GESTOR IMEDIATO")) = TRIM(UPPER(s.nome))
        )
        SELECT 
            (SELECT COUNT(*) FROM subordinates WHERE id != $1) as total_subordinates,
            (SELECT COUNT(DISTINCT target_agent_id) FROM checklists 
             WHERE TO_CHAR(date, 'YYYY-MM') = $2 
             AND type = 'supplementary'
             AND target_agent_id IS NOT NULL
             AND target_agent_id IN (SELECT id FROM subordinates)) as completed_subordinates
    `;
    
    const { rows } = await sinergia_pool.query(query, [matricula, periodStr]);
    return {
        total_subordinates: parseInt(rows[0].total_subordinates || '0'),
        completed_subordinates: parseInt(rows[0].completed_subordinates || '0')
    };
}

async function getManagerDashboardPending({ matricula, mes, ano }) {
    const periodStr = `${ano}-${String(mes).padStart(2, '0')}`;
    const query = `
        WITH RECURSIVE subordinates AS (
            SELECT "ID" as id, "MAT" as mat, "Nome" as nome, "GESTOR IMEDIATO" as gestor, "Cargo" as cargo
            FROM colaboradores
            WHERE TRIM(UPPER("MAT")) = TRIM(UPPER($1)) OR TRIM(UPPER("ID")) = TRIM(UPPER($1))
            
            UNION
            
            SELECT c."ID" as id, c."MAT" as mat, c."Nome" as nome, c."GESTOR IMEDIATO" as gestor, c."Cargo" as cargo
            FROM colaboradores c
            INNER JOIN subordinates s ON TRIM(UPPER(c."GESTOR IMEDIATO")) = TRIM(UPPER(s.mat)) OR TRIM(UPPER(c."GESTOR IMEDIATO")) = TRIM(UPPER(s.id)) OR TRIM(UPPER(c."GESTOR IMEDIATO")) = TRIM(UPPER(s.nome))
        )
        SELECT s.id, s.nome, s.cargo
        FROM subordinates s
        WHERE s.id != $1
        AND s.id NOT IN (
            SELECT target_agent_id 
            FROM checklists 
            WHERE TO_CHAR(date, 'YYYY-MM') = $2 
            AND type = 'supplementary'
            AND target_agent_id IS NOT NULL
        )
        ORDER BY s.nome ASC
    `;
    
    const { rows } = await sinergia_pool.query(query, [matricula, periodStr]);
    return rows;
}

async function getManagerDashboardHistory({ matricula, page = 1, limit = 50 }) {
    const offset = (page - 1) * limit;
    
    // Total count query
    const countQuery = `
        WITH RECURSIVE subordinates AS (
            SELECT "ID" as id, "MAT" as mat, "Nome" as nome
            FROM colaboradores
            WHERE TRIM(UPPER("MAT")) = TRIM(UPPER($1)) OR TRIM(UPPER("ID")) = TRIM(UPPER($1))
            
            UNION
            
            SELECT c."ID" as id, c."MAT" as mat, c."Nome" as nome
            FROM colaboradores c
            INNER JOIN subordinates s ON TRIM(UPPER(c."GESTOR IMEDIATO")) = TRIM(UPPER(s.mat)) OR TRIM(UPPER(c."GESTOR IMEDIATO")) = TRIM(UPPER(s.id)) OR TRIM(UPPER(c."GESTOR IMEDIATO")) = TRIM(UPPER(s.nome))
        )
        SELECT COUNT(*) as total
        FROM checklists ac
        WHERE type = 'supplementary'
        AND target_agent_id IS NOT NULL
        AND target_agent_id IN (SELECT id FROM subordinates WHERE id != $1)
    `;
    
    const { rows: countRows } = await sinergia_pool.query(countQuery, [matricula]);
    const total = parseInt(countRows[0].total || '0');

    // Data query
    const dataQuery = `
        WITH RECURSIVE subordinates AS (
            SELECT "ID" as id, "MAT" as mat, "Nome" as nome
            FROM colaboradores
            WHERE TRIM(UPPER("MAT")) = TRIM(UPPER($1)) OR TRIM(UPPER("ID")) = TRIM(UPPER($1))
            
            UNION
            
            SELECT c."ID" as id, c."MAT" as mat, c."Nome" as nome
            FROM colaboradores c
            INNER JOIN subordinates s ON TRIM(UPPER(c."GESTOR IMEDIATO")) = TRIM(UPPER(s.mat)) OR TRIM(UPPER(c."GESTOR IMEDIATO")) = TRIM(UPPER(s.id)) OR TRIM(UPPER(c."GESTOR IMEDIATO")) = TRIM(UPPER(s.nome))
        )
        SELECT ac.id, ac.date as data_registro, ac.target_agent_id, s.nome as target_agent_nome,
               ac.agent_id as gestor_id, g."Nome" as gestor_nome, t.title as template_title
        FROM checklists ac
        JOIN subordinates s ON ac.target_agent_id = s.id
        LEFT JOIN colaboradores g ON ac.agent_id = g."ID"
        LEFT JOIN checklist_templates t ON ac.template_id = t.id
        WHERE ac.type = 'supplementary'
        AND ac.target_agent_id IS NOT NULL
        ORDER BY ac.date DESC
        LIMIT $2 OFFSET $3
    `;
    
    const { rows } = await sinergia_pool.query(dataQuery, [matricula, limit, offset]);
    
    return { data: rows, total, page, limit };
}

module.exports = {
    getManagerDashboardStats,
    getManagerDashboardPending,
    getManagerDashboardHistory
};
