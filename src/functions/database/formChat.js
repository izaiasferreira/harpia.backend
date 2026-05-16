const { cenos_pool } = require('../../db');
const { FORM_BUILDER_SYSTEM_PROMPT } = require('../../llm/prompts/formBuilder');
const llm = require('../../llm');

async function createFormChatTable() {
    await cenos_pool.query(`
        CREATE TABLE IF NOT EXISTS form_chat_messages (
            id SERIAL PRIMARY KEY,
            form_id INTEGER REFERENCES forms(id) ON DELETE CASCADE,
            role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);
    await cenos_pool.query(`
        CREATE INDEX IF NOT EXISTS idx_form_chat_messages_form_id ON form_chat_messages(form_id)
    `).catch(() => {});
}

async function getChatMessages(formId) {
    await createFormChatTable();
    const { rows } = await cenos_pool.query(
        `SELECT id, role, content, created_at FROM form_chat_messages WHERE form_id = $1 ORDER BY created_at ASC`,
        [formId]
    );
    return rows;
}

async function addChatMessage(formId, role, content) {
    await createFormChatTable();
    const { rows } = await cenos_pool.query(
        `INSERT INTO form_chat_messages (form_id, role, content) VALUES ($1, $2, $3) RETURNING id, role, content, created_at`,
        [formId, role, content]
    );
    return rows[0];
}

async function clearChatMessages(formId) {
    await createFormChatTable();
    await cenos_pool.query(`DELETE FROM form_chat_messages WHERE form_id = $1`, [formId]);
}

async function sendChatMessage(formId, userMessage, currentFormStructure) {
    await createFormChatTable();

    // Save user message
    await addChatMessage(formId, 'user', userMessage);

    // Build message array for LLM
    const history = await getChatMessages(formId);

    const messages = [
        { role: 'system', content: FORM_BUILDER_SYSTEM_PROMPT },
        {
            role: 'system',
            content: `A estrutura ATUAL do formulário (JSON) é:\n\`\`\`json\n${JSON.stringify(currentFormStructure, null, 2)}\n\`\`\`\n\nConsidere esta estrutura como base para suas respostas. Quando fizer alterações, retorne o JSON completo do formulário atualizado.`
        },
        ...history.map(m => ({ role: m.role, content: m.content })),
    ];

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
