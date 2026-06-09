const { cenos_pool } = require('../../db');
const { FORM_BUILDER_SYSTEM_PROMPT } = require('../../llm/prompts/formBuilder');
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

async function getChatMessages(formId) {
    const { rows } = await cenos_pool.query(
        `SELECT id, role, content, attachments, created_at FROM form_chat_messages WHERE form_id = $1 ORDER BY created_at ASC`,
        [formId]
    );
    return rows;
}

async function addChatMessage(formId, role, content, attachments = null) {
    const { rows } = await cenos_pool.query(
        `INSERT INTO form_chat_messages (form_id, role, content, attachments) VALUES ($1, $2, $3, $4) RETURNING id, role, content, attachments, created_at`,
        [formId, role, content, attachments ? JSON.stringify(attachments) : null]
    );
    return rows[0];
}

async function clearChatMessages(formId) {
    await cenos_pool.query(`DELETE FROM form_chat_messages WHERE form_id = $1`, [formId]);
}

async function sendChatMessage(formId, userMessage, currentFormStructure, attachments = null) {

    // Save user message
    await addChatMessage(formId, 'user', userMessage, attachments);

    // Build message array for LLM
    const history = await getChatMessages(formId);

    const messages = [
        { role: 'system', content: FORM_BUILDER_SYSTEM_PROMPT },
        {
            role: 'system',
            content: `A estrutura ATUAL do formulário (JSON) é:\n\`\`\`json\n${JSON.stringify(currentFormStructure, null, 2)}\n\`\`\`\n\nConsidere esta estrutura como base para suas respostas. Quando fizer alterações, retorne o JSON completo do formulário atualizado.`
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
    const saved = await addChatMessage(formId, 'assistant', llmResponse);

    // Try to extract JSON from response
    let parsedStructure = null;

    // Try code block first (most reliable)
    const codeBlockMatch = llmResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
        try {
            parsedStructure = JSON.parse(codeBlockMatch[1].trim());
        } catch (e) {
            console.error("Erro ao fazer parse do JSON (Forms) dentro do bloco de código:", e);
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
                console.error("Erro ao fazer parse do JSON bruto (Forms):", e);
            }
        }
    }

    return {
        message: saved,
        parsedStructure,
    };
}

module.exports = {
    getChatMessages,
    addChatMessage,
    clearChatMessages,
    sendChatMessage,
};
