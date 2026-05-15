const { cenos_pool } = require('../../db');
const { TRAINING_BUILDER_SYSTEM_PROMPT } = require('../../llm/prompts/trainingBuilder');
const llm = require('../../llm');

async function createTrainingChatTable() {
    await cenos_pool.query(`
        CREATE TABLE IF NOT EXISTS training_chat_messages (
            id SERIAL PRIMARY KEY,
            training_id INTEGER REFERENCES training_projects(id) ON DELETE CASCADE,
            role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);
    await cenos_pool.query(`
        CREATE INDEX IF NOT EXISTS idx_training_chat_messages_training_id ON training_chat_messages(training_id)
    `).catch(() => {});
}

async function getChatMessages(trainingId) {
    await createTrainingChatTable();
    const { rows } = await cenos_pool.query(
        `SELECT id, role, content, created_at FROM training_chat_messages WHERE training_id = $1 ORDER BY created_at ASC`,
        [trainingId]
    );
    return rows;
}

async function addChatMessage(trainingId, role, content) {
    await createTrainingChatTable();
    const { rows } = await cenos_pool.query(
        `INSERT INTO training_chat_messages (training_id, role, content) VALUES ($1, $2, $3) RETURNING id, role, content, created_at`,
        [trainingId, role, content]
    );
    return rows[0];
}

async function clearChatMessages(trainingId) {
    await createTrainingChatTable();
    await cenos_pool.query(`DELETE FROM training_chat_messages WHERE training_id = $1`, [trainingId]);
}

async function sendTrainingChatMessage(trainingId, userMessage, currentFlowData) {
    await createTrainingChatTable();

    // Save user message
    await addChatMessage(trainingId, 'user', userMessage);

    // Build message array for LLM
    const history = await getChatMessages(trainingId);

    const messages = [
        { role: 'system', content: TRAINING_BUILDER_SYSTEM_PROMPT },
        {
            role: 'system',
            content: `A estrutura ATUAL do treinamento (flow_data JSON) é:\n\`\`\`json\n${JSON.stringify(currentFlowData, null, 2)}\n\`\`\`\n\nConsidere esta estrutura como base para suas respostas. Quando fizer alterações, retorne o JSON completo do flow_data atualizado.`
        },
        ...history.map(m => ({ role: m.role, content: m.content })),
    ];

    // Call LLM
    const llmResponse = await llm.generateResponse(messages);

    // Save assistant response
    const saved = await addChatMessage(trainingId, 'assistant', llmResponse);

    // Try to extract JSON from response
    let parsedStructure = null;
    const jsonMatch = llmResponse.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
        try {
            parsedStructure = JSON.parse(jsonMatch[1]);
        } catch (e) {
            // JSON malformed
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
    sendTrainingChatMessage,
};
