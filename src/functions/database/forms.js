const { cenos_pool } = require('../../db');
const { addBadgeToProfile } = require('./agentes');
const { assignBadgesFromLinkedCeneducCards } = require('./ceneduc');

async function createFormsTable() {
    await cenos_pool.query(`
        CREATE TABLE IF NOT EXISTS forms (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            title TEXT NOT NULL,
            description TEXT,
            cover_url TEXT,
            is_active BOOLEAN DEFAULT false,
            badge_id INTEGER,
            settings JSONB DEFAULT '{}',
            structure JSONB NOT NULL DEFAULT '[]',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);

    await cenos_pool.query(`
        CREATE TABLE IF NOT EXISTS form_responses (
            id SERIAL PRIMARY KEY,
            form_id INTEGER REFERENCES forms(id) ON DELETE CASCADE,
            answers JSONB NOT NULL DEFAULT '{}',
            submitted_at TIMESTAMP DEFAULT NOW(),
            metadata JSONB DEFAULT '{}'
        )
    `);

    await cenos_pool.query(`
        CREATE INDEX IF NOT EXISTS idx_form_responses_form_id ON form_responses(form_id)
    `);

    await cenos_pool.query(`
        CREATE INDEX IF NOT EXISTS idx_form_responses_submitted_at ON form_responses(submitted_at)
    `);

    await cenos_pool.query(`
        ALTER TABLE forms ADD COLUMN IF NOT EXISTS badge_id INTEGER;
    `).catch(() => {});
}

async function createForm({ userId, title, description, coverUrl, settings, structure, badge_id }) {
    await createFormsTable();
    const pool = cenos_pool;

    const query = `
        INSERT INTO forms (user_id, title, description, cover_url, badge_id, settings, structure)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
    `;
    const { rows } = await pool.query(query, [
        userId,
        title,
        description || null,
        coverUrl || null,
        badge_id || null,
        typeof settings === 'object' ? JSON.stringify(settings) : (settings || '{}'),
        typeof structure === 'object' ? JSON.stringify(structure) : (structure || '[]')
    ]);
    return rows[0];
}

async function getFormById(id) {
    await createFormsTable();
    const pool = cenos_pool;
    const query = `SELECT * FROM forms WHERE id = $1`;
    const { rows } = await pool.query(query, [id]);
    return rows[0] || null;
}

async function listForms(userId, page = 1, limit = 20) {
    await createFormsTable();
    const pool = cenos_pool;
    const offset = (page - 1) * limit;

    const countQuery = `SELECT COUNT(*) as total FROM forms WHERE user_id = $1`;
    const { rows: countRows } = await pool.query(countQuery, [userId]);
    const total = parseInt(countRows[0].total, 10);

    const query = `
        SELECT * FROM forms
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

async function updateForm(id, { title, description, coverUrl, isActive, settings, structure, badge_id }) {
    await createFormsTable();
    const pool = cenos_pool;
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
    if (coverUrl !== undefined) {
        updates.push(`cover_url = $${paramIndex}`);
        params.push(coverUrl);
        paramIndex++;
    }
    if (typeof isActive === 'boolean') {
        updates.push(`is_active = $${paramIndex}`);
        params.push(isActive);
        paramIndex++;
    }
    if (badge_id !== undefined) {
        updates.push(`badge_id = $${paramIndex}`);
        params.push(badge_id);
        paramIndex++;
    }
    if (settings !== undefined) {
        updates.push(`settings = $${paramIndex}`);
        params.push(typeof settings === 'object' ? JSON.stringify(settings) : settings);
        paramIndex++;
    }
    if (structure !== undefined) {
        updates.push(`structure = $${paramIndex}`);
        params.push(typeof structure === 'object' ? JSON.stringify(structure) : structure);
        paramIndex++;
    }

    if (updates.length === 0) return null;

    updates.push(`updated_at = NOW()`);
    params.push(id);

    const query = `
        UPDATE forms SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
    `;
    const { rows } = await pool.query(query, params);
    return rows[0] || null;
}

async function checkFormResponse(formId, respondentId) {
    await createFormsTable();
    const pool = cenos_pool;
    const query = `
        SELECT id FROM form_responses 
        WHERE form_id = $1 AND answers->>'respondent_id' = $2
        LIMIT 1
    `;
    const { rows } = await pool.query(query, [formId, String(respondentId)]);
    return rows.length > 0;
}

async function deleteForm(id) {
    await createFormsTable();
    const pool = cenos_pool;
    const query = `DELETE FROM forms WHERE id = $1 RETURNING *`;
    const { rows } = await pool.query(query, [id]);
    return rows[0] || null;
}

async function submitForm({ formId, answers, metadata }) {
    const pool = cenos_pool;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const checkQuery = `SELECT id, structure, settings, badge_id FROM forms WHERE id = $1 AND is_active = true`;
        const checkResult = await client.query(checkQuery, [formId]);
        
        if (checkResult.rows.length === 0) {
            throw new Error('Formulário não encontrado ou inativo');
        }

        const form = checkResult.rows[0];

        // Se o formulário limitar a uma resposta por usuário
        const respondentId = answers.respondent_id;
        if (form.settings?.limitToOneResponse && respondentId) {
            const duplicateCheck = await client.query(
                `SELECT id FROM form_responses 
                 WHERE form_id = $1 AND answers->>'respondent_id' = $2`,
                [formId, String(respondentId)]
            );
            
            if (duplicateCheck.rows.length > 0) {
                throw new Error('Você já enviou uma resposta para este formulário');
            }
        }

        const errors = validateFormStructure(form.structure, answers);
        if (errors.length > 0) {
            throw new Error(errors.join('; '));
        }

        const insertQuery = `
            INSERT INTO form_responses (form_id, answers, metadata)
            VALUES ($1, $2, $3)
            RETURNING *
        `;
        const { rows } = await client.query(insertQuery, [
            formId, 
            JSON.stringify(answers), 
            JSON.stringify(metadata || {})
        ]);

        await client.query('COMMIT');

        // Após submit bem-sucedido, atribui badge se configurado
        if (respondentId) {
            try {
                // 1. Badge direta do formulário
                if (form.badge_id) {
                    await addBadgeToProfile(String(respondentId), form.badge_id);
                }
                
                // 2. Badges de cards do CenEduc que apontam para este formulário
                await assignBadgesFromLinkedCeneducCards('form', formId, respondentId);
                
            } catch (badgeErr) {
                console.error('Erro ao atribuir badge após submit do formulário:', badgeErr.message);
            }
        }

        return rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

function validateFormStructure(structure, answers) {
    const errors = [];
    
    if (!structure || !Array.isArray(structure)) return errors;

    for (const page of structure) {
        if (!page.elements || !Array.isArray(page.elements)) continue;
        
        for (const element of page.elements) {
            if (element.required && element.type === 'question') {
                const answer = answers[element.id];
                if (answer === undefined || answer === null || answer === '') {
                    errors.push(`Campo "${element.label}" é obrigatório`);
                }
            }
        }
    }
    
    return errors;
}

async function getFormResponses(formId, page = 1, limit = 20) {
    await createFormsTable();
    const pool = cenos_pool;
    const offset = (page - 1) * limit;

    const countQuery = `SELECT COUNT(*) as total FROM form_responses WHERE form_id = $1`;
    const { rows: countRows } = await pool.query(countQuery, [formId]);
    const total = parseInt(countRows[0].total, 10);

    const query = `
        SELECT * FROM form_responses
        WHERE form_id = $1
        ORDER BY submitted_at DESC
        LIMIT $2 OFFSET $3
    `;
    const { rows } = await pool.query(query, [formId, limit, offset]);

    return {
        data: rows,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
    };
}

async function getFormStats(formId) {
    await createFormsTable();
    const pool = cenos_pool;

    const formQuery = `SELECT structure FROM forms WHERE id = $1`;
    const formResult = await pool.query(formQuery, [formId]);
    if (formResult.rows.length === 0) return null;

    const structure = formResult.rows[0].structure;
    const responsesQuery = `SELECT answers FROM form_responses WHERE form_id = $1`;
    const responsesResult = await pool.query(responsesQuery, [formId]);

    const stats = {
        totalResponses: responsesResult.rows.length,
        byField: {}
    };

    const fieldTypes = {};
    if (structure && Array.isArray(structure)) {
        for (const page of structure) {
            if (!page.elements) continue;
            for (const element of page.elements) {
                fieldTypes[element.id] = element;
            }
        }
    }

    for (const response of responsesResult.rows) {
        const answers = response.answers;
        for (const [fieldId, value] of Object.entries(answers)) {
            const field = fieldTypes[fieldId];
            if (!field) continue;

            if (!stats.byField[fieldId]) {
                stats.byField[fieldId] = {
                    label: field.label,
                    fieldType: field.field_type,
                    type: field.type,
                    total: 0
                };

                if (['dropdown', 'multiple_choice', 'radio'].includes(field.field_type)) {
                    stats.byField[fieldId].options = {};
                } else if (field.field_type === 'star_rating') {
                    stats.byField[fieldId].sum = 0;
                    stats.byField[fieldId].average = 0;
                }
            }

            stats.byField[fieldId].total++;

            if (['dropdown', 'multiple_choice', 'radio'].includes(field.field_type)) {
                const key = Array.isArray(value) ? value.join(', ') : value;
                stats.byField[fieldId].options[key] = (stats.byField[fieldId].options[key] || 0) + 1;
            } else if (field.field_type === 'star_rating') {
                const numValue = parseInt(value, 10);
                if (!isNaN(numValue)) {
                    stats.byField[fieldId].sum += numValue;
                }
            }
        }
    }

    for (const [fieldId, fieldStats] of Object.entries(stats.byField)) {
        if (fieldStats.fieldType === 'star_rating' && fieldStats.total > 0) {
            fieldStats.average = (fieldStats.sum / fieldStats.total).toFixed(2);
        }
    }

    return stats;
}

async function exportFormResponsesToCsv(formId) {
    await createFormsTable();
    const pool = cenos_pool;

    const formQuery = `SELECT id, title, structure FROM forms WHERE id = $1`;
    const formResult = await pool.query(formQuery, [formId]);
    if (formResult.rows.length === 0) return null;

    const form = formResult.rows[0];
    const structure = form.structure;

    const columns = ['response_id', 'submitted_at'];
    const fieldIds = {};

    if (structure && Array.isArray(structure)) {
        for (const page of structure) {
            if (!page.elements) continue;
            for (const element of page.elements) {
                columns.push(element.label || element.id);
                fieldIds[element.id] = element;
            }
        }
    }

    const responsesQuery = `
        SELECT id, submitted_at, answers 
        FROM form_responses 
        WHERE form_id = $1 
        ORDER BY submitted_at DESC
    `;
    const responsesResult = await pool.query(responsesQuery, [formId]);

    const rows = [columns.join(',')];
    
    for (const response of responsesResult.rows) {
        const row = [
            response.id,
            response.submitted_at
        ];
        
        for (const col of columns.slice(2)) {
            const fieldId = Object.keys(fieldIds).find(k => fieldIds[k].label === col);
            const value = fieldId ? response.answers[fieldId] : '';
            const cellValue = Array.isArray(value) ? value.join('; ') : (value || '');
            row.push(`"${String(cellValue).replace(/"/g, '""')}"`);
        }
        
        rows.push(row.join(','));
    }

    return {
        filename: `${form.title.replace(/[^a-z0-9]/gi, '_')}_${formId}.csv`,
        headers: columns,
        rows: responsesResult.rows.map(r => ({
            id: r.id,
            submitted_at: r.submitted_at,
            ...r.answers
        })),
        csv: rows.join('\n')
    };
}

module.exports = {
    createFormsTable,
    createForm,
    getFormById,
    listForms,
    updateForm,
    deleteForm,
    submitForm,
    getFormResponses,
    getFormStats,
    exportFormResponsesToCsv,
    validateFormStructure,
    checkFormResponse
};
