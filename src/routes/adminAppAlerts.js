const express = require('express');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const { verifyToken, verifyModule } = require('../middlewares/jwtAuth');
const { minioClient, CONFIG, compressImage, ensureBucketExists, getFileUrl } = require('../functions/minio');
const {
    listAlerts,
    getAlertById,
    createAlert,
    updateAlert,
    toggleAlert,
    deleteAlert,
    getAlertViews,
} = require('../functions/database/appAlerts');
const {
    getAlertChatMessages,
    clearAlertChatMessages,
    sendAlertChatMessage,
} = require('../functions/database/appAlertChat');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── Listagem ────────────────────────────────────────────────────────────────

// GET /admin/app-alerts
router.get('/', verifyToken(), verifyModule('app_alerts'), async (req, res) => {
    try {
        const alerts = await listAlerts(req.user);
        res.json(alerts);
    } catch (err) {
        console.error('[APP_ALERTS] GET /', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /admin/app-alerts/:id
router.get('/:id', verifyToken(), verifyModule('app_alerts'), async (req, res) => {
    try {
        const alert = await getAlertById(req.params.id);
        if (!alert) return res.status(404).json({ error: 'Alerta não encontrado' });
        res.json(alert);
    } catch (err) {
        console.error('[APP_ALERTS] GET /:id', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── Criação ─────────────────────────────────────────────────────────────────

// POST /admin/app-alerts
router.post('/', verifyToken(), verifyModule('create_app_alert'), async (req, res) => {
    try {
        const alert = await createAlert(req.body, req.user.id);
        res.status(201).json(alert);
    } catch (err) {
        console.error('[APP_ALERTS] POST /', err);
        if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
        if (err.status) return res.status(err.status).json({ error: err.message });
        res.status(500).json({ error: err.message });
    }
});

// ─── Upload de imagem ─────────────────────────────────────────────────────────

// POST /admin/app-alerts/upload-image
router.post('/upload-image', verifyToken(), verifyModule('create_app_alert'), upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Arquivo de imagem é obrigatório' });

        const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowed.includes(req.file.mimetype)) {
            return res.status(400).json({ error: 'Formato de arquivo inválido. Use JPEG, PNG, GIF ou WebP.' });
        }

        await ensureBucketExists();

        const ext = req.file.originalname.split('.').pop().toLowerCase();
        const fileName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
        const fullPath = `app-alerts/${fileName}`;

        let fileBuffer = req.file.buffer;
        if (['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(req.file.mimetype)) {
            fileBuffer = await compressImage(fileBuffer, req.file.mimetype);
        }

        await minioClient.putObject(CONFIG.bucket, fullPath, fileBuffer);

        res.json({ success: true, path: fullPath, url: getFileUrl(fullPath) });
    } catch (err) {
        console.error('[APP_ALERTS] Upload imagem', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── Edição ───────────────────────────────────────────────────────────────────

// PUT /admin/app-alerts/:id
router.put('/:id', verifyToken(), verifyModule('update_app_alert'), async (req, res) => {
    try {
        const alert = await updateAlert(req.params.id, req.body, req.user.id);
        res.json(alert);
    } catch (err) {
        console.error('[APP_ALERTS] PUT /:id', err);
        if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
        if (err.status) return res.status(err.status).json({ error: err.message });
        res.status(500).json({ error: err.message });
    }
});

// PATCH /admin/app-alerts/:id/toggle
router.patch('/:id/toggle', verifyToken(), verifyModule('update_app_alert'), async (req, res) => {
    try {
        const { is_active } = req.body;
        if (typeof is_active !== 'boolean') return res.status(400).json({ error: 'Campo is_active (boolean) é obrigatório' });
        const alert = await toggleAlert(req.params.id, is_active, req.user.id);
        res.json(alert);
    } catch (err) {
        console.error('[APP_ALERTS] PATCH toggle', err);
        if (err.status) return res.status(err.status).json({ error: err.message });
        res.status(500).json({ error: err.message });
    }
});

// ─── Exclusão ─────────────────────────────────────────────────────────────────

// DELETE /admin/app-alerts/:id
router.delete('/:id', verifyToken(), verifyModule('delete_app_alert'), async (req, res) => {
    try {
        await deleteAlert(req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error('[APP_ALERTS] DELETE /:id', err);
        if (err.status) return res.status(err.status).json({ error: err.message });
        res.status(500).json({ error: err.message });
    }
});

// ─── Visualizações ───────────────────────────────────────────────────────────

// GET /admin/app-alerts/:id/views
router.get('/:id/views', verifyToken(), verifyModule('app_alerts'), async (req, res) => {
    try {
        const views = await getAlertViews(req.params.id);
        res.json(views);
    } catch (err) {
        console.error('[APP_ALERTS] GET views', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── Chat IA (apenas COMPANY_ADMIN) ──────────────────────────────────────────

// GET /admin/app-alerts/:id/chat
router.get('/:id/chat', verifyToken(), async (req, res) => {
    try {
        if (req.user.role !== 'COMPANY_ADMIN') return res.status(403).json({ error: 'Acesso restrito' });
        const messages = await getAlertChatMessages(req.params.id);
        res.json(messages);
    } catch (err) {
        console.error('[APP_ALERTS] GET chat', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /admin/app-alerts/:id/chat
router.post('/:id/chat', verifyToken(), async (req, res) => {
    try {
        if (req.user.role !== 'COMPANY_ADMIN') return res.status(403).json({ error: 'Acesso restrito' });
        const { message, currentContent, attachments } = req.body;
        if (!message?.trim() && (!attachments || attachments.length === 0)) {
            return res.status(400).json({ error: 'Mensagem ou anexo é obrigatório' });
        }
        const result = await sendAlertChatMessage(req.params.id, message, currentContent || '', attachments || []);
        res.json(result);
    } catch (err) {
        console.error('[APP_ALERTS] POST chat', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /admin/app-alerts/:id/chat
router.delete('/:id/chat', verifyToken(), async (req, res) => {
    try {
        if (req.user.role !== 'COMPANY_ADMIN') return res.status(403).json({ error: 'Acesso restrito' });
        await clearAlertChatMessages(req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error('[APP_ALERTS] DELETE chat', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
