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
  listTemplatesUnified,
  listSubordinatesPendingMonth,
  isSubordinateOf,
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

function getTodayDateStr() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
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

    const todayStr = getTodayDateStr();

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
    const templates = await listTemplatesForAgent(agentEstado, req.colaborador);
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
      `SELECT col."Cargo" as cargo, col.regional, col.seccional, col."processo" as processo, col.is_gestor
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

    console.log('exempt', {exempt, agentId, todayStr})
    if (exempt) {
      
      
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

// Helper para calcular datas locais YYYY-MM-DD
function getLocalDateString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// GET /agent/checklists/history — histórico de checklists do agente (apenas hoje e ontem)
router.get('/history', telegramAuth, async (req, res) => {
  try {
    const agentId = req.colaborador.id;
    const { page = 1, limit = 20 } = req.query;

    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const dateFrom = getLocalDateString(yesterday);
    const dateTo = getLocalDateString(today);

    const result = await listChecklistsAdmin({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      agent_name: agentId,
      date_from: dateFrom,
      date_to: dateTo,
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

// GET /agent/checklists/:id — detalhes de um checklist (apenas se for de hoje ou ontem)
router.get('/templates-unified', telegramAuth, async (req, res) => {
  try {
    const agentId = req.colaborador.id;
    const agentEstado = req.colaborador.estado;
    const isGestor = !!req.colaborador.is_gestor;

    // perfil do agente (para o filtro de cargo/regional/seccional/processo)
    const { rows } = await cenos_pool.query(
      `SELECT col."Cargo" as cargo, col.regional, col.seccional, col."processo" as processo
       FROM login l
       LEFT JOIN colaboradores col ON l.id = col."ID"
       WHERE l.id = $1`,
      [agentId]
    );
    const agentProfile = rows[0] || {};
    console.log('[TEMPLATES_UNIFIED] agentProfile:', agentProfile, 'agentId:', agentId);
    const templates = await listTemplatesUnified(agentEstado, isGestor, agentProfile);
    res.json(templates);
  } catch (err) {
    console.error('[AGENT_CHECKLISTS] Erro GET /templates-unified:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /agent/manager-checklists/pending — liderados sem checklist do gestor no mês
router.get('/manager-checklists/pending', telegramAuth, async (req, res) => {
  try {
    if (!req.colaborador.is_gestor) {
      return res.status(403).json({ error: 'Acesso restrito a gestores' });
    }

    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, '0')}-01`;
    const subordinates = await listSubordinatesPendingMonth(
      req.colaborador.id,
      req.colaborador.nome,
      monthStart,
      monthEnd
    );
    res.json(subordinates);
  } catch (err) {
    console.error('[AGENT_CHECKLISTS] Erro GET /manager-checklists/pending:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /agent/manager-checklists — preencher checklist do gestor sobre um liderado
router.post('/manager-checklists', telegramAuth, async (req, res) => {
  try {
    if (!req.colaborador.is_gestor) {
      return res.status(403).json({ error: 'Acesso restrito a gestores' });
    }
    const data = req.body;
    if (!data.template_id) return res.status(400).json({ error: 'template_id é obrigatório' });
    if (!data.date) return res.status(400).json({ error: 'date é obrigatório' });
    if (!data.target_agent_id) return res.status(400).json({ error: 'target_agent_id é obrigatório' });

    // validar que o template é do gestor e que o alvo é um liderado do gestor
    const template = await getTemplateById(data.template_id);
    if (!template || !template.is_gestor || !template.is_active) {
      return res.status(400).json({ error: 'Template de gestor inválido ou inativo' });
    }
    const isSubordinate = await isSubordinateOf(
      req.colaborador.id,
      req.colaborador.nome,
      data.target_agent_id
    );
    if (!isSubordinate) {
      return res.status(403).json({ error: 'Alvo não é um liderado seu' });
    }

    const { rows: existingRows } = await cenos_pool.query(
      `SELECT 1 FROM checklists 
       WHERE agent_id = $1 AND target_agent_id = $2 
         AND template_id = $3
         AND TO_CHAR(date, 'YYYY-MM') = TO_CHAR($4::date, 'YYYY-MM')
       LIMIT 1`,
      [req.colaborador.id, data.target_agent_id, data.template_id, data.date]
    );

    if (existingRows.length > 0) {
      return res.status(409).json({ error: 'Este colaborador já possui checklist do gestor neste mês' });
    }

    const checklist = await saveChecklistSubmission(req.colaborador.id, { ...data, type: 'supplementary' });
    res.status(201).json({ success: true, checklist });
  } catch (err) {
    console.error('[AGENT_CHECKLISTS] Erro POST /manager-checklists:', err);
    if (err.message && err.message.includes('gestor_target_mes')) {
      return res.status(409).json({ error: 'Este colaborador já possui checklist do gestor neste mês' });
    }
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', telegramAuth, async (req, res) => {
  try {
    const checklist = await getChecklistById(req.params.id);
    if (!checklist) return res.status(404).json({ error: 'Checklist não encontrado' });

    if (checklist.agent_id && checklist.agent_id !== req.colaborador.id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const todayStr = getLocalDateString(new Date());
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getLocalDateString(yesterday);

    let chkDate = '';
    if (checklist.date instanceof Date) {
      chkDate = getLocalDateString(checklist.date);
    } else if (typeof checklist.date === 'string') {
      chkDate = checklist.date.slice(0, 10);
    }

    if (chkDate && chkDate < yesterdayStr) {
      return res.status(403).json({ error: 'Acesso permitido apenas para checklists do dia atual e do dia anterior.' });
    }

    const agent = await getUserData({ id: checklist.agent_id});
    res.json({...checklist, agent});
  } catch (err) {
    console.error('[AGENT_CHECKLISTS] Erro /:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// Helper para validar se o template é válido para o agente
async function validateTemplateForAgent(agentId, agentEstado, templateId) {
  const { rows: profileRows } = await cenos_pool.query(
    `SELECT col."Cargo" as cargo, col.regional, col.seccional, col."processo" as processo
     FROM login l
     LEFT JOIN colaboradores col ON l.id = col."ID"
     WHERE l.id = $1`,
    [agentId]
  );
  const agentProfile = profileRows[0] || {};
  const templates = await listTemplatesForAgentWithProfile(agentEstado, agentProfile);
  const isProfileAllowed = templates.some(t => String(t.id) === String(templateId));
  if (isProfileAllowed) return true;

  // Fallback: se não passou no filtro estrito de perfil, mas o template existe e está ativo para o estado do agente
  const { rows: tRows } = await cenos_pool.query(
    `SELECT id FROM checklist_templates
     WHERE id = $1 AND is_active = true AND is_deleted = false
       AND (estado IS NULL OR UPPER(estado) = UPPER($2))`,
    [templateId, agentEstado]
  );
  return tRows.length > 0;
}

// POST /agent/checklists — enviar/sincronizar checklist
router.post('/', telegramAuth, async (req, res) => {
  try {
    const agentId = req.colaborador.id;
    const data = req.body;

    if (!data.template_id) return res.status(400).json({ error: 'template_id é obrigatório' });
    if (!data.date) return res.status(400).json({ error: 'date é obrigatório' });

    const agentEstado = req.colaborador.estado;
    const isValid = await validateTemplateForAgent(agentId, agentEstado, data.template_id);

    if (!isValid) {
      console.warn(`[AGENT_CHECKLISTS] Agente ${agentId} tentou enviar checklist de template inválido ou inativo: ${data.template_id}.`);
      return res.status(400).json({ error: 'Template de checklist inválido ou inativo' });
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

    const agentEstado = req.colaborador.estado;
    const isValid = await validateTemplateForAgent(agentId, agentEstado, data.template_id);

    if (!isValid) {
      console.warn(`[AGENT_CHECKLISTS] Agente ${agentId} tentou sincronizar checklist de template inválido ou inativo: ${data.template_id}.`);
      return res.status(400).json({ error: 'Template de checklist inválido ou inativo' });
    }

    const checklist = await saveChecklistSubmission(agentId, data);
    res.json({ success: true, checklist });
  } catch (err) {
    console.error('[AGENT_CHECKLISTS] Erro /:id/sync:', err);
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET /agent/checklists/templates-unified — templates elegíveis (agente + gestor)
module.exports = router;

