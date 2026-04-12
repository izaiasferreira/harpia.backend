const crypto = require('crypto');
require('dotenv').config();

const { pi_pool } = require('./src/db');

async function createTestToken() {
    const telegramId = (process.argv[2] || process.env.TEST_TELEGRAM_ID || '8469360771').toString().trim();

    if (!telegramId || telegramId === 'undefined') {
        console.error('Erro: TEST_TELEGRAM_ID não definido no .env e nenhum ID passado como argumento.');
        process.exit(1);
    }

    try {
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000 * 30);

        await pi_pool.query(`
            CREATE TABLE IF NOT EXISTS telegram_tokens (
                id SERIAL PRIMARY KEY, 
                token VARCHAR(255) NOT NULL UNIQUE, 
                telegram_user_id BIGINT NOT NULL, 
                expires_at TIMESTAMP NOT NULL, 
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
                last_used_at TIMESTAMP
            )
        `);

        await pi_pool.query(
            'INSERT INTO telegram_tokens (token, telegram_user_id, expires_at) VALUES ($1, $2, $3)',
            [token, telegramId, expiresAt]
        );

        console.log('\n=== Token criado com sucesso ===\n');
        console.log('Token:', token);
        console.log('Telegram ID:', telegramId);
        console.log('Expira em:', expiresAt.toISOString());
        console.log('\n=== Como testar ===\n');
        console.log(`curl "http://localhost:3040/agent_statistics" -H "X-Telegram-Init-Data: ${token}"\n`);

        process.exit(0);
    } catch (err) {
        console.error('Erro:', err.message);
        process.exit(1);
    }
}

createTestToken();
