const express = require('express');
const router = express.Router();
const { cenos_pool } = require('../db');
const { telegramAuth } = require('../middlewares/telegramAuth');
const {
  getTemplateById,
  getAgentTodayChecklist,
  getChecklistById,
  saveChecklistSubmission,
  listChecklistsAdmin,
  listTemplatesForAgent,
  listTemplatesForAgentWithProfile,
  getAgentTemplatesStatus,
} = require('../functions/database/checklists');
const { getUserData } = require('../functions/database/agentes');
const { isAgentExempt } = require('../functions/database/agentExemptions');

// Cargos que devem obrigatoriamente realizar o checklist diário
const CHECKLIST_REQUIRED_CARGOS = [
  'LEITURISTA A PÉ',
  'NEGOCIADOR MOTOCICLISTA',
  'LEITURISTA MOTOCICLISTA',
  'COBRADOR MOTOCICLISTA',
];

/**
 * Verifica se o colaborador é obrigado a fazer o checklist diário.
 * Critérios: situacao = 'active' E cargo em CHECKLIST_REQUIRED_CARGOS.
 */
function isChecklistRequired(colaborador) {
  if (!colaborador) return false;
  const situacao = (colaborador.situacao || '').toLowerCase();
  const cargo = (colaborador.cargo || colaborador['Cargo'] || '').toUpperCase().trim();
  if (situacao !== 'active') return false;
  return CHECKLIST_REQUIRED_CARGOS.some(c => c.toUpperCase() === cargo);
}

// GET /agent/checklists/today — checklist oficial do agente hoje
router.get('/today', telegramAuth, async (req, res) => {
  try {
    const agentId = req.colaborador.id;

    // Buscar situação e cargo da tabela colaboradores (via login.id = colaboradores."ID")
    const { rows: profileRows } = await cenos_pool.query(
      `SELECT c.situacao, c."Cargo" AS cargo
       FROM login l
       LEFT JOIN colaboradores c ON l.id = c."ID"
       WHERE l.id = $1`,
      [agentId]
    );
    const profile = profileRows[0] || {};
    req.colaborador.situacao = profile.situacao;
    req.colaborador.cargo = profile.cargo;

    const todayStr = new Date().toISOString().split('T')[0];

    // Verifica isenção (inclui domingo)
    const exempt = await isAgentExempt(agentId, todayStr);
    if (exempt) {
      return res.json({ checklist: null, checklist_required: false, exempted: true });
    }

    const checklist = await getAgentTodayChecklist(agentId, todayStr);
    const checklist_required = isChecklistRequired(req.colaborador);
    res.json({ checklist, checklist_required });
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

// GET /agent/checklists/templates-with-filters — templates filtrados pelo perfil completo do agente
router.get('/templates-with-filters', telegramAuth, async (req, res) => {
  try {
    const agentId = req.colaborador.id;
    const agentEstado = req.colaborador.estado;
    const { rows } = await cenos_pool.query(
      `SELECT col."Cargo" as cargo, col.regional, col.seccional, col."processo" as processo
       FROM login l
       LEFT JOIN colaboradores col ON l.id = col."ID"
       WHERE l.id = $1`,
      [agentId]
    );
    const agentProfile = rows[0] || {};
    const templates = await listTemplatesForAgentWithProfile(agentEstado, agentProfile);
    res.json(templates);
  } catch (err) {
    console.error('[AGENT_CHECKLISTS] Erro /templates-with-filters:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /agent/checklists/requirements — templates obrigatórios para o agente hoje
router.get('/requirements', telegramAuth, async (req, res) => {
  try {
    const agentId = req.colaborador.id;
    const todayStr = new Date().toISOString().split('T')[0];

    // Verifica isenção (inclui domingo)
    const exempt = await isAgentExempt(agentId, todayStr);
    if (exempt) {
      const isSunday = new Date(todayStr + 'T12:00:00Z').getUTCDay() === 0;
      return res.json({
        checklist_required: false,
        exempted: true,
        exemption_reason: isSunday ? 'sunday' : 'manual_exemption',
        required_templates: [],
        all_submitted: true,
        total_required: 0,
        total_submitted: 0,
      });
    }

    const status = await getAgentTemplatesStatus(agentId, todayStr);
    res.json(status);
  } catch (err) {
    console.error('[AGENT_CHECKLISTS] Erro /requirements:', err);
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

    // Validate authorization
    const agentEstado = req.colaborador.estado;
    const { rows } = await cenos_pool.query(
      `SELECT col."Cargo" as cargo, col.regional, col.seccional, col."processo" as processo
       FROM login l
       LEFT JOIN colaboradores col ON l.id = col."ID"
       WHERE l.id = $1`,
      [agentId]
    );
    const agentProfile = rows[0] || {};
    const templates = await listTemplatesForAgentWithProfile(agentEstado, agentProfile);
    const isAllowed = templates.some(t => t.id === data.template_id);

    if (!isAllowed) {
      console.warn(`[AGENT_CHECKLISTS] Agente ${agentId} tentou enviar checklist não autorizado: ${data.template_id}. Descartando silenciosamente.`);
      return res.status(201).json({ success: true, checklist: { id: data.id || 'fake-id', status: 'completed', date: data.date } });
    }

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

    // Validate authorization
    const agentEstado = req.colaborador.estado;
    const { rows } = await cenos_pool.query(
      `SELECT col."Cargo" as cargo, col.regional, col.seccional, col."processo" as processo
       FROM login l
       LEFT JOIN colaboradores col ON l.id = col."ID"
       WHERE l.id = $1`,
      [agentId]
    );
    const agentProfile = rows[0] || {};
    const templates = await listTemplatesForAgentWithProfile(agentEstado, agentProfile);
    const isAllowed = templates.some(t => t.id === data.template_id);

    if (!isAllowed) {
      console.warn(`[AGENT_CHECKLISTS] Agente ${agentId} tentou sincronizar checklist não autorizado: ${data.template_id}. Descartando silenciosamente.`);
      return res.json({ success: true, checklist: { id: data.id || 'fake-id', status: 'completed', date: data.date } });
    }

    const checklist = await saveChecklistSubmission(agentId, data);
    res.json({ success: true, checklist });
  } catch (err) {
    console.error('[AGENT_CHECKLISTS] Erro /:id/sync:', err);
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
