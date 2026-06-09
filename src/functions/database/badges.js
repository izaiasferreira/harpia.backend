const { cenos_pool } = require('../../db');
const { badgeCreateSchema, badgeSchema } = require('../../db/schemas');

const DEFAULT_BADGES = [
    { id: 1, title: 'Limpador de Rota', description: 'Completou o treinamento de abertura de notas de Desligamento', image_url: 'https://api.izi.tec.br/files/assets/emblema1.png' },
    { id: 2, title: 'Roteirizador Master', description: 'Completou o treinamento de abertura de notas de Remanejamento', image_url: 'https://api.izi.tec.br/files/assets/emblema3.png' },
    { id: 3, title: 'Amigo da Segurança', description: 'Completou o treinamento de reporte de perigos na rota', image_url: 'https://api.izi.tec.br/files/assets/emblema2.png' },
    { id: 4, title: 'Visão de Águia', description: 'Completou o treinamento atenção e prevenção a erros de leitura.', image_url: 'https://api.izi.tec.br/files/assets/emblema4.png' }
];

async function seedDefaultBadges() {
    const { rows } = await cenos_pool.query('SELECT COUNT(*) as count FROM badges');
    if (parseInt(rows[0].count) === 0) {
        for (const badge of DEFAULT_BADGES) {
            await cenos_pool.query(
                `INSERT INTO badges (id, title, description, image_url)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (id) DO NOTHING`,
                [badge.id, badge.title, badge.description, badge.image_url]
            );
        }
    }
}

async function listBadges() {
    const { rows } = await cenos_pool.query('SELECT * FROM badges ORDER BY id ASC');
    return rows.map(b => ({
        id: b.id,
        title: b.title,
        description: b.description,
        earned: true,
        imageUrl: b.image_url
    }));
}

async function getBadgeById(id) {
    const { rows } = await cenos_pool.query('SELECT * FROM badges WHERE id = $1', [id]);
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
    const { rows } = await cenos_pool.query(
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

    const { rows } = await cenos_pool.query(
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
    const { rows } = await cenos_pool.query(
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
    seedDefaultBadges,
    listBadges,
    getBadgeById,
    createBadge,
    updateBadge,
    deleteBadge
};
