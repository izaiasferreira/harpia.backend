const express = require('express');
const router = express.Router();
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const { validate } = require('../middlewares/validate');
const { agentExemptionCreateSchema } = require('../db/schemas/agentExemptions');
const {
  listAgentExemptions,
  createAgentExemption,
  deleteAgentExemption
} = require('../functions/database/agentExemptions');

/**
 * GET /admin/agents/:agentId/exemptions
 * Lista o histórico de isenções de um agente.
 * Requer: view_agent_exemptions
 */
router.get('/:agentId/exemptions',
  verifyToken(),
  verifyModule('view_agent_exemptions'),
  async (req, res) => {
    try {
      const { agentId } = req.params;
      const exemptions = await listAgentExemptions(agentId);
      res.json(exemptions);
    } catch (err) {
      console.error('[EXEMPTIONS] GET error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * POST /admin/agents/:agentId/exemptions
 * Cria uma nova isenção para o agente.
 * Requer: create_agent_exemption
 */
router.post('/:agentId/exemptions',
  verifyToken(),
  verifyModule('create_agent_exemption'),
  validate(agentExemptionCreateSchema),
  async (req, res) => {
    try {
      const { agentId } = req.params;
      const { start_date, end_date, reason } = req.body;
      const createdBy = req.user?.id || null;

      const exemption = await createAgentExemption({
        agentId,
        startDate: start_date,
        endDate: end_date,
        reason,
        createdBy
      });

      res.status(201).json(exemption);
    } catch (err) {
      console.error('[EXEMPTIONS] POST error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * DELETE /admin/agents/:agentId/exemptions/:exemptionId
 * Remove/revoga uma isenção.
 * Requer: delete_agent_exemption
 */
router.delete('/:agentId/exemptions/:exemptionId',
  verifyToken(),
  verifyModule('delete_agent_exemption'),
  async (req, res) => {
    try {
      const { agentId, exemptionId } = req.params;
      const result = await deleteAgentExemption({ exemptionId, agentId });

      if (!result) {
        return res.status(404).json({ error: 'Isenção não encontrada' });
      }

      res.json({ success: true, deleted: result });
    } catch (err) {
      console.error('[EXEMPTIONS] DELETE error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
