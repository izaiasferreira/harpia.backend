const { sinergia_pool } = require('../../db');
const { addBadgeToProfile } = require('./agentes');
const { assignBadgesFromLinkedCeneducCards } = require('./ceneduc');
const { trainingProjectCreateSchema, trainingProjectSchema } = require('../../db/schemas');

async function updateTrainingFlow(id, flowData) {
    const pool = sinergia_pool;
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
    const validated = trainingProjectCreateSchema.parse({
        user_id: userId,
        name,
        description,
        badge_id
    });
    const pool = sinergia_pool;

    const query = `
        INSERT INTO training_projects (user_id, name, description, badge_id)
        VALUES ($1, $2, $3, $4)
        RETURNING id, user_id, name, description, badge_id, created_at, updated_at
    `;
    const { rows } = await pool.query(query, [validated.user_id, validated.name, validated.description || null, validated.badge_id || null]);
    return rows[0];
}

async function getTrainingProjectById(id) {
    const pool = sinergia_pool;
    const query = `
        SELECT id, user_id, name, description, badge_id, flow_data, created_at, updated_at
        FROM training_projects
        WHERE id = $1
    `;
    const { rows } = await pool.query(query, [id]);
    return rows[0] || null;
}

async function listTrainingProjects(userId, page = 1, limit = 20) {
    const pool = sinergia_pool;
    const offset = (page - 1) * limit;

    const countQuery = `
        SELECT COUNT(*) as total FROM training_projects
    `;
    const { rows: countRows } = await pool.query(countQuery);
    const total = parseInt(countRows[0].total, 10);

    const query = `
        SELECT id, user_id, name, description, badge_id, created_at, updated_at
        FROM training_projects
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2
    `;
    const { rows } = await pool.query(query, [limit, offset]);

    return {
        data: rows,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
    };
}

async function updateTrainingProject(id, { name, description, badge_id }) {
    const validated = trainingProjectSchema.partial().parse({ name, description, badge_id });
    const pool = sinergia_pool;
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (validated.name !== undefined) {
        updates.push(`name = $${paramIndex}`);
        params.push(validated.name);
        paramIndex++;
    }
    if (validated.description !== undefined) {
        updates.push(`description = $${paramIndex}`);
        params.push(validated.description);
        paramIndex++;
    }
    if (validated.badge_id !== undefined) {
        updates.push(`badge_id = $${paramIndex}`);
        params.push(validated.badge_id);
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
    const pool = sinergia_pool;
    const query = `
        DELETE FROM training_projects
        WHERE id = $1
        RETURNING id, user_id, name, description, badge_id, created_at, updated_at
    `;
    const { rows } = await pool.query(query, [id]);
    return rows[0] || null;
}

async function completeTrainingAndAssignBadge(trainingId, agentId) {
    const pool = sinergia_pool;

    const query = `SELECT id, badge_id FROM training_projects WHERE id = $1`;
    const { rows } = await pool.query(query, [trainingId]);

    if (rows.length === 0) {
        throw new Error('Treinamento não encontrado');
    }

    const training = rows[0];
    let updatedBadges = null;

    // 1. Badge direta do treinamento
    if (training.badge_id) {
        updatedBadges = await addBadgeToProfile(String(agentId), training.badge_id);
    }

    // 2. Badges de cards do CenEduc que apontam para este treinamento
    await assignBadgesFromLinkedCeneducCards('training', trainingId, agentId);

    return { success: true, agentId, trainingId: training.id, badgeId: training.badge_id, badges: updatedBadges };
}

module.exports = {
    createTrainingProject,
    getTrainingProjectById,
    listTrainingProjects,
    updateTrainingProject,
    deleteTrainingProject,
    updateTrainingFlow,
    completeTrainingAndAssignBadge
};
