const express = require('express');
const router = express.Router();
const multer = require('multer');
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const { processExcelChecklist } = require('../functions/database/excelChecklistDashboard');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/octet-stream'
    ];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error('Formato de arquivo não permitido. Use .xlsx ou .xls'));
    }
  }
});

router.post('/upload', verifyToken(), verifyModule('checklists'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    const result = await processExcelChecklist(req.file.buffer, req.user);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[EXCEL CHECKLIST] Erro ao processar planilha:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/filter-options', verifyToken(), verifyModule('checklists'), async (req, res) => {
  try {
    const { getDashboardFilterOptions } = require('../functions/database/checklistDashboard');
    const options = await getDashboardFilterOptions();
    res.json(options);
  } catch (err) {
    console.error('[EXCEL CHECKLIST] Erro ao buscar filtros:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
