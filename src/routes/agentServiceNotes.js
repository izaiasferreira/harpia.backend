const express = require('express');
const router = express.Router();
const { telegramAuth } = require('../middlewares/telegramAuth');
const {
    getAssignedNotes,
    getServiceNoteById,
    completeServiceNote,
    selfRegisterServiceNote,
    createAgentServiceNote,
    listCreatableGroups,
    listVisibleGroups,
    listVisibleGroupsWithCounts,
    listCategoriesByGroup,
    getGroupNotesForAgent,
} = require('../functions/database/serviceNotes');

// GET /agent/service-notes — listar notas atribuidas ao agente
router.get('/', telegramAuth, async (req, res) => {
    try {
        const agentId = req.colaborador.id;
        const notes = await getAssignedNotes(agentId);
        res.json(notes);
    } catch (err) {
        console.error('[AGENT_SERVICE_NOTES] Erro listar:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /agent/service-notes/:id — detalhes de uma nota
router.get('/:id', telegramAuth, async (req, res) => {
    try {
        const note = await getServiceNoteById(req.params.id);
        if (!note) return res.status(404).json({ error: 'Nota nao encontrada' });
        res.json(note);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /agent/service-notes/:id/complete — concluir nota
router.put('/:id/complete', telegramAuth, async (req, res) => {
    try {
        const agentId = req.colaborador.id;
        const { coordinates, completionData, completedAt } = req.body;

        const note = await completeServiceNote(req.params.id, {
            agentId,
            coordinates,
            completionData,
            completedAt,
        });

        if (!note) {
            const existing = await getServiceNoteById(req.params.id);
            if (existing && existing.status === 'CONCLUIDO') {
                return res.json({ success: true, note: existing, alreadyCompleted: true });
            }
            return res.status(404).json({ error: 'Nota nao encontrada ou nao atribuida a voce' });
        }

        res.json({ success: true, note });
    } catch (err) {
        console.error('[AGENT_SERVICE_NOTES] Erro concluir:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /agent/service-notes/self-register — auto-registro em campo (CONCLUIDO)
router.post('/self-register', telegramAuth, async (req, res) => {
    try {
        const agentId = req.colaborador.id;
        const { groupId, title, coordinates, completionData, completedAt } = req.body;

        if (!groupId) return res.status(400).json({ error: 'groupId obrigatorio' });

        const note = await selfRegisterServiceNote({
            groupId,
            agentId,
            title,
            coordinates,
            completionData,
            completedAt,
        });

        res.status(201).json({ success: true, note });
    } catch (err) {
        console.error('[AGENT_SERVICE_NOTES] Erro auto-registro:', err);
        if (err.message.includes('permissao') || err.message.includes('nao encontrado')) {
            return res.status(403).json({ error: err.message });
        }
        res.status(500).json({ error: err.message });
    }
});

// GET /agent/service-notes/groups/visible — grupos visiveis para o agente (independente de permissao de criacao)
router.get('/groups/visible', telegramAuth, async (req, res) => {
    try {
        const agentId = req.colaborador.id;
        const groups = await listVisibleGroups(agentId);
        res.json(groups);
    } catch (err) {
        console.error('[AGENT_SERVICE_NOTES] Erro listar grupos visiveis:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /agent/service-notes/groups/creatable — grupos disponiveis para criacao
router.get('/groups/creatable', telegramAuth, async (req, res) => {
    try {
        const agentId = req.colaborador.id;
        const groups = await listCreatableGroups(agentId);
        res.json(groups);
    } catch (err) {
        console.error('[AGENT_SERVICE_NOTES] Erro listar grupos:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /agent/service-notes/groups/visible-with-counts — grupos visiveis com contagem de notas
router.get('/groups/visible-with-counts', telegramAuth, async (req, res) => {
    try {
        const agentId = req.colaborador.id;
        const groups = await listVisibleGroupsWithCounts(agentId);
        res.json(groups);
    } catch (err) {
        console.error('[AGENT_SERVICE_NOTES] Erro listar grupos com contagem:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /agent/service-notes/groups/:groupId/notes — todas as notas de um grupo (publico) ou apenas as atribuida
router.get('/groups/:groupId/notes', telegramAuth, async (req, res) => {
    try {
        const agentId = req.colaborador.id;
        const notes = await getGroupNotesForAgent(req.params.groupId, agentId);
        res.json(notes);
    } catch (err) {
        console.error('[AGENT_SERVICE_NOTES] Erro listar notas do grupo:', err);
        if (err.message.includes('permissao') || err.message.includes('nao encontrado')) {
            return res.status(403).json({ error: err.message });
        }
        res.status(500).json({ error: err.message });
    }
});

// GET /agent/service-notes/groups/:groupId/categories — categorias de um grupo
router.get('/groups/:groupId/categories', telegramAuth, async (req, res) => {
    try {
        const categories = await listCategoriesByGroup(req.params.groupId);
        res.json(categories);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /agent/service-notes/create — criar nova nota de servico (status PENDENTE)
router.post('/create', telegramAuth, async (req, res) => {
    try {
        const agentId = req.colaborador.id;
        const { group_id, title, description, coordinates, latitude, longitude, address, marker_category_id, assignToSelf } = req.body;

        if (!group_id) return res.status(400).json({ error: 'group_id obrigatorio' });
        if (!title || !title.trim()) return res.status(400).json({ error: 'title obrigatorio' });

        const note = await createAgentServiceNote({
            group_id,
            title: title.trim(),
            description,
            coordinates,
            latitude,
            longitude,
            address,
            marker_category_id,
            agentId,
            assignToSelf: !!assignToSelf,
        });

        res.status(201).json({ success: true, note });
    } catch (err) {
        console.error('[AGENT_SERVICE_NOTES] Erro criar:', err);
        if (err.message.includes('permissao') || err.message.includes('nao encontrado')) {
            return res.status(403).json({ error: err.message });
        }
        res.status(500).json({ error: err.message });
    }
});

// POST /agent/service-notes/resolve-pending-photos — curar registros antigos com placeholders de fotos
router.post('/resolve-pending-photos', telegramAuth, async (req, res) => {
    try {
        const { urlMap } = req.body;
        if (!urlMap || typeof urlMap !== 'object') {
            return res.status(400).json({ error: 'urlMap invalido' });
        }

        const { cenos_pool } = require('../db');
        let updatedCount = 0;

        for (const [photoId, realUrl] of Object.entries(urlMap)) {
            const placeholder = `photo://pending/${photoId}`;

            // 1. Atualizar em completion_data
            const queryJson = `
                UPDATE service_notes 
                SET completion_data = CAST(REPLACE(CAST(completion_data AS TEXT), $1, $2) AS JSONB),
                    updated_at = NOW()
                WHERE completion_data IS NOT NULL AND CAST(completion_data AS TEXT) LIKE $3
            `;
            const resJson = await cenos_pool.query(queryJson, [placeholder, realUrl, `%${placeholder}%`]);
            updatedCount += resJson.rowCount;

            // 2. Atualizar em description
            const queryDesc = `
                UPDATE service_notes 
                SET description = REPLACE(description, $1, $2),
                    updated_at = NOW()
                WHERE description IS NOT NULL AND description LIKE $3
            `;
            const resDesc = await cenos_pool.query(queryDesc, [placeholder, realUrl, `%${placeholder}%`]);
            updatedCount += resDesc.rowCount;
        }

        res.json({ success: true, updatedCount });
    } catch (err) {
        console.error('[AGENT_SERVICE_NOTES] Erro ao curar fotos pendentes:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;