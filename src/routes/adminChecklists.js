const express = require('express');
const router = express.Router();
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const {
  listTemplatesAdmin,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  syncTemplate,
  listChecklistsAdmin,
  getChecklistById,
  getChecklistsStats,
} = require('../functions/database/checklists');
const { getUserData } = require('../functions/database/agentes');

// ==========================================
// TEMPLATES
// ==========================================

router.get('/templates', verifyToken(), verifyModule('manage_checklist_templates'), async (req, res) => {
  try {
    const templates = await listTemplatesAdmin();
    res.json(templates);
  } catch (err) {
    console.error('[ADMIN_CHECKLISTS] Erro GET /templates:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/templates/:id', verifyToken(), verifyModule('manage_checklist_templates'), async (req, res) => {
  try {
    const template = await getTemplateById(req.params.id);
    if (!template) return res.status(404).json({ error: 'Template não encontrado' });
    res.json(template);
  } catch (err) {
    console.error('[ADMIN_CHECKLISTS] Erro GET /templates/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/templates', verifyToken(), verifyModule('manage_checklist_templates'), async (req, res) => {
  try {
    const { title, description, estado, data } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'title é obrigatório' });
    const template = await createTemplate({
      title: title.trim(),
      description,
      created_by: req.user.id,
      estado: estado || null,
      data: data || null,
    });
    res.status(201).json(template);
  } catch (err) {
    console.error('[ADMIN_CHECKLISTS] Erro POST /templates:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/templates/:id', verifyToken(), verifyModule('manage_checklist_templates'), async (req, res) => {
  try {
    const { title, description, is_active, estado, data } = req.body;
    const template = await updateTemplate(req.params.id, { title, description, is_active, estado, data });
    if (!template) return res.status(404).json({ error: 'Template não encontrado' });
    res.json(template);
  } catch (err) {
    console.error('[ADMIN_CHECKLISTS] Erro PUT /templates/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/templates/:id/sync', verifyToken(), verifyModule('manage_checklist_templates'), async (req, res) => {
  try {
    const { templateData } = req.body;
    await syncTemplate(req.params.id, templateData);
    const updatedTemplate = await getTemplateById(req.params.id);
    res.json(updatedTemplate);
  } catch (err) {
    console.error('[ADMIN_CHECKLISTS] Erro PUT /templates/:id/sync:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/templates/:id', verifyToken(), verifyModule('manage_checklist_templates'), async (req, res) => {
  try {
    const template = await deleteTemplate(req.params.id);
    if (!template) return res.status(404).json({ error: 'Template não encontrado' });
    res.json({ success: true, deleted: template });
  } catch (err) {
    console.error('[ADMIN_CHECKLISTS] Erro DELETE /templates/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// SUBMISSIONS (Admin)
// ==========================================

router.get('/stats', verifyToken(), verifyModule('checklists'), async (req, res) => {
  try {
    const { regional_id, date_from, date_to } = req.query;
    const stats = await getChecklistsStats({ regional_id, date_from, date_to });
    res.json(stats);
  } catch (err) {
    console.error('[ADMIN_CHECKLISTS] Erro GET /stats:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/', verifyToken(), verifyModule('checklists'), async (req, res) => {
  try {
    const { page, limit, regional_id, sectional_id, agent_name, date_from, date_to, type, severity_alert, status } = req.query;
    const result = await listChecklistsAdmin({
      page: parseInt(page || 1, 10),
      limit: parseInt(limit || 10, 10),
      regional_id,
      sectional_id,
      agent_name,
      date_from,
      date_to,
      type,
      severity_alert,
      status,
    });
    res.json(result);
  } catch (err) {
    console.error('[ADMIN_CHECKLISTS] Erro GET /:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', verifyToken(), verifyModule('checklists'), async (req, res) => {
  try {
    const checklist = await getChecklistById(req.params.id);
    
    if (!checklist) return res.status(404).json({ error: 'Checklist não encontrado' });

    // const user = await getUserData({ id: req.user.id, state: req.user.estado })
    console.log("AQUI", checklist)
    res.json(checklist);
  } catch (err) {
    console.error('[ADMIN_CHECKLISTS] Erro GET /:id:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
