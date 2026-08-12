const { cenos_pool } = require('../../db');
const { ALERT_BUILDER_SYSTEM_PROMPT } = require('../../llm/prompts/appAlertBuilder');
const llm = require('../../llm');

async function getAlertChatMessages(alertId) {
    const { rows } = await cenos_pool.query(
        `SELECT id, role, content, attachments, created_at FROM app_alert_chat_messages WHERE alert_id = $1 ORDER BY created_at ASC`,
        [alertId]
    );
    return rows;
}

async function addAlertChatMessage(alertId, role, content, attachments = []) {
    const { rows } = await cenos_pool.query(
        `INSERT INTO app_alert_chat_messages (alert_id, role, content, attachments) VALUES ($1, $2, $3, $4) RETURNING id, role, content, attachments, created_at`,
        [alertId, role, content, JSON.stringify(attachments)]
    );
    return rows[0];
}

async function clearAlertChatMessages(alertId) {
    await cenos_pool.query(`DELETE FROM app_alert_chat_messages WHERE alert_id = $1`, [alertId]);
}

async function sendAlertChatMessage(alertId, userMessage, currentContent, attachments = []) {
    await addAlertChatMessage(alertId, 'user', userMessage, attachments);

    const history = await getAlertChatMessages(alertId);

    const messages = [
        { role: 'system', content: ALERT_BUILDER_SYSTEM_PROMPT },
        {
            role: 'system',
            content: `O HTML ATUAL do pop-up é:\n\`\`\`html\n${currentContent || '(vazio)'}\n\`\`\`\n\nConsidere este HTML como base para suas respostas.`
        }
    ];

    for (const m of history) {
        messages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content, attachments: m.attachments });
    }

    const response = await llm.generateResponse(messages, { maxTokens: 2000 });
    const assistantContent = response || '';

    await addAlertChatMessage(alertId, 'assistant', assistantContent);

    return {
        role: 'assistant',
        content: assistantContent,
    };
}

module.exports = {
    getAlertChatMessages,
    clearAlertChatMessages,
    sendAlertChatMessage,
};
