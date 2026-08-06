const { sinergia_pool } = require('../../db');
const { badgeCreateSchema, badgeSchema } = require('../../db/schemas');

async function listBadges() {
    const { rows } = await sinergia_pool.query('SELECT * FROM badges ORDER BY id ASC');
    return rows.map(b => ({
        id: b.id,
        title: b.title,
        description: b.description,
        earned: true,
        imageUrl: b.image_url
    }));
}

async function getBadgeById(id) {
    const { rows } = await sinergia_pool.query('SELECT * FROM badges WHERE id = $1', [id]);
    if (rows.length === 0) return null;
    const b = rows[0];
    return {
        id: b.id,
        title: b.title,
        description: b.description,
        image_url: b.image_url,
        created_at: b.created_at,
        updated_at: b.updated_at
    };
}

async function createBadge({ title, description, image_url }) {
    const validated = badgeCreateSchema.parse({ title, description, image_url });
    const { rows } = await sinergia_pool.query(
        `INSERT INTO badges (title, description, image_url)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [validated.title, validated.description, validated.image_url || null]
    );
    const b = rows[0];
    return {
        id: b.id,
        title: b.title,
        description: b.description,
        image_url: b.image_url,
        created_at: b.created_at,
        updated_at: b.updated_at
    };
}

async function updateBadge(id, { title, description, image_url }) {
    const validated = badgeSchema.partial().parse({ title, description, image_url });
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (validated.title !== undefined) {
        updates.push(`title = $${paramIndex}`);
        params.push(validated.title);
        paramIndex++;
    }
    if (validated.description !== undefined) {
        updates.push(`description = $${paramIndex}`);
        params.push(validated.description);
        paramIndex++;
    }
    if (validated.image_url !== undefined) {
        updates.push(`image_url = $${paramIndex}`);
        params.push(validated.image_url);
        paramIndex++;
    }

    if (updates.length === 0) return null;

    updates.push('updated_at = NOW()');
    params.push(id);

    const { rows } = await sinergia_pool.query(
        `UPDATE badges SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        params
    );
    if (rows.length === 0) return null;
    const b = rows[0];
    return {
        id: b.id,
        title: b.title,
        description: b.description,
        image_url: b.image_url,
        created_at: b.created_at,
        updated_at: b.updated_at
    };
}

async function deleteBadge(id) {
    const { rows } = await sinergia_pool.query(
        'DELETE FROM badges WHERE id = $1 RETURNING *',
        [id]
    );
    if (rows.length === 0) return null;
    const b = rows[0];
    return {
        id: b.id,
        title: b.title,
        description: b.description,
        image_url: b.image_url
    };
}

module.exports = {
    listBadges,
    getBadgeById,
    createBadge,
    updateBadge,
    deleteBadge
};
