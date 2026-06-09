const { cenos_pool } = require('../../db');
const llm = require('../../llm');

async function getChatMessages(trainingId) {
    const { rows } = await cenos_pool.query(
        `SELECT id, role, content, created_at FROM training_chat_messages WHERE training_id = $1 ORDER BY created_at ASC`,
        [trainingId]
    );
    return rows;
}

async function addChatMessage(trainingId, role, content) {
    const { rows } = await cenos_pool.query(
        `INSERT INTO training_chat_messages (training_id, role, content) VALUES ($1, $2, $3) RETURNING id, role, content, created_at`,
        [trainingId, role, content]
    );
    return rows[0];
}

async function clearChatMessages(trainingId) {
    await cenos_pool.query(`DELETE FROM training_chat_messages WHERE training_id = $1`, [trainingId]);
}

async function sendTrainingChatMessage(trainingId, userMessage, currentFlowData, selectedNodeIds = []) {
    await addChatMessage(trainingId, 'user', userMessage);
    const history = await getChatMessages(trainingId);
    const selectionContext = selectedNodeIds.length > 0 
        ? `\n\nATENÇÃO: O usuário selecionou os seguintes nós na interface: ${selectedNodeIds.join(', ')}.`
        : '';
    const messages = [
        { role: 'system', content: `Você é um assistente de treinamentos interativos. Gere a estrutura JSON do treinamento conforme o pedido do usuário.\n\nConteudo atual do treinamento:\n\`\`\`json\n${JSON.stringify(currentFlowData, null, 2)}\n\`\`\`${selectionContext}\n\nIMPORTANTE: Use este conteudo como base. Ao fazer alterações, retorne o JSON completo.` },
        ...history.map(m => ({ role: m.role, content: m.content })),
    ];
    const llmResponse = await llm.generateResponse(messages);
    const saved = await addChatMessage(trainingId, 'assistant', llmResponse);
    let parsedStructure = null;

    const codeBlockMatch = llmResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
        try {
            parsedStructure = JSON.parse(codeBlockMatch[1].trim());
        } catch (e) {
            console.error('Erro ao fazer parse do JSON (Training) dentro do bloco de código:', e);
        }
    }

    if (!parsedStructure) {
        const fb = llmResponse.indexOf('{');
        const lb = llmResponse.lastIndexOf('}');
        if (fb !== -1 && lb !== -1 && lb > fb) {
            try {
                parsedStructure = JSON.parse(llmResponse.substring(fb, lb + 1));
            } catch (e) {
                console.error('Erro ao fazer parse do JSON bruto (Training):', e);
            }
        }
    }

    return { message: saved, parsedStructure };
}

const AGENT_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'list_nodes',
            description: 'Lista todos os slides (id + titulo).',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_node',
            description: 'Dados completos de um slide (hotspots, tooltips, etc).',
            parameters: {
                type: 'object',
                properties: {
                    nodeId: { type: 'string', description: 'ID do no' }
                },
                required: ['nodeId']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_selected_node',
            description: 'Dados completos do slide selecionado pelo usuario no editor.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'find_nodes_by_text',
            description: 'Busca slides pelo titulo. Retorna id + titulo.',
            parameters: {
                type: 'object',
                properties: {
                    text: { type: 'string', description: 'Texto no titulo' }
                },
                required: ['text']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'highlight_nodes',
            description: 'Destaca slides no editor visual.',
            parameters: {
                type: 'object',
                properties: {
                    nodeIds: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'IDs dos slides'
                    }
                },
                required: ['nodeIds']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'update_node',
            description: 'Atualiza dados de UM slide (merge parcial).',
            parameters: {
                type: 'object',
                properties: {
                    nodeId: { type: 'string', description: 'ID do slide' },
                    data: {
                        type: 'object',
                        description: 'Propriedades a alterar no node.data. So enviar as que mudaram.'
                    }
                },
                required: ['nodeId', 'data']
            }
        }
    }
];

async function callLlm(messages, options = {}) {
    const toolChoice = options.toolChoice !== undefined ? options.toolChoice : 'auto';
    const result = await llm.generateWithTools(messages, AGENT_TOOLS, { signal: options.signal, temperature: 0.5, tool_choice: toolChoice });
    return {
        content: result.content,
        toolCalls: result.toolCalls,
    };
}

module.exports = {
    getChatMessages,
    addChatMessage,
    clearChatMessages,
    sendTrainingChatMessage,
    callLlm,
    AGENT_TOOLS,
};
