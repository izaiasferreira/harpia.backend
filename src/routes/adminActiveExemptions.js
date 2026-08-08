const { Router } = require('express');
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const { listActiveExemptions } = require('../functions/database/agentExemptions');

const router = Router();

router.get('/exemptions/active', verifyToken(), verifyModule('checklists'), async (req, res) => {
  try {
    const {
      page, limit, agent_name, date_from, date_to,
      regional, sectional, estado, gestor, checklist_kind
    } = req.query;

    const result = await listActiveExemptions({
      page: parseInt(page || 1, 10),
      limit: parseInt(limit || 20, 10),
      agent_name, date_from, date_to,
      regional, sectional, estado, gestor, checklist_kind,
    }, req.user);

    res.json(result);
  } catch (err) {
    console.error('[ACTIVE_EXEMPTIONS] Erro GET /exemptions/active:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
