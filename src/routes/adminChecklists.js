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
  createSection,
  updateSection,
  deleteSection,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  reorderQuestions,
  listChecklistsAdmin,
  getChecklistById,
  getChecklistsStats,
} = require('../functions/database/checklists');
const { generateChecklistPdf } = require('../utils/pdf');

// ==========================================
// TEMPLATES
// ==========================================

// GET /admin/checklists/templates — listar templates
router.get('/templates', verifyToken(), verifyModule('manage_checklist_templates'), async (req, res) => {
  try {
    const templates = await listTemplatesAdmin();
    res.json(templates);
  } catch (err) {
    console.error('[ADMIN_CHECKLISTS] Erro GET /templates:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/checklists/templates/:id — detalhes do template (com seções e perguntas)
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

// POST /admin/checklists/templates — criar template
router.post('/templates', verifyToken(), verifyModule('manage_checklist_templates'), async (req, res) => {
  try {
    const { title, description, estado } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'title é obrigatório' });
    const template = await createTemplate({
      title: title.trim(),
      description,
      created_by: req.user.id,
      estado: estado || null,
    });
    res.status(201).json(template);
  } catch (err) {
    console.error('[ADMIN_CHECKLISTS] Erro POST /templates:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /admin/checklists/templates/:id — atualizar template
router.put('/templates/:id', verifyToken(), verifyModule('manage_checklist_templates'), async (req, res) => {
  try {
    const { title, description, is_active, estado } = req.body;
    const template = await updateTemplate(req.params.id, { title, description, is_active, estado });
    if (!template) return res.status(404).json({ error: 'Template não encontrado' });
    res.json(template);
  } catch (err) {
    console.error('[ADMIN_CHECKLISTS] Erro PUT /templates/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /admin/checklists/templates/:id/sync — Sincronizar template completo
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

// DELETE /admin/checklists/templates/:id — desativar template
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
// SECTIONS
// ==========================================

// POST /admin/checklists/templates/:id/sections — criar seção
router.post('/templates/:id/sections', verifyToken(), verifyModule('manage_checklist_templates'), async (req, res) => {
  try {
    const { title, order_index = 0, section_color, section_icon } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'title é obrigatório' });
    const section = await createSection(req.params.id, { title: title.trim(), order_index, section_color, section_icon });
    res.status(201).json(section);
  } catch (err) {
    console.error('[ADMIN_CHECKLISTS] Erro POST /templates/:id/sections:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /admin/checklists/sections/:sectionId — atualizar seção
router.put('/sections/:sectionId', verifyToken(), verifyModule('manage_checklist_templates'), async (req, res) => {
  try {
    const { title, order_index, section_color, section_icon } = req.body;
    const section = await updateSection(req.params.sectionId, { title, order_index, section_color, section_icon });
    if (!section) return res.status(404).json({ error: 'Seção não encontrada' });
    res.json(section);
  } catch (err) {
    console.error('[ADMIN_CHECKLISTS] Erro PUT /sections/:sectionId:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /admin/checklists/sections/:sectionId — remover seção
router.delete('/sections/:sectionId', verifyToken(), verifyModule('manage_checklist_templates'), async (req, res) => {
  try {
    const section = await deleteSection(req.params.sectionId);
    if (!section) return res.status(404).json({ error: 'Seção não encontrada' });
    res.json({ success: true, deleted: section });
  } catch (err) {
    console.error('[ADMIN_CHECKLISTS] Erro DELETE /sections/:sectionId:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// QUESTIONS
// ==========================================

// POST /admin/checklists/sections/:sectionId/questions — criar pergunta
router.post('/sections/:sectionId/questions', verifyToken(), verifyModule('manage_checklist_templates'), async (req, res) => {
  try {
    const { label, required = true, requires_photo = false, requires_photo_always = false, severity = 'medium', exemption_days = 0, order_index = 0, template_id, question_type = 'binary', options = null } = req.body;
    if (!label || !label.trim()) return res.status(400).json({ error: 'label é obrigatório' });
    if (!template_id) return res.status(400).json({ error: 'template_id é obrigatório' });
    const question = await createQuestion(req.params.sectionId, template_id, {
      label: label.trim(),
      required,
      requires_photo,
      requires_photo_always,
      severity,
      exemption_days,
      order_index,
      question_type,
      options,
    });
    res.status(201).json(question);
  } catch (err) {
    console.error('[ADMIN_CHECKLISTS] Erro POST /sections/:sectionId/questions:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /admin/checklists/questions/:questionId — atualizar pergunta
router.put('/questions/:questionId', verifyToken(), verifyModule('manage_checklist_templates'), async (req, res) => {
  try {
    const { label, required, requires_photo, requires_photo_always, severity, exemption_days, order_index, question_type, options } = req.body;
    const question = await updateQuestion(req.params.questionId, { label, required, requires_photo, requires_photo_always, severity, exemption_days, order_index, question_type, options });
    if (!question) return res.status(404).json({ error: 'Pergunta não encontrada' });
    res.json(question);
  } catch (err) {
    console.error('[ADMIN_CHECKLISTS] Erro PUT /questions/:questionId:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /admin/checklists/questions/:questionId — remover pergunta
router.delete('/questions/:questionId', verifyToken(), verifyModule('manage_checklist_templates'), async (req, res) => {
  try {
    const question = await deleteQuestion(req.params.questionId);
    if (!question) return res.status(404).json({ error: 'Pergunta não encontrada' });
    res.json({ success: true, deleted: question });
  } catch (err) {
    console.error('[ADMIN_CHECKLISTS] Erro DELETE /questions/:questionId:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /admin/checklists/templates/:id/questions/reorder — reordenar perguntas
router.put('/templates/:id/questions/reorder', verifyToken(), verifyModule('manage_checklist_templates'), async (req, res) => {
  try {
    const { questions } = req.body; // [{ id, order_index }, ...]
    if (!Array.isArray(questions)) return res.status(400).json({ error: 'questions deve ser um array' });
    await reorderQuestions(questions);
    res.json({ success: true });
  } catch (err) {
    console.error('[ADMIN_CHECKLISTS] Erro PUT /templates/:id/questions/reorder:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// SUBMISSIONS (Admin)
// ==========================================

// GET /admin/checklists/stats — métricas KPI
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

// GET /admin/checklists — listar checklists com filtros e paginação
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

// GET /admin/checklists/:id — detalhes de um checklist
router.get('/:id', verifyToken(), verifyModule('checklists'), async (req, res) => {
  try {
    const checklist = await getChecklistById(req.params.id);
    if (!checklist) return res.status(404).json({ error: 'Checklist não encontrado' });
    res.json(checklist);
  } catch (err) {
    console.error('[ADMIN_CHECKLISTS] Erro GET /:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/checklists/:id/pdf — PDF do checklist (admin)
router.get('/:id/pdf', verifyToken(), verifyModule('checklists'), async (req, res) => {
  try {
    const checklist = await getChecklistById(req.params.id);
    if (!checklist) return res.status(404).json({ error: 'Checklist não encontrado' });
    const pdfBuffer = await generateChecklistPdf(checklist);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="checklist-${checklist.id}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  } catch (err) {
    console.error('[ADMIN_CHECKLISTS] Erro GET /:id/pdf:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
