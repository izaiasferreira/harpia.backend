const express = require('express');
const router = express.Router();
const { telegramAuth } = require('../middlewares/telegramAuth');
const {
  getTemplateById,
  getAgentTodayChecklist,
  getChecklistById,
  saveChecklistSubmission,
  listChecklistsAdmin,
  listTemplatesForAgent,
} = require('../functions/database/checklists');
const { getUserData } = require('../functions/database/agentes');

// GET /agent/checklists/today — checklist oficial do agente hoje
router.get('/today', telegramAuth, async (req, res) => {
  try {
    const agentId = req.colaborador.id;
    const todayStr = new Date().toISOString().split('T')[0];
    const checklist = await getAgentTodayChecklist(agentId, todayStr);
    res.json({ checklist });
  } catch (err) {
    console.error('[AGENT_CHECKLISTS] Erro /today:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /agent/checklists/templates — lista de templates ativos para o agente (filtrados por estado)
router.get('/templates', telegramAuth, async (req, res) => {
  try {
    const agentEstado = req.colaborador.estado;
    const templates = await listTemplatesForAgent(agentEstado);
    res.json(templates);
  } catch (err) {
    console.error('[AGENT_CHECKLISTS] Erro /templates:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /agent/checklists/history — histórico de checklists do agente
router.get('/history', telegramAuth, async (req, res) => {
  try {
    const agentId = req.colaborador.id;
    const { page = 1, limit = 20 } = req.query;
    const result = await listChecklistsAdmin({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      agent_name: agentId,
    });
    console.log(result)
    res.json(result);
  } catch (err) {
    console.error('[AGENT_CHECKLISTS] Erro /history:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /agent/checklists/form/:templateId — formulário com isenções calculadas para o agente
router.get('/form/:templateId', telegramAuth, async (req, res) => {
  try {
    const agentId = req.colaborador.id;
    const template = await getTemplateById(req.params.templateId, agentId);
    if (!template) return res.status(404).json({ error: 'Template não encontrado' });
    res.json(template);
  } catch (err) {
    console.error('[AGENT_CHECKLISTS] Erro /form:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /agent/checklists/:id — detalhes de um checklist
router.get('/:id', telegramAuth, async (req, res) => {
  try {
    const checklist = await getChecklistById(req.params.id);
    if (!checklist) return res.status(404).json({ error: 'Checklist não encontrado' });
    const agent = await getUserData({ id: checklist.agent_id})
    res.json({...checklist, agent});
  } catch (err) {
    console.error('[AGENT_CHECKLISTS] Erro /:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /agent/checklists — enviar/sincronizar checklist
router.post('/', telegramAuth, async (req, res) => {
  try {
    const agentId = req.colaborador.id;
    const data = req.body;

    if (!data.template_id) return res.status(400).json({ error: 'template_id é obrigatório' });
    if (!data.date) return res.status(400).json({ error: 'date é obrigatório' });

    const checklist = await saveChecklistSubmission(agentId, data);
    res.status(201).json({ success: true, checklist });
  } catch (err) {
    console.error('[AGENT_CHECKLISTS] Erro POST /:', err);
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// POST /agent/checklists/:id/sync — sincronização offline de checklist
router.post('/:id/sync', telegramAuth, async (req, res) => {
  try {
    const agentId = req.colaborador.id;
    const data = { ...req.body, id: req.params.id };

    if (!data.template_id) return res.status(400).json({ error: 'template_id é obrigatório' });
    if (!data.date) return res.status(400).json({ error: 'date é obrigatório' });

    const checklist = await saveChecklistSubmission(agentId, data);
    res.json({ success: true, checklist });
  } catch (err) {
    console.error('[AGENT_CHECKLISTS] Erro /:id/sync:', err);
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
