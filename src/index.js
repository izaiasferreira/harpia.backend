const app = require('./app');

const port = parseInt(process.env.PORT) || 8000;
app.listen(port, '0.0.0.0', () => {
    console.log(`API Banco rodando em http://0.0.0.0:${port}`);
});
