const { cenos_pool } = require('../../db');
const { branchCreateSchema, branchSchema } = require('../../db/schemas');

async function createBranchesTable() {
    // Tabela branches criada via migration central
}

async function createBranch({
    name,
    code,
    state = 'pi',
    parent_id = null
}) {
    await createBranchesTable();

    const validated = branchCreateSchema.parse({ name, code, state, parent_id });

    const pool = cenos_pool;

    const checkQuery = `SELECT id FROM branches WHERE code = $1 AND state = $2`;
    const checkResult = await pool.query(checkQuery, [validated.code.toUpperCase(), validated.state.toLowerCase()]);
    if (checkResult.rows.length > 0) {
        throw new Error('Branch já existe com este código');
    }

    const insertQuery = `
        INSERT INTO branches (name, code, state, parent_id)
        VALUES ($1, $2, $3, $4)
        RETURNING id, name, code, state, parent_id, ativo;
    `;
    const { rows } = await pool.query(insertQuery, [
        validated.name,
        validated.code.toUpperCase(),
        validated.state.toLowerCase(),
        validated.parent_id
    ]);
    return rows[0];
}

async function getBranchById(id, state = 'pi') {
    const pool = cenos_pool;

    const query = `
        SELECT id, name, code, state, parent_id, ativo, created_at
        FROM branches 
        WHERE id = $1 AND ativo = true
    `;
    const { rows } = await pool.query(query, [id]);
    return rows[0] || null;
}

async function listBranches(state = 'pi') {
    const pool = cenos_pool;

    const query = `
        SELECT id, name, code, state, parent_id, ativo, created_at
        FROM branches 
        WHERE ativo = true
        ORDER BY name
    `;
    const { rows } = await pool.query(query);
    return rows;
}

async function updateBranch(id, data, state = 'pi') {
    const pool = cenos_pool;
    const validated = branchSchema.partial().parse(data);
    const { name, parent_id, ativo } = validated;
    
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (name) {
        updates.push(`name = $${paramIndex}`);
        params.push(name);
        paramIndex++;
    }
    if (parent_id !== undefined) {
        updates.push(`parent_id = $${paramIndex}`);
        params.push(parent_id);
        paramIndex++;
    }
    if (typeof ativo === 'boolean') {
        updates.push(`ativo = $${paramIndex}`);
        params.push(ativo);
        paramIndex++;
    }

    if (updates.length === 0) return null;

    updates.push(`updated_at = NOW()`);
    params.push(id);

    const query = `
        UPDATE branches 
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING id, name, code, state, parent_id, ativo;
    `;
    
    const { rows } = await pool.query(query, params);
    return rows[0] || null;
}

async function deleteBranch(id, state = 'pi') {
    const pool = cenos_pool;

    const query = `
        UPDATE branches 
        SET ativo = false, updated_at = NOW()
        WHERE id = $1
        RETURNING id;
    `;
    const { rows } = await pool.query(query, [id]);
    return rows[0] ? true : false;
}

module.exports = {
    createBranchesTable,
    createBranch,
    getBranchById,
    listBranches,
    updateBranch,
    deleteBranch
};