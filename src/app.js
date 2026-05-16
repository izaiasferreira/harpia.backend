process.env.TZ = 'America/Sao_Paulo';
require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const logMiddleware = require('./middlewares/logMiddleware');
const app = express();

// Trust proxy é necessário no Dokploy para o express pegar o IP real do cliente ao invés do IP do proxy
app.set('trust proxy', true);

// Only use morgan logger if not in test environment - deve vir ANTES do CORS para registrar as requisições
if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('[:date[clf]] IP: :remote-addr | HOST: :req[host] | :method :url :status :res[content-length] - :response-time ms'));
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
                // Paraizi.tec.br aceitar app.izi.tec.br e api.izi.tec.br
                if (hostname.endsWith(o)) return true;
            } catch { return false; }
        });
        if (allowed) return callback(null, true);
        return callback(new Error('Bloqueado pelo CORS'));
    }
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
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
const formsRouter = require('./routes/forms')

// Rotas de arquivos e upload (MinIO)
app.use('/', uploadRouter);

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




// Tratamento de erros limpo para o CORS (evita sujar o log com stack trace inteiro)
app.use((err, req, res, next) => {
    if (err.message === 'Bloqueado pelo CORS') {
        console.warn(`[CORS BLOQUEADO] IP: ${req.ip} | HOST: ${req.hostname || req.headers.host} | ORIGIN: ${req.headers.origin}`);
        return res.status(403).json({ error: 'Origem não permitida (CORS)' });
    }
    next(err);
});

module.exports = app;
