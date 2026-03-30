process.env.TZ = 'America/Sao_Paulo';
require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const app = express();

app.use(express.json());

// Only use morgan logger if not in test environment
if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('[:date[clf]] :method :url :status :res[content-length] - :response-time ms'));
}

// Routes
const consultasRouter = require('./routes/consultas');
const webhooksRouter = require('./routes/webhooks');
const revalidateRouter = require('./routes/revalidate');
const agenteRouter = require('./routes/agente')

const { router: filesRouter } = require('./routes/files');

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Consultas
app.use('/', consultasRouter);

// Webhooks
app.use('/', webhooksRouter);

// Revalidacao
app.use('/', revalidateRouter);

app.use('/', agenteRouter)

// Arquivos estáticos (deve ser o último para não interceptar as outras rotas)
app.use('/', filesRouter);



module.exports = app;
