const express = require('express');
const router = express.Router();
const { telegramAuth } = require('../middlewares/telegramAuth');
const { validate } = require('../middlewares/validate');
const { securityReportCreateSchema } = require('../db/schemas/security');
const { accidentCreateSchema } = require('../db/schemas/accidents');
const {
  create_security_report,
  get_security_reports,
} = require('../functions/postgresFunctions');
const { create_accident, get_accidents_by_agent } = require('../functions/database/accidents');
const { checkAgentHasAccess } = require('../functions/database/securityReportConfigs');

async function checkAccessMiddleware(req, res, next) {
  try {
    const hasAccess = await checkAgentHasAccess(req.colaborador.id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Acesso ao reporte de segurança não disponível para este agente' });
    }
    next();
  } catch (err) {
    console.error('[AGENT SECURITY REPORT] Erro ao verificar acesso:', err);
    res.status(500).json({ error: err.message });
  }
}

router.post('/security_report', telegramAuth, checkAccessMiddleware, validate(securityReportCreateSchema), async (req, res) => {
  try {
    const autor = req.colaborador.id;
    const { motivo, observacao, latitude, longitude, foto } = req.body;

    if (!motivo) {
      return res.status(400).json({ error: 'Motivo é obrigatório' });
    }

    const result = await create_security_report({
      autor,
      motivo,
      observacao,
      latitude,
      longitude,
      foto,
      estado: req.colaborador.estado || 'pi',
      seccional: req.colaborador.seccional || null,
      regional: req.colaborador.regional || null,
    });

    res.status(201).json(result);
  } catch (err) {
    console.error('[AGENT SECURITY REPORT] Erro ao criar reporte:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/accident', telegramAuth, checkAccessMiddleware, validate(accidentCreateSchema), async (req, res) => {
  try {
    const autor = req.colaborador.id;
    const estado = req.colaborador.estado || 'pi';
    const { tipo, descricao, latitude, longitude, foto } = req.body;

    if (!tipo) {
      return res.status(400).json({ error: 'Tipo é obrigatório' });
    }

    const result = await create_accident({
      autor,
      tipo,
      descricao,
      latitude,
      longitude,
      foto,
      estado,
      seccional: req.colaborador.seccional || null,
      regional: req.colaborador.regional || null,
    });

    res.status(201).json(result);
  } catch (err) {
    console.error('[AGENT SECURITY REPORT] Erro ao criar acidente:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
