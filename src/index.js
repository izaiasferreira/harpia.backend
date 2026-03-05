require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const app = express();

app.use(express.json());
app.use(morgan('[:date[clf]] :method :url :status :res[content-length] - :response-time ms'));

// Routes
const consultasRouter = require('./routes/consultas');
const webhooksRouter = require('./routes/webhooks');
const revalidateRouter = require('./routes/revalidate');
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

// Arquivos estáticos (deve ser o último para não interceptar as outras rotas)
app.use('/', filesRouter);

const port = parseInt(process.env.PORT) || 8000;
app.listen(port, '0.0.0.0', () => {
    console.log(`API Banco rodando em http://0.0.0.0:${port}`);
});
