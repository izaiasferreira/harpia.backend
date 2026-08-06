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
const { checkAgentHasAccess, getAgentSecurityReportConfig } = require('../functions/database/securityReportConfigs');

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

router.get('/config', telegramAuth, async (req, res) => {
  try {
    const config = await getAgentSecurityReportConfig(req.colaborador.id);
    res.json(config);
  } catch (err) {
    console.error('[AGENT SECURITY REPORT] Erro ao buscar config:', err);
    res.status(500).json({ error: err.message });
  }
});

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

const { serviceAnnotationCreateSchema } = require('../db/schemas/serviceAnnotations');
const { create_service_annotation, get_service_annotations_by_agent } = require('../functions/database/serviceAnnotations');
const { get_security_reports_by_agent } = require('../functions/database/agentes');

// POST /agent/annotation — criar anotação de serviço
router.post('/annotation', telegramAuth, validate(serviceAnnotationCreateSchema), async (req, res) => {
  try {
    const autor = req.colaborador.id;
    const estado = req.colaborador.estado || 'pi';
    const { tipo, identificacao_tipo, identificacao_valor, descricao, latitude, longitude, foto } = req.body;

    const result = await create_service_annotation({
      autor,
      tipo,
      identificacao_tipo,
      identificacao_valor,
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
    console.error('[AGENT ANNOTATION] Erro ao criar anotação:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /agent/annotation — listar anotações do agente
router.get('/annotation', telegramAuth, async (req, res) => {
  try {
    const autor = req.colaborador.id;
    const annotations = await get_service_annotations_by_agent(autor);
    res.json(annotations);
  } catch (err) {
    console.error('[AGENT ANNOTATION] Erro ao listar anotações:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /agent/my_reports — listar todos os reportes do agente (perigos, acidentes, anotações)
router.get('/my_reports', telegramAuth, async (req, res) => {
  try {
    const autor = req.colaborador.id;
    const [hazards, accidents, annotations] = await Promise.all([
      get_security_reports_by_agent(autor),
      get_accidents_by_agent(autor),
      get_service_annotations_by_agent(autor)
    ]);
    res.json({
      hazards,
      accidents,
      annotations
    });
  } catch (err) {
    console.error('[AGENT MY REPORTS] Erro ao buscar reportes:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
