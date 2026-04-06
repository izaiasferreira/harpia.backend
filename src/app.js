process.env.TZ = 'America/Sao_Paulo';
require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
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
        // Verifica match exato OU se o origin contém o IP/domínio configurado
        const allowed = allowedOrigins.some(o => {
            if (origin === o) return true;
            // Extrai hostname do origin (ex: "http://192.168.1.100:3000" → "192.168.1.100")
            try {
                const hostname = new URL(origin).hostname;
                return hostname === o;
            } catch { return false; }
        });
        if (allowed) return callback(null, true);
        return callback(new Error('Bloqueado pelo CORS'));
    }
}));

app.use(express.json());

// Routes
const consultasRouter = require('./routes/consultas');
const webhooksRouter = require('./routes/webhooks');
const revalidateRouter = require('./routes/revalidate');
const agenteRouter = require('./routes/agente')

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }), atual_time: new Date().toString() });
});

// Consultas
app.use('/', consultasRouter);

// Webhooks
app.use('/', webhooksRouter);

// Revalidacao
app.use('/', revalidateRouter);

app.use('/', agenteRouter)


// Tratamento de erros limpo para o CORS (evita sujar o log com stack trace inteiro)
app.use((err, req, res, next) => {
    if (err.message === 'Bloqueado pelo CORS') {
        console.warn(`[CORS BLOQUEADO] IP: ${req.ip} | HOST: ${req.hostname || req.headers.host} | ORIGIN: ${req.headers.origin}`);
        return res.status(403).json({ error: 'Origem não permitida (CORS)' });
    }
    next(err);
});

module.exports = app;
