const { cenos_pool } = require('../../db');
const { ceneducCardCreateSchema, ceneducCardSchema } = require('../../db/schemas');

async function listCeneducCards({ state, activeOnly = true } = {}) {

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
    const { rows } = await cenos_pool.query('SELECT * FROM ceneduc_cards WHERE id = $1', [id]);
    return rows[0] || null;
}

async function createCeneducCard({ card_type, section, group_title, state, sort_order, badge_id, data }) {
    const validated = ceneducCardCreateSchema.parse({ card_type, section, group_title, state, sort_order, badge_id, data });
    const { rows } = await cenos_pool.query(
        `INSERT INTO ceneduc_cards (card_type, section, group_title, state, sort_order, badge_id, data)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
            validated.card_type,
            validated.section || null,
            validated.group_title || null,
            validated.state || null,
            validated.sort_order || 0,
            validated.badge_id || null,
            typeof validated.data === 'string' ? validated.data : JSON.stringify(validated.data || {})
        ]
    );
    return rows[0];
}

async function updateCeneducCard(id, { card_type, section, group_title, state, sort_order, active, badge_id, data }) {
    const validated = ceneducCardSchema.partial().parse({ card_type, section, group_title, state, sort_order, active, badge_id, data });
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (validated.card_type !== undefined) {
        updates.push(`card_type = $${paramIndex}`);
        params.push(validated.card_type);
        paramIndex++;
    }
    if (validated.section !== undefined) {
        updates.push(`section = $${paramIndex}`);
        params.push(validated.section);
        paramIndex++;
    }
    if (validated.group_title !== undefined) {
        updates.push(`group_title = $${paramIndex}`);
        params.push(validated.group_title);
        paramIndex++;
    }
    if (validated.state !== undefined) {
        updates.push(`state = $${paramIndex}`);
        params.push(validated.state);
        paramIndex++;
    }
    if (validated.sort_order !== undefined) {
        updates.push(`sort_order = $${paramIndex}`);
        params.push(validated.sort_order);
        paramIndex++;
    }
    if (validated.active !== undefined) {
        updates.push(`active = $${paramIndex}`);
        params.push(validated.active);
        paramIndex++;
    }
    if (validated.badge_id !== undefined) {
        updates.push(`badge_id = $${paramIndex}`);
        params.push(validated.badge_id);
        paramIndex++;
    }
    if (validated.data !== undefined) {
        updates.push(`data = $${paramIndex}`);
        params.push(typeof validated.data === 'string' ? validated.data : JSON.stringify(validated.data));
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

/**
 * Resolves the navigation link for a card.
 * Priority: explicit link > derived from resource_type+resource_id > ''
 */
function resolveLink(data, userId) {
    const explicitLink = data.link ? String(data.link).trim() : '';
    if (explicitLink) {
        return userId ? interpolateId(explicitLink, userId) : explicitLink;
    }
    // Derive from resource
    const { resource_type, resource_id } = data;
    if (resource_type && resource_id) {
        if (resource_type === 'form') return `/f/${resource_id}`;
        if (resource_type === 'training') return `/training/view/${resource_id}`;
    }
    return '';
}

async function getCeneducForAgent(state, userId) {
    const cards = await listCeneducCards({ state, activeOnly: true });
    
    // Busca as badges do usuário para marcar cards como completados
    let userBadges = [];
    if (userId) {
        const { getUserData } = require('./agentes');
        const userData = await getUserData({ id: userId, state });
        userBadges = userData?.badges || [];
    }

    const userBadgeIds = userBadges.map(b => String(b.id || b));

    const cover = [];
    const trainMap = {};

    for (const card of cards) {
        const d = card.data || {};
        
        // Verifica se o card está completo:
        // 1. Já possui flag completed no data
        // 2. O usuário possui a badge vinculada ao card
        const isCompleted = !!d.completed || (card.badge_id && userBadgeIds.includes(String(card.badge_id)));

        if (card.card_type === 'cover') {
            const coverLink = resolveLink(d, userId);
            cover.push({
                id: `cover_${card.id}`,
                cardId: card.id,
                title: d.title || '',
                subtitle: d.subtitle || '',
                description: d.description || '',
                metaHeader: d.metaHeader || [],
                category: d.category || '',
                image: d.image || '',
                link: coverLink,
                action: coverLink ? { type: 'link', url: coverLink } : (userId ? interpolateId(d.action, userId) : d.action || null),
                badge_id: card.badge_id || null,
                resource_type: d.resource_type || null,
                resource_id: d.resource_id || null,
                completed: isCompleted
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
                    link: resolveLink(d, userId),
                    badge_id: card.badge_id || null,
                    resource_type: d.resource_type || null,
                    resource_id: d.resource_id || null,
                    completed: isCompleted
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

async function recordTrainingCompletion(trainingId, agentId) {
    await cenos_pool.query(
        `INSERT INTO agent_training_completions (training_id, agent_id)
         VALUES ($1, $2)
         ON CONFLICT (training_id, agent_id) DO NOTHING`,
        [trainingId, String(agentId)]
    );
}

async function checkTrainingCompletion(trainingId, agentId) {
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

    // Se o usuário já tem a badge vinculada ao card, consideramos completo
    if (card.badge_id) {
        const { getUserData } = require('./agentes');
        const userData = await getUserData({ id: agentId, state: card.state });
        const userBadges = userData?.badges || [];
        const userBadgeIds = userBadges.map(b => String(b.id || b));
        if (userBadgeIds.includes(String(card.badge_id))) {
            return true;
        }
    }

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

/**
 * Procura todos os cards do Ceneduc que apontam para este recurso
 * e atribui as badges aos perfis dos agentes.
 */
async function assignBadgesFromLinkedCeneducCards(resourceType, resourceId, agentId) {
    const { addBadgeToProfile } = require('./agentes');
    
    // Busca cards ativos que possuem badge_id e apontam para este recurso
    const query = `
        SELECT badge_id 
        FROM ceneduc_cards 
        WHERE active = true 
          AND badge_id IS NOT NULL 
          AND data->>'resource_type' = $1 
          AND data->>'resource_id' = $2
    `;
    
    try {
        const { rows } = await cenos_pool.query(query, [resourceType, String(resourceId)]);
        
        for (const card of rows) {
            if (card.badge_id) {
                await addBadgeToProfile(String(agentId), card.badge_id).catch(err => {
                    console.error(`Erro ao atribuir badge ${card.badge_id} via Ceneduc Card:`, err.message);
                });
            }
        }
    } catch (err) {
        console.error('Erro ao buscar cards do Ceneduc para atribuição de badge:', err.message);
    }
}

module.exports = {
    listCeneducCards,
    getCeneducCardById,
    createCeneducCard,
    updateCeneducCard,
    deleteCeneducCard,
    getCeneducForAgent,
    completeCeneducCard,
    checkCeneducCardResourceCompleted,
    recordTrainingCompletion,
    checkTrainingCompletion,
    assignBadgesFromLinkedCeneducCards
};
