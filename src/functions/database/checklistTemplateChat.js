const crypto = require('crypto');
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

    const flatStructure = {
        title: currentTemplateStructure.title || '',
        description: currentTemplateStructure.data?.description || null,
        estado: currentTemplateStructure.estado || null,
        sections: (currentTemplateStructure.data?.sections || []).map((sec, sIdx) => ({
            title: sec.title,
            color: sec.color || '#3B82F6',
            icon: sec.icon || 'ShieldCheck',
            questions: (sec.questions || []).map((q, qIdx) => ({
                ...(q.uuid ? { uuid: q.uuid } : {}),
                label: q.label,
                required: q.required !== false,
                requires_photo: q.requires_photo === true,
                severity: q.severity || 'normal',
                exemption_days: q.exemption_days || 0,
                question_type: q.question_type || 'binary',
                options: q.options || null
            }))
        }))
    };

    const messages = [
        { role: 'system', content: CHECKLIST_TEMPLATE_BUILDER_SYSTEM_PROMPT },
        {
            role: 'system',
            content: `A estrutura ATUAL do checklist (JSON) é:\n\`\`\`json\n${JSON.stringify(flatStructure, null, 2)}\n\`\`\`\n\nConsidere esta estrutura como base para suas respostas. Quando fizer alterações, retorne o JSON completo do checklist atualizado.`
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
    const sections = (structure.sections || []).map((sec, sIdx) => ({
        title: sec.title,
        order: sIdx,
        color: sec.section_color || sec.color || '#3B82F6',
        icon: sec.section_icon || sec.icon || 'ShieldCheck',
        questions: (sec.questions || []).map((q, qIdx) => {
            let options = q.options || null;
            if (q.question_type === 'multiple_choice' && Array.isArray(options)) {
                options = options.map(o => ({
                    label: o.label,
                    value: o.value || o.label.toLowerCase().replace(/\s+/g, '_'),
                    is_compliant: o.is_compliant !== false
                }));
            } else if (q.question_type === 'rating' && options) {
                options = {
                    min: Number(options.min || 1),
                    max: Number(options.max || 5),
                    compliant_threshold: Number(options.compliant_threshold || 3)
                };
            } else if (q.question_type === 'binary') {
                options = null;
            }
            return {
                uuid: q.uuid || q.id || crypto.randomUUID(),
                label: q.label,
                required: q.required !== false,
                requires_photo: q.requires_photo === true,
                severity: q.severity || 'normal',
                exemption_days: q.exemption_days || 0,
                order: qIdx,
                question_type: q.question_type || 'binary',
                options
            };
        })
    }));

    const data = {
        description: structure.description || null,
        sections
    };

    await cenos_pool.query(
        `UPDATE checklist_templates SET title = $1, estado = $2, data = $3, updated_at = NOW() WHERE id = $4`,
        [structure.title, structure.estado || null, data, templateId]
    );
}

module.exports = {
    getChatMessages,
    addChatMessage,
    clearChatMessages,
    sendChatMessage,
    applyTemplateStructure,
};
