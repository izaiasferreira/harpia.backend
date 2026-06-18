process.env.TZ = 'America/Sao_Paulo';
require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const logMiddleware = require('./middlewares/logMiddleware');
const { initFirebase } = require('./functions/firebase');
const app = express();

// Inicializa Firebase (se service account disponível)
initFirebase();

// Trust proxy é necessário no Dokploy para o express pegar o IP real do cliente ao invés do IP do proxy
app.set('trust proxy', true);

// Only use morgan logger if not in test environment - deve vir ANTES do CORS para registrar as requisições
if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('[:date[clf]] IP: :remote-addr | HOST: :req[host] | :method :url :status :res[content-length] - :response-time ms', {
        skip: (req) => req.path && (req.path.startsWith('/agent/tracking') || req.path.startsWith('/agent/tracking/'))
    }));
}

// CORS — origens permitidas via variável de ambiente (separadas por vírgula)
// Aceita URLs completas (http://192.168.1.100:8080) ou só IPs/domínios (192.168.1.100)
// Exemplo no .env: CORS_ORIGINS=192.168.50.68,https://meusite.com,localhost
const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        // Permite requisições sem origin (curl, Postman, server-to-server)
        if (!origin) return callback(null, true);
        // Se não configurou nenhuma origem ou tem '*', aceita tudo
        if (allowedOrigins.length === 0 || allowedOrigins.includes('*')) return callback(null, true);
        // Verifica match exato OU se o origin termina com o domínio configurado
        const allowed = allowedOrigins.some(o => {
            if (origin === o) return true;
            try {
                const hostname = new URL(origin).hostname;
                // Match exato ou subdomínio (ex: app.izi.tec.br aceita api.izi.tec.br)
                if (hostname === o) return true;
                if (hostname.endsWith('.' + o)) return true;
                // Para izi.tec.br aceitar app.izi.tec.br e api.izi.tec.br
                if (hostname.endsWith(o)) return true;
            } catch { return false; }
        });
        if (allowed) return callback(null, true);
        return callback(new Error('Bloqueado pelo CORS'));
    }
}));

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(logMiddleware);
app.use(express.static('public'));

// Routes
const consultasRouter = require('./routes/consultas');
const agenteRouter = require('./routes/agente')
const adminUsersRouter = require('./routes/adminUsers')
const adminBranchesRouter = require('./routes/adminBranches')
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

// Rotas de arquivos e upload (MinIO)
app.use('/', uploadRouter);
app.use('/', chatRouter);
app.use('/', adminChatRouter);


// Rotas públicas (calendar, feriados)
app.use('/public', publicRouter)

// Consultas
app.use('/api', consultasRouter)

// Agent Default Auth (sem telegram auth)
app.use('/api', agentDefaultAuthRouter)



// Admin Modules (dashboard + search_in)
app.use('/admin', adminConsultRouter)

// Admin Users (/admin/user/*)
app.use('/admin/user', adminUsersRouter)

// Admin Branches (/admin/branch/*)
app.use('/admin/branch', adminBranchesRouter)

// Admin Permissions (/admin/permission/*)
app.use('/admin/permission', adminPermissionsRouter)

// Agente
app.use('/agent', agenteRouter)

// Admin Security Reports (/admin/security_reports/*)
app.use('/admin/security_reports', adminSecurityReportsRouter)

// Admin Security Reports Validation (/admin/security_reports/*)
const adminSecurityReportsValidationRouter = require('./routes/adminSecurityReportsValidation')
app.use('/admin/security_reports', adminSecurityReportsValidationRouter)

// Admin Security Accidents (/admin/security_reports/accidents/*)
const adminSecurityAccidentsRouter = require('./routes/adminSecurityAccidents')
app.use('/admin/security_reports/accidents', adminSecurityAccidentsRouter)

// Interativos (/admin/training/*)
app.use('/admin/training', trainingProjectsRouter)

// Admin Message Templates (/admin/message_templates/*)
app.use('/admin/message_templates', adminMessageTemplatesRouter)

// Admin Badges (/admin/badge/*)
const adminBadgesRouter = require('./routes/adminBadges')
app.use('/admin/badge', adminBadgesRouter)

// Admin User Badges (/admin/user-badges/*)
const adminUserBadgesRouter = require('./routes/adminUserBadges')
app.use('/admin/user-badges', adminUserBadgesRouter)

// Admin Ceneduc (/admin/ceneduc/*)
const adminCeneducRouter = require('./routes/adminCeneduc')
app.use('/admin/ceneduc', adminCeneducRouter)

// Formulários Dinâmicos (/admin/forms/*)
app.use('/admin/forms', formsRouter)

// Chat com IA para formulários (/admin/forms/:id/chat)
const formChatRouter = require('./routes/formChat')
app.use('/admin/forms', formChatRouter)

// App PINs (/admin/agent/*)
app.use('/admin/agent', adminAppPinsRouter)

// Tracking (/admin/tracking/*)
const adminTrackingRouter = require('./routes/adminTracking')
app.use('/admin/tracking', adminTrackingRouter)

// Heartbeat tracking (/admin/tracking/*)
const adminHeartbeatRouter = require('./routes/adminHeartbeat')
app.use('/admin/tracking', adminHeartbeatRouter)

// Notifications (/admin/notifications/*)
const adminNotificationsRouter = require('./routes/adminNotifications')
app.use('/admin/notifications', adminNotificationsRouter)

// Service Notes (/admin/service-notes/* e /agent/service-notes/*)
const adminServiceNotesRouter = require('./routes/adminServiceNotes')
app.use('/admin/service-notes', adminServiceNotesRouter)
const serviceNotesChatRouter = require('./routes/serviceNotesChat')
app.use('/admin/service-notes', serviceNotesChatRouter)
const agentServiceNotesRouter = require('./routes/agentServiceNotes')
app.use('/agent/service-notes', agentServiceNotesRouter)

// Revalidate (/admin/revalidate/*)
const revalidateRouter = require('./routes/revalidate')
app.use('/admin/revalidate', revalidateRouter)

// Checklists de Segurança (/admin/checklists/* e /agent/checklists/*)
const adminChecklistsRouter = require('./routes/adminChecklists')
app.use('/admin/checklists', adminChecklistsRouter)
const checklistTemplateChatRouter = require('./routes/checklistTemplateChat')
app.use('/admin/checklists/templates', checklistTemplateChatRouter)
const agentChecklistsRouter = require('./routes/agentChecklists')
app.use('/agent/checklists', agentChecklistsRouter)

// Configs (/admin/config/*)
const adminConfigRouter = require('./routes/adminConfig')
app.use('/admin/config', adminConfigRouter)

// Unified Messages (/admin/messages/*)
const adminMessagesRouter = require('./routes/adminMessages')
app.use('/admin/messages', adminMessagesRouter)

// App Update (/api/app/update/*)
const appUpdateRouter = require('./routes/appUpdate')
app.use('/', appUpdateRouter)

// Telegram Webhook (/public/telegram-webhook)
const telegramWebhookRouter = require('./routes/telegramWebhook')
app.use('/public', telegramWebhookRouter)

// Public Notify (/public/notify)
const publicNotifyRouter = require('./routes/publicNotify')
app.use('/public', publicNotifyRouter)

// API Tokens (/admin/api-tokens)
const adminApiTokensRouter = require('./routes/adminApiTokens')
app.use('/admin/api-tokens', adminApiTokensRouter)


// Swagger UI
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
    // Serve raw openapi.yaml
    app.get('/docs/openapi.yaml', (req, res) => {
        res.sendFile(path.join(__dirname, '..', 'docs', 'openapi.yaml'));
    });
    console.log('[SWAGGER] Swagger UI disponível em /docs');
} catch (err) {
    console.warn('[SWAGGER] Erro ao carregar openapi.yaml:', err.message);
}

// Rendered markdown viewer + raw md files
const docsViewerRouter = require('./routes/docsViewer');
app.use('/docsmd', docsViewerRouter);
// Serve raw markdown files (outside /docs to avoid swagger-ui conflict)
app.use('/raw-md', express.static(path.join(__dirname, '..', 'docs')));

// Database Migrations
const { ensureMigrated } = require('./db/migrations/run');
ensureMigrated().catch(err => console.error('[INIT] Erro ao executar migrações de banco:', err.message));


// Tratamento de erros limpo para o CORS (evita sujar o log com stack trace inteiro)
app.use((err, req, res, next) => {
    if (err.message === 'Bloqueado pelo CORS') {
        console.warn(`[CORS BLOQUEADO] IP: ${req.ip} | HOST: ${req.hostname || req.headers.host} | ORIGIN: ${req.headers.origin}`);
        return res.status(403).json({ error: 'Origem não permitida (CORS)' });
    }
    next(err);
});

module.exports = app;
