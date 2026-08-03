const http = require('http');
const app = require('./app');
const { initSocket } = require('./socket');

const server = http.createServer(app);
initSocket(server);

const { ensureMigrated } = require('./db/migrations/run');
const { testStorageConnection } = require('./functions/storage');
const trackingSyncWorker = require('./workers/trackingSyncWorker');

async function startServer() {
    try {
        await ensureMigrated();
    } catch (err) {
        console.error('[INIT] Erro ao executar migrações de banco:', err.message);
    }

    // Testa conexão com o storage (ex.: Wasabi) — não fatal, apenas log
    await testStorageConnection();

    // Inicia o worker assíncrono de tracking (staging -> tabela principal) APÓS as migrações
    trackingSyncWorker.start();

    const port = parseInt(process.env.PORT) || 8000;
    server.listen(port, '0.0.0.0', () => {
        console.log(`API Banco rodando em http://0.0.0.0:${port}`);
    });
}

startServer();



