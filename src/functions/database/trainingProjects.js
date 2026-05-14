const { cenos_pool } = require('../../db');
const { addBadgeToProfile } = require('./agentes');

async function createTrainingProjectsTable() {
    await cenos_pool.query(`
        CREATE TABLE IF NOT EXISTS training_projects (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            name TEXT NOT NULL,
            description TEXT,
            badge_id INTEGER,
            flow_data JSONB,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await cenos_pool.query(`
        ALTER TABLE training_projects 
        ADD COLUMN IF NOT EXISTS flow_data JSONB;
    `).catch(() => { });

    await cenos_pool.query(`
        ALTER TABLE training_projects 
        ADD COLUMN IF NOT EXISTS badge_id INTEGER;
    `).catch(() => { });
}

async function updateTrainingFlow(id, flowData) {
    await createTrainingProjectsTable();
    const pool = cenos_pool;
    const query = `
        UPDATE training_projects
        SET flow_data = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING id, name, badge_id, flow_data, updated_at
    `;
    const { rows } = await pool.query(query, [
        typeof flowData === 'object' ? JSON.stringify(flowData) : flowData, 
        id
    ]);
    return rows[0] || null;
}

async function createTrainingProject({ userId, name, description, badge_id }) {
    await createTrainingProjectsTable();
    const pool = cenos_pool;

    const query = `
        INSERT INTO training_projects (user_id, name, description, badge_id)
        VALUES ($1, $2, $3, $4)
        RETURNING id, user_id, name, description, badge_id, created_at, updated_at
    `;
    const { rows } = await pool.query(query, [userId, name, description || null, badge_id || null]);
    return rows[0];
}

async function getTrainingProjectById(id) {
    await createTrainingProjectsTable();
    const pool = cenos_pool;
    const query = `
        SELECT id, user_id, name, description, badge_id, flow_data, created_at, updated_at
        FROM training_projects
        WHERE id = $1
    `;
    const { rows } = await pool.query(query, [id]);
    return rows[0] || null;
}

async function listTrainingProjects(userId, page = 1, limit = 20) {
    await createTrainingProjectsTable();
    const pool = cenos_pool;
    const offset = (page - 1) * limit;

    const countQuery = `
        SELECT COUNT(*) as total FROM training_projects WHERE user_id = $1
    `;
    const { rows: countRows } = await pool.query(countQuery, [userId]);
    const total = parseInt(countRows[0].total, 10);

    const query = `
        SELECT id, user_id, name, description, badge_id, created_at, updated_at
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

async function updateTrainingProject(id, { name, description, badge_id }) {
    await createTrainingProjectsTable();
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
    if (badge_id !== undefined) {
        updates.push(`badge_id = $${paramIndex}`);
        params.push(badge_id);
        paramIndex++;
    }

    if (updates.length === 0) return null;

    updates.push(`updated_at = NOW()`);
    params.push(id);

    const query = `
        UPDATE training_projects
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING id, user_id, name, description, badge_id, created_at, updated_at
    `;
    const { rows } = await pool.query(query, params);
    return rows[0] || null;
}

async function deleteTrainingProject(id) {
    await createTrainingProjectsTable();
    const pool = cenos_pool;
    const query = `
        DELETE FROM training_projects
        WHERE id = $1
        RETURNING id, user_id, name, description, badge_id, created_at, updated_at
    `;
    const { rows } = await pool.query(query, [id]);
    return rows[0] || null;
}

async function completeTrainingAndAssignBadge(trainingId, agentId) {
    await createTrainingProjectsTable();
    const pool = cenos_pool;

    const query = `SELECT id, badge_id FROM training_projects WHERE id = $1`;
    const { rows } = await pool.query(query, [trainingId]);

    if (rows.length === 0) {
        throw new Error('Treinamento não encontrado');
    }

    const training = rows[0];

    if (!training.badge_id) {
        throw new Error('Este treinamento não possui badge associada');
    }

    const updatedBadges = await addBadgeToProfile(String(agentId), training.badge_id);
    return { success: true, agentId, trainingId: training.id, badgeId: training.badge_id, badges: updatedBadges };
}

module.exports = {
    createTrainingProjectsTable,
    createTrainingProject,
    getTrainingProjectById,
    listTrainingProjects,
    updateTrainingProject,
    deleteTrainingProject,
    updateTrainingFlow,
    completeTrainingAndAssignBadge
};
