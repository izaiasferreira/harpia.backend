process.env.TZ = 'America/Sao_Paulo';
require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const logMiddleware = require('./middlewares/logMiddleware');
const deviceIdMiddleware = require('./middlewares/deviceIdMiddleware');
const { initFirebase } = require('./functions/firebase');
const app = express();

initFirebase();

// Trust proxy necessário no Dokploy para pegar IP real do cliente
app.set('trust proxy', true);

// Morgan ANTES do CORS para registrar todas as requisições
if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('[:date[clf]] IP: :remote-addr | HOST: :req[host] | :method :url :status :res[content-length] - :response-time ms', {
        skip: (req) => req.path && (req.path.startsWith('/agent/tracking') || req.path.startsWith('/agent/tracking/'))
    }));
}

// CORS — origens via CORS_ORIGINS (separadas por vírgula). Produção: NÃO deixe vazio ou '*'
const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);

app.use(cors({
    allowedHeaders: ['Content-Type', 'Authorization', 'gedai-device-id', 'X-Requested-With'],
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.length === 0) {
            console.warn('[CORS] Nenhuma origem configurada via CORS_ORIGINS — bloqueando request com origin');
            return callback(new Error('Bloqueado pelo CORS'));
        }
        if (allowedOrigins.includes('*')) {
            return callback(null, true);
        }
        const allowed = allowedOrigins.some(o => {
            if (origin === o) return true;
            try {
                const hostname = new URL(origin).hostname;
                if (hostname === o) return true;
                if (hostname.endsWith('.' + o)) return true;
                if (hostname.endsWith(o)) return true;
            } catch { return false; }
        });
        if (allowed) return callback(null, true);
        return callback(new Error('Bloqueado pelo CORS'));
    }
}));

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(deviceIdMiddleware);
app.use(logMiddleware);
app.use(express.static('public'));

const consultasRouter = require('./routes/consultas');
const agenteRouter = require('./routes/agente')
const adminUsersRouter = require('./routes/adminUsers')
const adminPermissionsRouter = require('./routes/adminPermissions')
const adminConsultRouter = require('./routes/adminModules')
const publicRouter = require('./routes/public')
const agentDefaultAuthRouter = require('./routes/agentDefaultAuth')
const uploadRouter = require('./routes/upload')
const trainingProjectsRouter = require('./routes/trainingProjects')
const adminMessageTemplatesRouter = require('./routes/adminMessageTemplates')
const adminSecurityReportsRouter = require('./routes/adminSecurityReports')
const adminAppPinsRouter = require('./routes/adminAppPins')
const formsRouter = require('./routes/forms')
const chatRouter = require('./routes/chat')
const adminChatRouter = require('./routes/adminChat')

app.use('/', uploadRouter);
app.use('/', chatRouter);
app.use('/', adminChatRouter);

app.use('/public', publicRouter)
app.use('/api', consultasRouter)
app.use('/api', agentDefaultAuthRouter)
app.use('/admin', adminConsultRouter)
app.use('/admin/user', adminUsersRouter)
app.use('/admin/permission', adminPermissionsRouter)
app.use('/agent', agenteRouter)

const agentEquipmentRouter = require('./routes/agentEquipment')
app.use('/agent/equipment', agentEquipmentRouter)

const adminEquipmentRouter = require('./routes/adminEquipment')
app.use('/admin/equipment', adminEquipmentRouter)

const adminEquipmentTypesRouter = require('./routes/adminEquipmentTypes')
app.use('/admin/equipment-types', adminEquipmentTypesRouter)

app.use('/admin/security_reports', adminSecurityReportsRouter)

const adminSecurityReportsValidationRouter = require('./routes/adminSecurityReportsValidation')
app.use('/admin/security_reports', adminSecurityReportsValidationRouter)

const adminSecurityAccidentsRouter = require('./routes/adminSecurityAccidents')
app.use('/admin/security_reports/accidents', adminSecurityAccidentsRouter)

const adminCrashDetectionRouter = require('./routes/adminCrashDetection')
app.use('/admin/crash-detection', adminCrashDetectionRouter)

app.use('/admin/training', trainingProjectsRouter)

app.use('/admin/message_templates', adminMessageTemplatesRouter)

const adminBadgesRouter = require('./routes/adminBadges')
app.use('/admin/badge', adminBadgesRouter)

const adminUserBadgesRouter = require('./routes/adminUserBadges')
app.use('/admin/user-badges', adminUserBadgesRouter)

const adminCeneducRouter = require('./routes/adminCeneduc')
app.use('/admin/ceneduc', adminCeneducRouter)

app.use('/admin/forms', formsRouter)

const formChatRouter = require('./routes/formChat')
app.use('/admin/forms', formChatRouter)

app.use('/admin/agent', adminAppPinsRouter)

const adminTrackingRouter = require('./routes/adminTracking')
app.use('/admin/tracking', adminTrackingRouter)

const adminGeofencesRouter = require('./routes/adminGeofences')
app.use('/admin/tracking/fences', adminGeofencesRouter)

const adminHeartbeatRouter = require('./routes/adminHeartbeat')
app.use('/admin/tracking', adminHeartbeatRouter)

const adminNotificationsRouter = require('./routes/adminNotifications')
app.use('/admin/notifications', adminNotificationsRouter)

const adminServiceNotesRouter = require('./routes/adminServiceNotes')
app.use('/admin/service-notes', adminServiceNotesRouter)
const serviceNotesChatRouter = require('./routes/serviceNotesChat')
app.use('/admin/service-notes', serviceNotesChatRouter)
const agentServiceNotesRouter = require('./routes/agentServiceNotes')
app.use('/agent/service-notes', agentServiceNotesRouter)

const revalidateRouter = require('./routes/revalidate')
app.use('/admin/revalidate', revalidateRouter)

const adminChecklistsRouter = require('./routes/adminChecklists')
app.use('/admin/checklists', adminChecklistsRouter)
const checklistTemplateChatRouter = require('./routes/checklistTemplateChat')
app.use('/admin/checklists/templates', checklistTemplateChatRouter)
const adminChecklistDashboardRouter = require('./routes/adminChecklistDashboard')
app.use('/admin/dashboard', adminChecklistDashboardRouter)
const adminNonconformityResolutionsRouter = require('./routes/adminNonconformityResolutions')
app.use('/admin/dashboard', adminNonconformityResolutionsRouter)
const agentChecklistsRouter = require('./routes/agentChecklists')
app.use('/agent/checklists', agentChecklistsRouter)

const adminExcelChecklistDashboardRouter = require('./routes/adminExcelChecklistDashboard')
app.use('/admin/excel-checklist', adminExcelChecklistDashboardRouter)

const adminAgentExemptionsRouter = require('./routes/adminAgentExemptions')
app.use('/admin/agents', adminAgentExemptionsRouter)

const adminActiveExemptionsRouter = require('./routes/adminActiveExemptions')
app.use('/admin', adminActiveExemptionsRouter)

const adminConfigRouter = require('./routes/adminConfig')
app.use('/admin/config', adminConfigRouter)

const adminMessagesRouter = require('./routes/adminMessages')
app.use('/admin/messages', adminMessagesRouter)

const adminSecurityReportConfigsRouter = require('./routes/adminSecurityReportConfigs')
app.use('/admin/security_reports/configs', adminSecurityReportConfigsRouter)

const agentSecurityReportConfigRouter = require('./routes/agentSecurityReportConfig')
app.use('/agent/security_report', agentSecurityReportConfigRouter)

const agentSecurityReportsRouter = require('./routes/agentSecurityReports')
app.use('/agent/v2', agentSecurityReportsRouter)

const appUpdateRouter = require('./routes/appUpdate')
app.use('/', appUpdateRouter)

const telegramWebhookRouter = require('./routes/telegramWebhook')
app.use('/public', telegramWebhookRouter)

const publicNotifyRouter = require('./routes/publicNotify')
app.use('/public', publicNotifyRouter)

const adminTrackingShareRouter = require('./routes/adminTrackingShare')
const publicTrackingRouter = require('./routes/publicTracking')
const adminApiTokensRouter = require('./routes/adminApiTokens')
app.use('/admin/api-tokens', adminApiTokensRouter)
app.use('/admin/tracking/share', adminTrackingShareRouter)
app.use('/public/tracking', publicTrackingRouter)

const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');
const fs = require('fs');
try {
    const swaggerDocument = YAML.load(path.join(__dirname, '..', 'docs', 'openapi.yaml'));
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'Gedai API Docs',
    }));
    app.get('/docs/openapi.yaml', (req, res) => {
        res.sendFile(path.join(__dirname, '..', 'docs', 'openapi.yaml'));
    });
    console.log('[SWAGGER] Swagger UI disponível em /docs');
} catch (err) {
    console.warn('[SWAGGER] Erro ao carregar openapi.yaml:', err.message);
}

const docsViewerRouter = require('./routes/docsViewer');
app.use('/docsmd', docsViewerRouter);
app.use('/raw-md', express.static(path.join(__dirname, '..', 'docs')));

app.use((err, req, res, next) => {
    if (err.message === 'Bloqueado pelo CORS') {
        console.warn(`[CORS BLOQUEADO] IP: ${req.ip} | HOST: ${req.hostname || req.headers.host} | ORIGIN: ${req.headers.origin}`);
        return res.status(403).json({ error: 'Origem não permitida (CORS)' });
    }
    next(err);
});

module.exports = app;
