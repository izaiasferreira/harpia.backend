const express = require('express');
const router = express.Router();
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const {
  getDashboardFilterOptions,
  getDashboardStats,
  getDashboardNonCompliantItems,
  getDashboardAlerts,
  listDashboardChecklists,
  getDashboardPendingAgents,
  getDashboardTemplates,
  getDashboardStatsV2,
  getDashboardPendingAgentsV2,
  getDashboardCompletedAgentsV2,
  getDashboardNonCompliantItemsV2,
  getDashboardAlertsV2,
} = require('../functions/database/checklistDashboard');

router.get('/filter-options', verifyToken(), verifyModule('checklists'), async (req, res) => {
  try {
    const options = await getDashboardFilterOptions(req.user);
    res.json(options);
  } catch (err) {
    console.error('[DASHBOARD] Erro GET /filter-options:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats', verifyToken(), verifyModule('checklists'), async (req, res) => {
  try {
    const { date_from, date_to, regional, sectional, estado, gestor } = req.query;
    const stats = await getDashboardStats({ date_from, date_to, regional, sectional, estado, gestor }, req.user);
    res.json(stats);
  } catch (err) {
    console.error('[DASHBOARD] Erro GET /stats:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/non-compliant-items', verifyToken(), verifyModule('checklists'), async (req, res) => {
  try {
    const { date_from, date_to, regional, sectional, estado, gestor } = req.query;
    const items = await getDashboardNonCompliantItems({ date_from, date_to, regional, sectional, estado, gestor }, req.user);
    res.json(items);
  } catch (err) {
    console.error('[DASHBOARD] Erro GET /non-compliant-items:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/alerts', verifyToken(), verifyModule('checklists'), async (req, res) => {
  try {
    const { date_from, date_to, regional, sectional, estado, gestor } = req.query;
    const alerts = await getDashboardAlerts({ date_from, date_to, regional, sectional, estado, gestor }, req.user);
    res.json(alerts);
  } catch (err) {
    console.error('[DASHBOARD] Erro GET /alerts:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/checklists', verifyToken(), verifyModule('checklists'), async (req, res) => {
  try {
    const {
      page, limit, agent_name, date_from, date_to,
      type, compliance_filter, status,
      regional, sectional, estado, gestor
    } = req.query;
    const result = await listDashboardChecklists({
      page: parseInt(page || 1, 10),
      limit: parseInt(limit || 15, 10),
      agent_name, date_from, date_to, type, compliance_filter, status,
      regional, sectional, estado, gestor,
    }, req.user);
    res.json(result);
  } catch (err) {
    console.error('[DASHBOARD] Erro GET /checklists:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/pending-agents', verifyToken(), verifyModule('checklists'), async (req, res) => {
  try {
    const {
      page, limit, agent_name, date_from, date_to,
      regional, sectional, estado, gestor,
    } = req.query;
    const result = await getDashboardPendingAgents({
      page: parseInt(page || 1, 10),
      limit: parseInt(limit || 20, 10),
      agent_name, date_from, date_to,
      regional, sectional, estado, gestor,
    }, req.user);
    res.json(result);
  } catch (err) {
    console.error('[DASHBOARD] Erro GET /pending-agents:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── V2 Routes (Dynamic Template-Based) ────────────────────────────────────

router.get('/v2/templates', verifyToken(), verifyModule('checklists'), async (req, res) => {
  try {
    const templates = await getDashboardTemplates(req.user);
    res.json(templates);
  } catch (err) {
    console.error('[DASHBOARD_V2] Erro GET /templates:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/v2/stats', verifyToken(), verifyModule('checklists'), async (req, res) => {
  try {
    const { date_from, date_to, regional, sectional, estado, gestor, template_id } = req.query;
    const stats = await getDashboardStatsV2({
      date_from, date_to, regional, sectional, estado, gestor,
      template_id: template_id || undefined,
    }, req.user);
    if (!stats) return res.status(404).json({ error: 'Template não encontrado ou inativo' });
    res.json(stats);
  } catch (err) {
    console.error('[DASHBOARD_V2] Erro GET /stats:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/v2/pending-agents', verifyToken(), verifyModule('checklists'), async (req, res) => {
  try {
    const {
      page, limit, agent_name, date_from, date_to,
      regional, sectional, estado, gestor, template_id,
    } = req.query;
    const result = await getDashboardPendingAgentsV2({
      page: parseInt(page || 1, 10),
      limit: parseInt(limit || 20, 10),
      agent_name, date_from, date_to,
      regional, sectional, estado, gestor,
      template_id: template_id || undefined,
    }, req.user);
    res.json(result);
  } catch (err) {
    console.error('[DASHBOARD_V2] Erro GET /pending-agents:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/v2/completed-agents', verifyToken(), verifyModule('checklists'), async (req, res) => {
  try {
    const {
      page, limit, agent_name, date_from, date_to,
      regional, sectional, estado, gestor, template_id,
    } = req.query;
    const result = await getDashboardCompletedAgentsV2({
      page: parseInt(page || 1, 10),
      limit: parseInt(limit || 20, 10),
      agent_name, date_from, date_to,
      regional, sectional, estado, gestor,
      template_id: template_id || undefined,
    }, req.user);
    res.json(result);
  } catch (err) {
    console.error('[DASHBOARD_V2] Erro GET /completed-agents:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/v2/non-compliant-items', verifyToken(), verifyModule('checklists'), async (req, res) => {
    try {
      const { date_from, date_to, regional, sectional, estado, gestor, template_id, export_raw } = req.query;
      const items = await getDashboardNonCompliantItemsV2({
        date_from, date_to, regional, sectional, estado, gestor,
        template_id: template_id || undefined,
        export_raw: export_raw === 'true'
      }, req.user);
      res.json(items);
    } catch (err) {
    console.error('[DASHBOARD_V2] Erro GET /v2/non-compliant-items:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/v2/alerts', verifyToken(), verifyModule('checklists'), async (req, res) => {
  try {
    const { date_from, date_to, regional, sectional, estado, gestor, template_id, export_raw } = req.query;
    const alerts = await getDashboardAlertsV2({
      date_from, date_to, regional, sectional, estado, gestor,
      export_raw: export_raw === 'true',
      template_id: template_id || undefined,
    }, req.user);
    res.json(alerts);
  } catch (err) {
    console.error('[DASHBOARD_V2] Erro GET /v2/alerts:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
