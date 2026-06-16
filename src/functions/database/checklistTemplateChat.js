const { cenos_pool } = require('../../db');
const { CHECKLIST_TEMPLATE_BUILDER_SYSTEM_PROMPT } = require('../../llm/prompts/checklistTemplateBuilder');
const llm = require('../../llm');
const axios = require('axios');

async function urlToGeminiPart(url, mimeType) {
    try {
        let response;
        let resolvedUrl = url;
        if (url.startsWith('/')) {
            const port = process.env.PORT || 3000;
            resolvedUrl = `http://127.0.0.1:${port}${url}`;
        }
        
        response = await axios.get(resolvedUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);
        const base64Data = buffer.toString('base64');
        
        const finalMimeType = mimeType || response.headers['content-type'] || 'application/octet-stream';
        
        return {
            inlineData: {
                mimeType: finalMimeType,
                data: base64Data
            }
        };
    } catch (err) {
        console.error(`Erro ao converter URL para Gemini Part: ${url}`, err);
        return null;
    }
}

async function getChatMessages(templateId) {
    const { rows } = await cenos_pool.query(
        `SELECT id, role, content, attachments, created_at FROM checklist_template_chat_messages WHERE template_id = $1 ORDER BY created_at ASC`,
        [templateId]
    );
    return rows;
}

async function addChatMessage(templateId, role, content, attachments = null) {
    const { rows } = await cenos_pool.query(
        `INSERT INTO checklist_template_chat_messages (template_id, role, content, attachments) VALUES ($1, $2, $3, $4) RETURNING id, role, content, attachments, created_at`,
        [templateId, role, content, attachments ? JSON.stringify(attachments) : null]
    );
    return rows[0];
}

async function clearChatMessages(templateId) {
    await cenos_pool.query(`DELETE FROM checklist_template_chat_messages WHERE template_id = $1`, [templateId]);
}

async function sendChatMessage(templateId, userMessage, currentTemplateStructure, attachments = null) {
    // Save user message
    await addChatMessage(templateId, 'user', userMessage, attachments);

    // Build message array for LLM
    const history = await getChatMessages(templateId);

    const messages = [
        { role: 'system', content: CHECKLIST_TEMPLATE_BUILDER_SYSTEM_PROMPT },
        {
            role: 'system',
            content: `A estrutura ATUAL do checklist (JSON) é:\n\`\`\`json\n${JSON.stringify(currentTemplateStructure, null, 2)}\n\`\`\`\n\nConsidere esta estrutura como base para suas respostas. Quando fizer alterações, retorne o JSON completo do checklist atualizado.`
        }
    ];

    for (const m of history) {
        let atts = [];
        if (m.attachments) {
            try {
                atts = typeof m.attachments === 'string' ? JSON.parse(m.attachments) : m.attachments;
            } catch (e) {
                atts = m.attachments;
            }
        }

        if (Array.isArray(atts) && atts.length > 0) {
            const parts = [{ text: m.content || '' }];
            for (const att of atts) {
                const part = await urlToGeminiPart(att.url, att.mimeType);
                if (part) {
                    parts.push(part);
                }
            }
            messages.push({ role: m.role, parts });
        } else {
            messages.push({ role: m.role, content: m.content });
        }
    }

    // Call LLM
    const llmResponse = await llm.generateResponse(messages);

    // Save assistant response
    const saved = await addChatMessage(templateId, 'assistant', llmResponse);

    // Try to extract JSON from response
    let parsedStructure = null;

    // Try code block first
    const codeBlockMatch = llmResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
        try {
            parsedStructure = JSON.parse(codeBlockMatch[1].trim());
        } catch (e) {
            console.error("Erro ao fazer parse do JSON (Checklist) dentro do bloco de código:", e);
        }
    }

    // Fallback to raw braces
    if (!parsedStructure) {
        const firstBrace = llmResponse.indexOf('{');
        const lastBrace = llmResponse.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            try {
                parsedStructure = JSON.parse(llmResponse.substring(firstBrace, lastBrace + 1));
            } catch (e) {
                console.error("Erro ao fazer parse do JSON bruto (Checklist):", e);
            }
        }
    }

    return {
        message: saved,
        parsedStructure,
    };
}

async function applyTemplateStructure(templateId, structure) {
    const client = await cenos_pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Update checklist template details
        if (structure.title) {
            await client.query(
                'UPDATE checklist_templates SET title = $1, description = $2, updated_at = NOW() WHERE id = $3',
                [structure.title, structure.description || null, templateId]
            );
        }

        // 2. Fetch existing sections and questions
        const { rows: existingSections } = await client.query(
            'SELECT id FROM checklist_sections WHERE template_id = $1',
            [templateId]
        );
        const { rows: existingQuestions } = await client.query(
            'SELECT id FROM checklist_questions WHERE template_id = $1',
            [templateId]
        );

        const existingSectionIds = existingSections.map(s => s.id);
        const existingQuestionIds = existingQuestions.map(q => q.id);

        const proposedSectionIds = [];
        const proposedQuestionIds = [];

        // 3. Process proposed sections and questions
        const sections = structure.sections || [];
        for (let sIdx = 0; sIdx < sections.length; sIdx++) {
            const sec = sections[sIdx];
            let sectionId = sec.id;
            
            // Check if sectionId is valid UUID and exists
            const sectionExists = sectionId && existingSectionIds.includes(sectionId);

            if (sectionExists) {
                // Update section
                await client.query(
                    `UPDATE checklist_sections SET 
                        title = $1, 
                        order_index = $2, 
                        section_color = $3, 
                        section_icon = $4 
                     WHERE id = $5`,
                    [sec.title, sIdx, sec.section_color || '#3B82F6', sec.section_icon || 'ShieldCheck', sectionId]
                );
            } else {
                // Insert section
                const res = await client.query(
                    `INSERT INTO checklist_sections (template_id, title, order_index, section_color, section_icon) 
                     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                    [templateId, sec.title, sIdx, sec.section_color || '#3B82F6', sec.section_icon || 'ShieldCheck']
                );
                sectionId = res.rows[0].id;
            }
            proposedSectionIds.push(sectionId);

            const questions = sec.questions || [];
            for (let qIdx = 0; qIdx < questions.length; qIdx++) {
                const q = questions[qIdx];
                let questionId = q.id;

                const questionExists = questionId && existingQuestionIds.includes(questionId);

                // Prepare options payload
                let optionsPayload = q.options;
                if (q.question_type === 'multiple_choice' && Array.isArray(q.options)) {
                    optionsPayload = q.options.map(o => ({
                        label: o.label,
                        value: o.value || o.label.toLowerCase().replace(/\s+/g, '_'),
                        is_compliant: o.is_compliant !== false
                    }));
                } else if (q.question_type === 'rating' && q.options) {
                    optionsPayload = {
                        min: Number(q.options.min || 1),
                        max: Number(q.options.max || 5),
                        compliant_threshold: Number(q.options.compliant_threshold || 3)
                    };
                } else {
                    optionsPayload = null;
                }

                if (questionExists) {
                    // Update question
                    await client.query(
                        `UPDATE checklist_questions SET 
                            section_id = $1,
                            label = $2,
                            required = $3,
                            requires_photo = $4,
                            severity = $5,
                            exemption_days = $6,
                            order_index = $7,
                            question_type = $8,
                            options = $9
                         WHERE id = $10`,
                        [
                            sectionId,
                            q.label,
                            q.required !== false,
                            q.requires_photo === true,
                            q.severity || 'normal',
                            q.exemption_days || 0,
                            qIdx,
                            q.question_type || 'binary',
                            optionsPayload ? JSON.stringify(optionsPayload) : null,
                            questionId
                        ]
                    );
                } else {
                    // Insert question
                    const res = await client.query(
                        `INSERT INTO checklist_questions (
                            section_id, template_id, label, required, requires_photo, severity, exemption_days, order_index, question_type, options
                         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
                        [
                            sectionId,
                            templateId,
                            q.label,
                            q.required !== false,
                            q.requires_photo === true,
                            q.severity || 'normal',
                            q.exemption_days || 0,
                            qIdx,
                            q.question_type || 'binary',
                            optionsPayload ? JSON.stringify(optionsPayload) : null
                        ]
                    );
                    questionId = res.rows[0].id;
                }
                proposedQuestionIds.push(questionId);
            }
        }

        // 4. Delete questions and sections not in the proposed lists
        const deletedQuestionIds = existingQuestionIds.filter(id => !proposedQuestionIds.includes(id));
        if (deletedQuestionIds.length > 0) {
            await client.query('DELETE FROM checklist_questions WHERE id = ANY($1)', [deletedQuestionIds]);
        }

        const deletedSectionIds = existingSectionIds.filter(id => !proposedSectionIds.includes(id));
        if (deletedSectionIds.length > 0) {
            await client.query('DELETE FROM checklist_sections WHERE id = ANY($1)', [deletedSectionIds]);
        }

        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('[DATABASE_CHECKLIST_CHAT] Erro ao aplicar estrutura de checklist:', e);
        throw e;
    } finally {
        client.release();
    }
}

module.exports = {
    getChatMessages,
    addChatMessage,
    clearChatMessages,
    sendChatMessage,
    applyTemplateStructure,
};
