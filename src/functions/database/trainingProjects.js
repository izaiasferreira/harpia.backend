const { cenos_pool } = require('../../db');

async function createTrainingProjectsTable() {
    await cenos_pool.query(`
        CREATE TABLE IF NOT EXISTS training_projects (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            name TEXT NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);
}

async function createTrainingProject({ userId, name, description }) {
    await createTrainingProjectsTable();
    const pool = cenos_pool;

    const query = `
        INSERT INTO training_projects (user_id, name, description)
        VALUES ($1, $2, $3)
        RETURNING id, user_id, name, description, created_at, updated_at
    `;
    const { rows } = await pool.query(query, [userId, name, description || null]);
    return rows[0];
}

async function getTrainingProjectById(id) {
    const pool = cenos_pool;
    const query = `
        SELECT id, user_id, name, description, created_at, updated_at
        FROM training_projects
        WHERE id = $1
    `;
    const { rows } = await pool.query(query, [id]);
    return rows[0] || null;
}

async function listTrainingProjects(userId, page = 1, limit = 20) {
    const pool = cenos_pool;
    const offset = (page - 1) * limit;

    const countQuery = `
        SELECT COUNT(*) as total FROM training_projects WHERE user_id = $1
    `;
    const { rows: countRows } = await pool.query(countQuery, [userId]);
    const total = parseInt(countRows[0].total, 10);

    const query = `
        SELECT id, user_id, name, description, created_at, updated_at
        FROM training_projects
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
    `;
    const { rows } = await pool.query(query, [userId, limit, offset]);

    return {
        data: rows,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
    };
}

async function updateTrainingProject(id, { name, description }) {
    const pool = cenos_pool;
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (name) {
        updates.push(`name = $${paramIndex}`);
        params.push(name);
        paramIndex++;
    }
    if (description !== undefined) {
        updates.push(`description = $${paramIndex}`);
        params.push(description);
        paramIndex++;
    }

    if (updates.length === 0) return null;

    updates.push(`updated_at = NOW()`);
    params.push(id);

    const query = `
        UPDATE training_projects
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING id, user_id, name, description, created_at, updated_at
    `;
    const { rows } = await pool.query(query, params);
    return rows[0] || null;
}

async function deleteTrainingProject(id) {
    const pool = cenos_pool;
    const query = `
        DELETE FROM training_projects
        WHERE id = $1
        RETURNING id, user_id, name, description, created_at, updated_at
    `;
    const { rows } = await pool.query(query, [id]);
    return rows[0] || null;
}

module.exports = {
    createTrainingProjectsTable,
    createTrainingProject,
    getTrainingProjectById,
    listTrainingProjects,
    updateTrainingProject,
    deleteTrainingProject
};