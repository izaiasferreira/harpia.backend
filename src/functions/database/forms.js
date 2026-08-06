const { sinergia_pool } = require('../../db');
const { addBadgeToProfile } = require('./agentes');
const { assignBadgesFromLinkedCeneducCards } = require('./ceneduc');
const { formCreateSchema, formSchema, formSubmitSchema } = require('../../db/schemas');

async function createForm({ userId, title, description, coverUrl, settings, structure, badge_id }) {
    const validated = formCreateSchema.parse({
        user_id: userId,
        title,
        description,
        cover_url: coverUrl,
        badge_id,
        settings,
        structure
    });
    const pool = sinergia_pool;

    const query = `
        INSERT INTO forms (user_id, title, description, cover_url, badge_id, settings, structure)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
    `;
    const { rows } = await pool.query(query, [
        validated.user_id,
        validated.title,
        validated.description || null,
        validated.cover_url || null,
        validated.badge_id || null,
        typeof validated.settings === 'object' ? JSON.stringify(validated.settings) : (validated.settings || '{}'),
        typeof validated.structure === 'object' ? JSON.stringify(validated.structure) : (validated.structure || '[]')
    ]);
    return rows[0];
}

async function getFormById(id) {
    const pool = sinergia_pool;
    const query = `SELECT * FROM forms WHERE id = $1`;
    const { rows } = await pool.query(query, [id]);
    return rows[0] || null;
}

async function listForms(userId, page = 1, limit = 20) {
    const pool = sinergia_pool;
    const offset = (page - 1) * limit;

    const countQuery = `SELECT COUNT(*) as total FROM forms`;
    const { rows: countRows } = await pool.query(countQuery);
    const total = parseInt(countRows[0].total, 10);

    const query = `
        SELECT * FROM forms
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

async function updateForm(id, { title, description, coverUrl, isActive, settings, structure, badge_id }) {
    const validated = formSchema.partial().parse({
        title,
        description,
        cover_url: coverUrl,
        is_active: isActive,
        badge_id,
        settings,
        structure
    });
    const pool = sinergia_pool;
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
    if (validated.cover_url !== undefined) {
        updates.push(`cover_url = $${paramIndex}`);
        params.push(validated.cover_url);
        paramIndex++;
    }
    if (typeof validated.is_active === 'boolean') {
        updates.push(`is_active = $${paramIndex}`);
        params.push(validated.is_active);
        paramIndex++;
    }
    if (validated.badge_id !== undefined) {
        updates.push(`badge_id = $${paramIndex}`);
        params.push(validated.badge_id);
        paramIndex++;
    }
    if (validated.settings !== undefined) {
        updates.push(`settings = $${paramIndex}`);
        params.push(typeof validated.settings === 'object' ? JSON.stringify(validated.settings) : validated.settings);
        paramIndex++;
    }
    if (validated.structure !== undefined) {
        updates.push(`structure = $${paramIndex}`);
        params.push(typeof validated.structure === 'object' ? JSON.stringify(validated.structure) : validated.structure);
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
    const pool = sinergia_pool;
    const query = `
        SELECT id FROM form_responses 
        WHERE form_id = $1 AND answers->>'respondent_id' = $2
        LIMIT 1
    `;
    const { rows } = await pool.query(query, [formId, String(respondentId)]);
    return rows.length > 0;
}

async function deleteForm(id) {
    const pool = sinergia_pool;
    const query = `DELETE FROM forms WHERE id = $1 RETURNING *`;
    const { rows } = await pool.query(query, [id]);
    return rows[0] || null;
}

async function submitForm({ formId, answers, metadata }) {
    const validated = formSubmitSchema.parse({
        form_id: Number(formId),
        answers,
        metadata
    });
    formId = validated.form_id;
    answers = validated.answers;
    metadata = validated.metadata;
    const pool = sinergia_pool;
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

        const scoreResult = calcScoreFromStructure(form.structure, answers);
        if (scoreResult) {
            metadata = { ...(metadata || {}), score: scoreResult.score, maxScore: scoreResult.maxScore };
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

function calcScoreFromStructure(structure, answers) {
    const allElements = (structure || []).flatMap(p => p.elements || []);
    const hasScoring = allElements.some(f => f.type === 'question' && f.points);

    if (!hasScoring) return null;

    let score = 0;
    let maxScore = 0;

    allElements.forEach(field => {
        if (field.type === 'question' && field.points) {
            const pts = Number(field.points) || 0;
            maxScore += pts;
            if (field.correctAnswer !== undefined && field.correctAnswer !== '') {
                const userVal = answers[field.id];
                const correctVal = field.correctAnswer;

                let isCorrect = false;
                if (Array.isArray(userVal)) {
                    const sortedUser = [...userVal].map(v => String(v).trim().toLowerCase()).sort().join(',');
                    const sortedCorrect = String(correctVal).split(',').map(s => s.trim().toLowerCase()).sort().join(',');
                    isCorrect = sortedUser === sortedCorrect;
                    if (!isCorrect && field.options) {
                        const correctLabels = String(correctVal).split(',').map(v => {
                            const opt = field.options.find(o => o.value === v.trim());
                            return opt ? opt.label.trim().toLowerCase() : v.trim().toLowerCase();
                        }).sort().join(',');
                        isCorrect = sortedUser === correctLabels;
                    }
                } else {
                    isCorrect = String(userVal || '').trim().toLowerCase() === String(correctVal || '').trim().toLowerCase();
                    if (!isCorrect && field.options) {
                        const correctOpt = field.options.find(o => o.value === correctVal);
                        if (correctOpt) {
                            isCorrect = String(userVal || '').trim().toLowerCase() === correctOpt.label.trim().toLowerCase();
                        }
                    }
                }

                if (isCorrect) {
                    score += pts;
                }
            }
        }
    });

    return { score, maxScore };
}

async function getFormResponses(formId, page = 1, limit = 20) {
    const pool = sinergia_pool;
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

    // Buscar dados dos agentes (nome, seccional, regional) para respostas não-anônimas
    const agentIds = rows
        .map(r => r.answers?.respondent_id)
            .filter(id => id && !String(id).startsWith('ANON'));
    const agentMap = {};
    if (agentIds.length > 0) {
        const placeholders = agentIds.map((_, i) => `$${i + 1}`).join(',');
        const agentQuery = `SELECT "ID", "Nome", "seccional", "regional", estado FROM colaboradores WHERE "ID" IN (${placeholders})`;
        try {
            const { rows: agentRows } = await sinergia_pool.query(agentQuery, agentIds);
            for (const a of agentRows) {
                agentMap[a['ID']] = { name: a['Nome'], seccional: a['seccional'], regional: a['regional'], state: a['estado']?.toUpperCase() };
            }
        } catch (_) { /* ignora erro */ }
    }

    // Calcular score para TODAS as respostas sem exceção
    const formQuery = `SELECT structure FROM forms WHERE id = $1`;
    const { rows: formRows } = await pool.query(formQuery, [formId]);
    const structure = formRows[0]?.structure;

    if (structure) {
        rows.forEach(row => {
            const scoreResult = calcScoreFromStructure(structure, row.answers || {});
            if (scoreResult) {
                row.metadata = { ...(row.metadata || {}), score: scoreResult.score, maxScore: scoreResult.maxScore };
            }
        });
    }

    // Anexar dados do agente (nome, seccional, regional) quando não for anônimo
    rows.forEach(row => {
        const rid = row.answers?.respondent_id;
        if (rid && !String(rid).startsWith('ANON') && agentMap[rid]) {
            row.agent_name = agentMap[rid].name;
            row.agent_seccional = agentMap[rid].seccional;
            row.agent_regional = agentMap[rid].regional;
            row.agent_state = agentMap[rid].state;
        }
    });

    return {
        data: rows,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
    };
}

async function getFormStats(formId) {
    const pool = sinergia_pool;

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
    const pool = sinergia_pool;

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

async function deleteFormResponse(id) {
    const { rows } = await sinergia_pool.query(
        'DELETE FROM form_responses WHERE id = $1 RETURNING *',
        [id]
    );
    return rows[0] || null;
}

module.exports = {
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
    checkFormResponse,
    deleteFormResponse
};
