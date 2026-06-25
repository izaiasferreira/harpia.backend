const express = require('express');
const router = express.Router();
const { telegramAuth } = require('../middlewares/telegramAuth');
const { getAgentSecurityReportConfig } = require('../functions/database/securityReportConfigs');

router.get('/config', telegramAuth, async (req, res) => {
  try {
    const agentId = req.colaborador.id;
    console.log(agentId)
    const config = await getAgentSecurityReportConfig(agentId);
    // console.log(config)
    res.json(config);
  } catch (err) {
    console.error('[AGENT SECURITY REPORT CONFIG] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
