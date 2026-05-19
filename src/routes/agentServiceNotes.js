const express = require('express');
const router = express.Router();
const { telegramAuth } = require('../middlewares/telegramAuth');
const {
    getAssignedNotes,
    getServiceNoteById,
    completeServiceNote,
    selfRegisterServiceNote,
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
            return res.status(404).json({ error: 'Nota nao encontrada ou nao atribuida a voce' });
        }

        res.json({ success: true, note });
    } catch (err) {
        console.error('[AGENT_SERVICE_NOTES] Erro concluir:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /agent/service-notes/self-register — auto-registro em campo
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
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;