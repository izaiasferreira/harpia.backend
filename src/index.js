const http = require('http');
const app = require('./app');
const { initSocket } = require('./socket');

const server = http.createServer(app);
initSocket(server);

// Inicia o worker assíncrono de tracking (staging -> tabela principal)
const trackingSyncWorker = require('./workers/trackingSyncWorker');
trackingSyncWorker.start();

const port = parseInt(process.env.PORT) || 8000;
server.listen(port, '0.0.0.0', () => {
    console.log(`API Banco rodando em http://0.0.0.0:${port}`);
});



