const express = require('express');
const router = express.Router();
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const { validate } = require('../middlewares/validate');
const { createSchema, updateSchema } = require('../db/schemas/securityReportConfig');
const {
  listSecurityReportConfigs,
  getSecurityReportConfig,
  createSecurityReportConfig,
  updateSecurityReportConfig,
  deleteSecurityReportConfig,
} = require('../functions/database/securityReportConfigs');

router.get('/', verifyToken(), verifyModule('manage_security_reports_config'), async (req, res) => {
  try {
    const configs = await listSecurityReportConfigs(req.user);
    res.json(configs);
  } catch (err) {
    console.error('[SECURITY_REPORT_CONFIG] Erro ao listar:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', verifyToken(), verifyModule('manage_security_reports_config'), async (req, res) => {
  try {
    const config = await getSecurityReportConfig(req.params.id);
    if (!config) return res.status(404).json({ error: 'Configuração não encontrada' });
    res.json(config);
  } catch (err) {
    console.error('[SECURITY_REPORT_CONFIG] Erro ao buscar:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', verifyToken(), verifyModule('manage_security_reports_config'), validate(createSchema), async (req, res) => {
  try {
    const config = await createSecurityReportConfig(req.body);
    res.status(201).json(config);
  } catch (err) {
    console.error('[SECURITY_REPORT_CONFIG] Erro ao criar:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', verifyToken(), verifyModule('manage_security_reports_config'), validate(updateSchema), async (req, res) => {
  try {
    const config = await updateSecurityReportConfig(req.params.id, req.body);
    if (!config) return res.status(404).json({ error: 'Configuração não encontrada' });
    res.json(config);
  } catch (err) {
    console.error('[SECURITY_REPORT_CONFIG] Erro ao atualizar:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', verifyToken(), verifyModule('manage_security_reports_config'), async (req, res) => {
  try {
    const result = await deleteSecurityReportConfig(req.params.id);
    if (!result) return res.status(404).json({ error: 'Configuração não encontrada' });
    res.json({ message: 'Configuração removida' });
  } catch (err) {
    console.error('[SECURITY_REPORT_CONFIG] Erro ao deletar:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
