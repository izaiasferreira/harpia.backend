const crypto = require('crypto');
const { pi_pool } = require('../db');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

let tableChecked = false;

async function ensureTelegramTokensTable() {
    if (tableChecked) return;
    
    try {
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
        
        await pi_pool.query(`
            CREATE INDEX IF NOT EXISTS idx_telegram_tokens_token ON telegram_tokens(token)
        `);
        
        await pi_pool.query(`
            CREATE INDEX IF NOT EXISTS idx_telegram_tokens_user_id ON telegram_tokens(telegram_user_id)
        `);
        
        console.log('[TELEGRAM] Tabela telegram_tokens verificada/criada');
        tableChecked = true;
    } catch (err) {
        console.error('[TELEGRAM] Erro ao criar tabela:', err);
    }
}

async function telegramAuth(req, res, next) {
    const initData = req.headers['x-telegram-init-data'] || req.query.telegram_init_data;
    
    if (!initData) {
        return res.status(401).json({ error: 'Dados de autenticação do Telegram não fornecidos' });
    }
    
    try {
        let telegramId;
        
        if (initData.includes('hash=')) {
            if (!TELEGRAM_BOT_TOKEN) {
                return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN não configurado' });
            }
            
            const params = new URLSearchParams(initData);
            const data = Object.fromEntries(params.entries());
            
            if (!data.hash) {
                return res.status(403).json({ error: 'Hash não encontrado' });
            }
            
            if (data.user) {
                try {
                    const userObj = JSON.parse(decodeURIComponent(data.user));
                    telegramId = userObj.id;
                } catch (e) {
                    return res.status(403).json({ error: 'Dados do usuário inválidos' });
                }
            } else if (data.id) {
                telegramId = parseInt(data.id);
            } else {
                return res.status(403).json({ error: 'ID do usuário não encontrado' });
            }
            
            const hash = data.hash;
            
            // Guardar user para cálculo do hash
            const userData = data.user;
            
            // Remover hash e user para calcular
            delete data.hash;
            delete data.user;
            
            const secretKey = crypto.createHmac('sha256', 'WebAppData').update(TELEGRAM_BOT_TOKEN).digest();
            const dataCheckString = Object.keys(data).sort().map(k => `${k}=${data[k]}`).join('\n');
            
            const dataCheckWithUser = dataCheckString + (userData ? '\nuser=' + userData : '');
            
            const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckWithUser).digest('hex');

            if (calculatedHash !== hash) {
                return res.status(403).json({ error: 'Hash inválido' });
            }
        } else {
            await ensureTelegramTokensTable();
            
            const { rows } = await pi_pool.query(
                'SELECT telegram_user_id FROM telegram_tokens WHERE token = $1 AND expires_at > CURRENT_TIMESTAMP',
                [initData]
            );
            
            if (rows.length === 0) {
                return res.status(403).json({ error: 'Token expirado ou inválido' });
            }
            
            telegramId = rows[0].telegram_user_id;
        }
        
        // Garantir que o ID seja string para bater com o tipo TEXT na tabela login
        const telegramIdStr = String(telegramId).trim();

        const { rows: collaboratorRows } = await pi_pool.query(
            'SELECT id, estado FROM login WHERE telegram_id = $1',
            [telegramIdStr]
        );
        
        if (collaboratorRows.length === 0) {
            return res.status(403).json({ error: 'Usuário não autorizado' });
        }
        
        const collaborator = collaboratorRows[0];
        req.colaborador = {
            id: collaborator.id,
            estado: collaborator.estado,
            telegramId: telegramIdStr
        };
        
        next();
    } catch (err) {
        console.error('Erro na autenticação Telegram:', err);
        return res.status(500).json({ error: 'Erro interno na autenticação' });
    }
}

module.exports = { telegramAuth };
