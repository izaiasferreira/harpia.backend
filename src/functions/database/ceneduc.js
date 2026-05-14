const { cenos_pool } = require('../../db');

async function createCeneducCardsTable() {
    await cenos_pool.query(`
        CREATE TABLE IF NOT EXISTS ceneduc_cards (
            id SERIAL PRIMARY KEY,
            card_type VARCHAR(20) NOT NULL CHECK (card_type IN ('cover', 'train_item')),
            section VARCHAR(20) CHECK (section IN ('slider', 'banner')),
            group_title VARCHAR(255),
            state VARCHAR(2),
            sort_order INTEGER DEFAULT 0,
            active BOOLEAN DEFAULT true,
            badge_id INTEGER,
            data JSONB NOT NULL DEFAULT '{}',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
    `);

    await cenos_pool.query(`
        ALTER TABLE ceneduc_cards ADD COLUMN IF NOT EXISTS badge_id INTEGER;
    `).catch(() => {});
}

async function listCeneducCards({ state, activeOnly = true } = {}) {
    await createCeneducCardsTable();

    let query = 'SELECT * FROM ceneduc_cards WHERE 1=1';
    const params = [];

    if (activeOnly) {
        query += ' AND active = true';
    }

    if (state) {
        query += ' AND (state IS NULL OR state = $1)';
        params.push(state);
    }

    query += ' ORDER BY sort_order ASC, id ASC';

    const { rows } = await cenos_pool.query(query, params);
    return rows;
}

async function getCeneducCardById(id) {
    await createCeneducCardsTable();
    const { rows } = await cenos_pool.query('SELECT * FROM ceneduc_cards WHERE id = $1', [id]);
    return rows[0] || null;
}

async function createCeneducCard({ card_type, section, group_title, state, sort_order, badge_id, data }) {
    await createCeneducCardsTable();
    const { rows } = await cenos_pool.query(
        `INSERT INTO ceneduc_cards (card_type, section, group_title, state, sort_order, badge_id, data)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [card_type, section || null, group_title || null, state || null, sort_order || 0, badge_id || null, JSON.stringify(data || {})]
    );
    return rows[0];
}

async function updateCeneducCard(id, { card_type, section, group_title, state, sort_order, active, badge_id, data }) {
    await createCeneducCardsTable();
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (card_type !== undefined) {
        updates.push(`card_type = $${paramIndex}`);
        params.push(card_type);
        paramIndex++;
    }
    if (section !== undefined) {
        updates.push(`section = $${paramIndex}`);
        params.push(section);
        paramIndex++;
    }
    if (group_title !== undefined) {
        updates.push(`group_title = $${paramIndex}`);
        params.push(group_title);
        paramIndex++;
    }
    if (state !== undefined) {
        updates.push(`state = $${paramIndex}`);
        params.push(state);
        paramIndex++;
    }
    if (sort_order !== undefined) {
        updates.push(`sort_order = $${paramIndex}`);
        params.push(sort_order);
        paramIndex++;
    }
    if (active !== undefined) {
        updates.push(`active = $${paramIndex}`);
        params.push(active);
        paramIndex++;
    }
    if (badge_id !== undefined) {
        updates.push(`badge_id = $${paramIndex}`);
        params.push(badge_id);
        paramIndex++;
    }
    if (data !== undefined) {
        updates.push(`data = $${paramIndex}`);
        params.push(JSON.stringify(data));
        paramIndex++;
    }

    if (updates.length === 0) return null;

    updates.push('updated_at = NOW()');
    params.push(id);

    const { rows } = await cenos_pool.query(
        `UPDATE ceneduc_cards SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        params
    );
    return rows[0] || null;
}

async function deleteCeneducCard(id) {
    await createCeneducCardsTable();
    const { rows } = await cenos_pool.query(
        'DELETE FROM ceneduc_cards WHERE id = $1 RETURNING *',
        [id]
    );
    return rows[0] || null;
}

function interpolateId(value, id) {
    if (typeof value === 'string') return value.replace(/\{id\}/g, id);
    if (value && typeof value === 'object') {
        const result = {};
        for (const [k, v] of Object.entries(value)) {
            result[k] = interpolateId(v, id);
        }
        return result;
    }
    return value;
}

async function getCeneducForAgent(state, userId) {
    const cards = await listCeneducCards({ state, activeOnly: true });

    const cover = [];
    const trainMap = {};

    for (const card of cards) {
        const d = card.data || {};

        if (card.card_type === 'cover') {
            cover.push({
                id: `cover_${card.id}`,
                cardId: card.id,
                title: d.title || '',
                subtitle: d.subtitle || '',
                description: d.description || '',
                metaHeader: d.metaHeader || [],
                category: d.category || '',
                image: d.image || '',
                action: userId ? interpolateId(d.action, userId) : d.action || null,
                badge_id: card.badge_id || null,
                resource_type: d.resource_type || null,
                resource_id: d.resource_id || null,
                completed: !!d.completed
            });
        } else if (card.card_type === 'train_item') {
            const key = card.group_title || 'Sem Grupo';
            if (!trainMap[key]) {
                trainMap[key] = {
                    type: card.section || 'slider',
                    title: key,
                    items: []
                };
            }
            trainMap[key].items.push({
                id: `course_${card.id}`,
                cardId: card.id,
                data: {
                    title: d.title || '',
                    subtitle: d.subtitle || '',
                    cover: d.cover || d.image || '',
                    description: d.description || '',
                    metaHeader: d.metaHeader || [],
                    category: d.category || '',
                    link: userId ? interpolateId(d.link, userId) : d.link || '',
                    badge_id: card.badge_id || null,
                    resource_type: d.resource_type || null,
                    resource_id: d.resource_id || null,
                    completed: !!d.completed
                }
            });
        }
    }

    return {
        layout: { columns: 3, gap: 16, baseRowHeight: 165 },
        cover,
        trains: Object.values(trainMap)
    };
}

async function createTrainingCompletionsTable() {
    await cenos_pool.query(`
        CREATE TABLE IF NOT EXISTS agent_training_completions (
            id SERIAL PRIMARY KEY,
            training_id INTEGER NOT NULL,
            agent_id VARCHAR(50) NOT NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(training_id, agent_id)
        )
    `);
}

async function recordTrainingCompletion(trainingId, agentId) {
    await createTrainingCompletionsTable();
    await cenos_pool.query(
        `INSERT INTO agent_training_completions (training_id, agent_id)
         VALUES ($1, $2)
         ON CONFLICT (training_id, agent_id) DO NOTHING`,
        [trainingId, String(agentId)]
    );
}

async function checkTrainingCompletion(trainingId, agentId) {
    await createTrainingCompletionsTable();
    const { rows } = await cenos_pool.query(
        `SELECT id FROM agent_training_completions
         WHERE training_id = $1 AND agent_id = $2
         LIMIT 1`,
        [trainingId, String(agentId)]
    );
    return rows.length > 0;
}

async function completeCeneducCard(cardId, agentId) {
    const card = await getCeneducCardById(cardId);
    if (!card) {
        throw new Error('Card não encontrado');
    }

    const d = card.data || {};
    const resourceType = d.resource_type;
    const resourceId = d.resource_id;

    if (!resourceType || !resourceId) {
        throw new Error('Este card não possui um recurso vinculado');
    }

    let completed = false;

    if (resourceType === 'training') {
        const { getTrainingProjectById } = require('./trainingProjects');
        const training = await getTrainingProjectById(parseInt(resourceId, 10));
        if (!training) {
            throw new Error('Treinamento não encontrado');
        }
        completed = await checkTrainingCompletion(parseInt(resourceId, 10), agentId);
    } else if (resourceType === 'form') {
        const { checkFormResponse } = require('./forms');
        completed = await checkFormResponse(parseInt(resourceId, 10), agentId);
    }

    if (!completed) {
        throw new Error('Você ainda não completou este recurso');
    }

    if (!card.badge_id) {
        throw new Error('Este card não possui badge configurado');
    }

    const { addBadgeToProfile } = require('./agentes');
    const updatedBadges = await addBadgeToProfile(String(agentId), card.badge_id);

    return { success: true, agentId, cardId: card.id, badgeId: card.badge_id, badges: updatedBadges };
}

async function checkCeneducCardResourceCompleted(cardId, agentId) {
    const card = await getCeneducCardById(cardId);
    if (!card) return false;

    const d = card.data || {};
    const resourceType = d.resource_type;
    const resourceId = d.resource_id;

    if (!resourceType || !resourceId) return false;

    if (resourceType === 'training') {
        return checkTrainingCompletion(parseInt(resourceId, 10), agentId);
    }

    if (resourceType === 'form') {
        const { checkFormResponse } = require('./forms');
        return checkFormResponse(parseInt(resourceId, 10), agentId);
    }

    return false;
}

module.exports = {
    createCeneducCardsTable,
    listCeneducCards,
    getCeneducCardById,
    createCeneducCard,
    updateCeneducCard,
    deleteCeneducCard,
    getCeneducForAgent,
    completeCeneducCard,
    checkCeneducCardResourceCompleted,
    recordTrainingCompletion,
    checkTrainingCompletion
};
