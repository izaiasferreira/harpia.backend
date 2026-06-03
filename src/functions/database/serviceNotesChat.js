const { cenos_pool, pi_pool, ma_pool } = require('../../db');
const { SERVICE_NOTES_SYSTEM_PROMPT } = require('../../llm/prompts/serviceNotes');
const llm = require('../../llm');
const axios = require('axios');
const {
    listServiceNotes,
    getServiceNoteById,
    createServiceNote,
    updateServiceNote,
    assignServiceNote,
    bulkAssign,
    bulkArchive,
    restoreServiceNoteCompletion,
    bulkRestore,
    updateServiceGroup,
} = require('./serviceNotes');

async function createServiceNotesChatTable() {
    await cenos_pool.query(`
        CREATE TABLE IF NOT EXISTS service_notes_chat_messages (
            id SERIAL PRIMARY KEY,
            group_id INTEGER REFERENCES service_groups(id) ON DELETE CASCADE,
            role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
            content TEXT,
            attachments JSONB,
            name TEXT,
            tool_calls JSONB,
            tool_call_id TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `).catch(err => console.error('[DB] Erro ao criar tabela service_notes_chat_messages:', err));

    await cenos_pool.query(`
        ALTER TABLE service_notes_chat_messages ADD COLUMN IF NOT EXISTS tool_call_id TEXT;
    `).catch(() => {});

    await cenos_pool.query(`
        CREATE INDEX IF NOT EXISTS idx_sn_chat_messages_group_id ON service_notes_chat_messages(group_id)
    `).catch(() => {});
}

async function urlToGeminiPart(url, mimeType) {
    try {
        let resolvedUrl = url;
        if (url.startsWith('/')) {
            const port = process.env.PORT || 3000;
            resolvedUrl = `http://127.0.0.1:${port}${url}`;
        }
        
        const response = await axios.get(resolvedUrl, { responseType: 'arraybuffer' });
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
        console.error(`[Gemini Part] Erro ao converter URL ${url}:`, err.message);
        return null;
    }
}

async function getChatMessages(groupId) {
    await createServiceNotesChatTable();
    const { rows } = await cenos_pool.query(
        `SELECT id, role, content, attachments, name, tool_calls, tool_call_id, created_at 
         FROM service_notes_chat_messages 
         WHERE group_id = $1 
         ORDER BY created_at ASC`,
        [groupId]
    );
    return rows;
}

async function addChatMessage(groupId, role, content, attachments = null, name = null, toolCalls = null, toolCallId = null) {
    await createServiceNotesChatTable();
    const { rows } = await cenos_pool.query(
        `INSERT INTO service_notes_chat_messages (group_id, role, content, attachments, name, tool_calls, tool_call_id) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) 
         RETURNING id, role, content, attachments, name, tool_calls, tool_call_id, created_at`,
        [
            groupId, 
            role, 
            content || null, 
            attachments ? JSON.stringify(attachments) : null, 
            name || null, 
            toolCalls ? JSON.stringify(toolCalls) : null,
            toolCallId || null
        ]
    );
    return rows[0];
}

async function clearChatMessages(groupId) {
    await createServiceNotesChatTable();
    await cenos_pool.query(`DELETE FROM service_notes_chat_messages WHERE group_id = $1`, [groupId]);
}

async function listAgents() {
    const agents = [];
    const fetchAgents = async (pool, state) => {
        try {
            const { rows } = await pool.query(`SELECT "ID" as id, "Nome" as nome, "regional", "seccional" FROM colaboradores`);
            rows.forEach(r => {
                agents.push({
                    id: r.id?.toUpperCase(),
                    nome: r.nome,
                    regional: r.regional || null,
                    seccional: r.seccional || null,
                    estado: state
                });
            });
        } catch (e) {
            console.error(`Erro ao buscar colaboradores para chat no estado ${state}:`, e.message);
        }
    };
    await fetchAgents(pi_pool, 'pi');
    await fetchAgents(ma_pool, 'ma');
    return agents;
}

async function executeTool(groupId, toolName, args, adminId) {
    console.log(`[ServiceNotesChat] Executando ferramenta ${toolName} com args:`, args);
    switch (toolName) {
        case 'listar_agentes': {
            return await listAgents();
        }
        case 'listar_servicos': {
            const status = args.status;
            let archived = args.archived;
            if (archived === undefined) archived = false; // default false
            return await listServiceNotes({
                groupId,
                status,
                archived: archived
            });
        }
        case 'listar_categorias_marcadores': {
            const { rows } = await cenos_pool.query(
                `SELECT id, name, color FROM marker_categories WHERE group_id = $1 ORDER BY name ASC`,
                [groupId]
            );
            return rows;
        }
        case 'criar_servico': {
            const { title, description, address, latitude, longitude, markerCategoryId } = args;
            const coordinates = (latitude && longitude) ? `${latitude},${longitude}` : null;
            const newNote = await createServiceNote({
                group_id: groupId,
                title,
                description,
                coordinates,
                latitude,
                longitude,
                address,
                marker_category_id: markerCategoryId
            });
            if (global.sendLiveNotification && newNote && newNote.assigned_to) {
                global.sendLiveNotification(newNote.assigned_to, { type: 'service_notes_updated' });
            }
            return { success: true, service: newNote };
        }
        case 'editar_servico': {
            const { serviceId, updates } = args;
            const existing = await getServiceNoteById(serviceId);
            if (!existing || existing.group_id !== groupId) {
                return { error: `Serviço com ID ${serviceId} não encontrado no grupo atual.` };
            }
            const updated = await updateServiceNote(serviceId, updates);
            if (global.sendLiveNotification) {
                if (existing.assigned_to) {
                    global.sendLiveNotification(existing.assigned_to, { type: 'service_notes_updated' });
                }
                if (updated && updated.assigned_to && updated.assigned_to !== existing.assigned_to) {
                    global.sendLiveNotification(updated.assigned_to, { type: 'service_notes_updated' });
                }
            }
            return { success: true, service: updated };
        }
        case 'atribuir_servicos': {
            const { serviceIds, agentId } = args;
            if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
                return { error: 'serviceIds deve ser um array não vazio.' };
            }
            
            // Validar se pertencem ao grupo atual
            for (const id of serviceIds) {
                const s = await getServiceNoteById(id);
                if (!s || s.group_id !== groupId) {
                    return { error: `Serviço com ID ${id} não pertence ao grupo atual.` };
                }
            }

            await bulkAssign(serviceIds, agentId || null, adminId);

            if (global.sendLiveNotification) {
                if (agentId) {
                    global.sendLiveNotification(agentId, { type: 'service_notes_updated' });
                }
                // Notificar agentes anteriores
                for (const id of serviceIds) {
                    const s = await getServiceNoteById(id);
                    if (s && s.assigned_to && s.assigned_to !== agentId) {
                        global.sendLiveNotification(s.assigned_to, { type: 'service_notes_updated' });
                    }
                }
            }
            return { success: true, count: serviceIds.length };
        }
        case 'restaurar_servicos': {
            const { serviceIds } = args;
            if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
                return { error: 'serviceIds deve ser um array não vazio.' };
            }
            for (const id of serviceIds) {
                const s = await getServiceNoteById(id);
                if (!s || s.group_id !== groupId) {
                    return { error: `Serviço com ID ${id} não pertence ao grupo atual.` };
                }
            }
            await bulkRestore(serviceIds);
            if (global.sendLiveNotification) {
                for (const id of serviceIds) {
                    const s = await getServiceNoteById(id);
                    if (s && s.assigned_to) {
                        global.sendLiveNotification(s.assigned_to, { type: 'service_notes_updated' });
                    }
                }
            }
            return { success: true, count: serviceIds.length };
        }
        case 'arquivar_servicos': {
            const { serviceIds } = args;
            if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
                return { error: 'serviceIds deve ser um array não vazio.' };
            }
            for (const id of serviceIds) {
                const s = await getServiceNoteById(id);
                if (!s || s.group_id !== groupId) {
                    return { error: `Serviço com ID ${id} não pertence ao grupo atual.` };
                }
            }
            await bulkArchive(serviceIds);
            if (global.sendLiveNotification) {
                for (const id of serviceIds) {
                    const s = await getServiceNoteById(id);
                    if (s && s.assigned_to) {
                        global.sendLiveNotification(s.assigned_to, { type: 'service_notes_updated' });
                    }
                }
            }
            return { success: true, count: serviceIds.length };
        }
        case 'criar_editar_formulario_conclusao': {
            const { campos } = args;
            if (!Array.isArray(campos)) {
                return { error: 'campos deve ser um array.' };
            }
            const updatedGroup = await updateServiceGroup(groupId, {
                completion_config: { formFields: campos }
            });
            return { success: true, completion_config: updatedGroup?.completion_config };
        }
        default:
            throw new Error(`Ferramenta desconhecida: ${toolName}`);
    }
}

const SERVICE_NOTES_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'listar_agentes',
            description: 'Lista todos os agentes (colaboradores) disponíveis no sistema com seus IDs e nomes. Utilize esta ferramenta para encontrar o ID correspondente ao nome de um agente.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'listar_servicos',
            description: 'Lista notas de serviço pertencentes ao grupo atual. Pode filtrar por status e arquivados.',
            parameters: {
                type: 'object',
                properties: {
                    status: { type: 'string', enum: ['PENDENTE', 'CONCLUIDO'], description: 'Filtrar por status' },
                    archived: { type: 'boolean', description: 'Se true, traz apenas os arquivados. Se false, apenas os não arquivados.' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'listar_categorias_marcadores',
            description: 'Lista todas as categorias de marcadores/tags disponíveis no grupo de serviços atual.',
            parameters: { type: 'object', properties: {} }
        }
    }
];

async function sendServiceNotesChatMessage(groupId, userMessage, attachments = null, adminId) {
    await createServiceNotesChatTable();

    // Salvar mensagem do usuário
    await addChatMessage(groupId, 'user', userMessage || '', attachments);

    const maxLoops = 5;
    for (let loop = 0; loop < maxLoops; loop++) {
        const history = await getChatMessages(groupId);

        const messages = [
            { role: 'system', content: SERVICE_NOTES_SYSTEM_PROMPT },
            { role: 'system', content: `O ID do grupo de serviço ATUAL é: ${groupId}.` }
        ];

        let pendingToolCalls = [];

        for (const m of history) {
            let atts = [];
            if (m.attachments) {
                try {
                    atts = typeof m.attachments === 'string' ? JSON.parse(m.attachments) : m.attachments;
                } catch (e) {
                    atts = m.attachments;
                }
            }

            if (m.role === 'assistant' && m.tool_calls) {
                let parsedCalls = [];
                try {
                    parsedCalls = typeof m.tool_calls === 'string' ? JSON.parse(m.tool_calls) : m.tool_calls;
                } catch (e) {
                    parsedCalls = m.tool_calls;
                }
                messages.push({
                    role: 'assistant',
                    content: m.content || '',
                    tool_calls: parsedCalls
                });
                pendingToolCalls = [...parsedCalls];
            } else if (m.role === 'tool') {
                let toolCallId = m.tool_call_id;
                
                // Cura de histórico: se tool_call_id for nulo, tenta parear com as chamadas pendentes do assistente anterior
                if (!toolCallId && pendingToolCalls.length > 0) {
                    const matchIndex = pendingToolCalls.findIndex(tc => tc.function.name === m.name);
                    if (matchIndex !== -1) {
                        toolCallId = pendingToolCalls[matchIndex].id;
                        pendingToolCalls.splice(matchIndex, 1);
                        
                        // Atualiza no banco de dados em background para persistir a cura
                        cenos_pool.query(
                            `UPDATE service_notes_chat_messages SET tool_call_id = $1 WHERE id = $2`,
                            [toolCallId, m.id]
                        ).catch(err => console.error('[DB] Erro ao curar tool_call_id:', err.message));
                    }
                }
                
                if (!toolCallId) {
                    console.warn(`[LLM History Check] Skipping orphaned tool message (id: ${m.id}, name: ${m.name}) because it has no tool_call_id`);
                    continue;
                }

                messages.push({
                    role: 'tool',
                    name: m.name,
                    tool_call_id: toolCallId,
                    content: m.content
                });
            } else if (Array.isArray(atts) && atts.length > 0) {
                const parts = [{ text: m.content || '' }];
                for (const att of atts) {
                    const part = await urlToGeminiPart(att.url, att.mimeType);
                    if (part) {
                        parts.push(part);
                    }
                }
                messages.push({ role: m.role, parts });
                pendingToolCalls = []; // limpa chamadas pendentes
            } else {
                messages.push({ role: m.role, content: m.content || '' });
                pendingToolCalls = []; // limpa chamadas pendentes
            }
        }

        // Chamar Gemini com suporte a ferramentas
        const result = await llm.generateWithTools(messages, SERVICE_NOTES_TOOLS);

        if (result.toolCalls && result.toolCalls.length > 0) {
            // Salvar a chamada do assistente no banco
            await addChatMessage(groupId, 'assistant', result.content || '', null, null, result.toolCalls);

            // Executar as chamadas
            for (const tc of result.toolCalls) {
                const name = tc.function.name;
                const args = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments;
                let toolResult;
                try {
                    toolResult = await executeTool(groupId, name, args, adminId);
                } catch (err) {
                    console.error(`Erro ao executar ferramenta ${name}:`, err);
                    toolResult = { error: err.message || 'Erro desconhecido ao executar' };
                }
                // Salvar a resposta do tool
                await addChatMessage(groupId, 'tool', JSON.stringify(toolResult), null, name, null, tc.id);
            }
            
            // Continua no loop para retroalimentar o LLM
            continue;
        } else {
            // Sem chamadas de ferramentas, é a resposta textual final do assistente. Salvar e retornar.
            const saved = await addChatMessage(groupId, 'assistant', result.content || '');

            // Tenta extrair JSON com proposedActions da resposta
            let proposedActions = null;
            const codeBlockMatch = (result.content || '').match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (codeBlockMatch) {
                try {
                    const parsed = JSON.parse(codeBlockMatch[1].trim());
                    if (parsed && Array.isArray(parsed.proposedActions)) {
                        proposedActions = parsed.proposedActions;
                    } else if (parsed && Array.isArray(parsed)) {
                        proposedActions = parsed;
                    }
                } catch (e) {
                    console.error("Erro ao fazer parse das propostas no bloco de código:", e.message);
                }
            }
            if (!proposedActions) {
                const firstBrace = (result.content || '').indexOf('{');
                const lastBrace = (result.content || '').lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                    try {
                        const parsed = JSON.parse((result.content || '').substring(firstBrace, lastBrace + 1));
                        if (parsed && Array.isArray(parsed.proposedActions)) {
                            proposedActions = parsed.proposedActions;
                        } else if (parsed && Array.isArray(parsed)) {
                            proposedActions = parsed;
                        }
                    } catch (e) {
                        console.error("Erro ao fazer parse das propostas no JSON bruto:", e.message);
                    }
                }
            }

            return { 
                message: saved,
                proposedActions
            };
        }
    }

    throw new Error('Excedeu o limite de execução de ferramentas consecutivas.');
}

async function executeProposedActions(groupId, proposedActions, adminId) {
    const results = [];
    for (const action of proposedActions) {
        const type = action.type;
        const params = action.params || {};
        let result;
        try {
            result = await executeTool(groupId, type, params, adminId);
        } catch (err) {
            console.error(`Erro ao aplicar ação proposta ${type}:`, err);
            result = { error: err.message || 'Erro desconhecido ao executar' };
        }
        results.push({ type, result });
    }
    return results;
}

module.exports = {
    getChatMessages,
    addChatMessage,
    clearChatMessages,
    sendServiceNotesChatMessage,
    executeProposedActions,
};
