const express = require('express');
const router = express.Router();
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const {
  createResolution,
  deleteResolution,
} = require('../functions/database/nonconformityResolutions');

/**
 * POST /admin/dashboard/nonconformity-resolve
 * Resolve uma streak de não conformidade.
 * Requer: resolve_nonconformity
 */
router.post('/nonconformity-resolve',
  verifyToken(),
  verifyModule('resolve_nonconformity'),
  async (req, res) => {
    try {
      const { agent_id, question_label, resolved_date, photo_url, description } = req.body;

      if (!agent_id || !question_label || !resolved_date || !photo_url || !description) {
        return res.status(400).json({ error: 'Campos obrigatórios: agent_id, question_label, resolved_date, photo_url, description' });
      }

      const resolution = await createResolution(
        { agent_id, question_label, resolved_date, photo_url, description },
        req.user.id
      );

      res.status(201).json(resolution);
    } catch (err) {
      console.error('[NONCONFORMITY_RESOLVE] POST error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * DELETE /admin/dashboard/nonconformity-resolve/:id
 * Remove uma resolução (desfazer).
 * Requer: unresolve_nonconformity
 */
router.delete('/nonconformity-resolve/:id',
  verifyToken(),
  verifyModule('unresolve_nonconformity'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await deleteResolution(id);

      if (!deleted) {
        return res.status(404).json({ error: 'Resolução não encontrada' });
      }

      res.json({ success: true });
    } catch (err) {
      console.error('[NONCONFORMITY_RESOLVE] DELETE error:', err);
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
