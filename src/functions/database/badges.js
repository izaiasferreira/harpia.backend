const { cenos_pool } = require('../../db');

const DEFAULT_BADGES = [
    { id: 1, title: 'Limpador de Rota', description: 'Completou o treinamento de abertura de notas de Desligamento', image_url: 'https://api.izi.tec.br/files/assets/emblema1.png' },
    { id: 2, title: 'Roteirizador Master', description: 'Completou o treinamento de abertura de notas de Remanejamento', image_url: 'https://api.izi.tec.br/files/assets/emblema3.png' },
    { id: 3, title: 'Amigo da Segurança', description: 'Completou o treinamento de reporte de perigos na rota', image_url: 'https://api.izi.tec.br/files/assets/emblema2.png' },
    { id: 4, title: 'Visão de Águia', description: 'Completou o treinamento atenção e prevenção a erros de leitura.', image_url: 'https://api.izi.tec.br/files/assets/emblema4.png' }
];

async function createBadgesTable() {
    await cenos_pool.query(`
        CREATE TABLE IF NOT EXISTS badges (
            id SERIAL PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            image_url VARCHAR(500),
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
    `);
}

async function seedDefaultBadges() {
    await createBadgesTable();
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
    await createBadgesTable();
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
    await createBadgesTable();
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
    await createBadgesTable();
    const { rows } = await cenos_pool.query(
        `INSERT INTO badges (title, description, image_url)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [title, description, image_url || null]
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
    await createBadgesTable();
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (title !== undefined) {
        updates.push(`title = $${paramIndex}`);
        params.push(title);
        paramIndex++;
    }
    if (description !== undefined) {
        updates.push(`description = $${paramIndex}`);
        params.push(description);
        paramIndex++;
    }
    if (image_url !== undefined) {
        updates.push(`image_url = $${paramIndex}`);
        params.push(image_url);
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
    await createBadgesTable();
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
    createBadgesTable,
    seedDefaultBadges,
    listBadges,
    getBadgeById,
    createBadge,
    updateBadge,
    deleteBadge
};
