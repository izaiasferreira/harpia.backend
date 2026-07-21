const crypto = require('crypto');
const { cenos_pool } = require('../db');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

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

            const { rows } = await cenos_pool.query(
                'SELECT telegram_user_id, agent_id, expires_at FROM telegram_tokens WHERE token = $1 AND expires_at > CURRENT_TIMESTAMP',
                [initData]
            );

            if (rows.length === 0) {
                return res.status(403).json({ error: 'Token expirado ou inválido' });
            }

            // Sliding expiration
            const daysUntilExpiry = (new Date(rows[0].expires_at) - Date.now()) / (1000 * 60 * 60 * 24);
            if (daysUntilExpiry < 15) {
                cenos_pool.query(
                    "UPDATE telegram_tokens SET expires_at = CURRENT_TIMESTAMP + interval '30 days' WHERE token = $1",
                    [initData]
                ).catch(e => console.error('[SLIDING EXPIRATION AUTH] Erro:', e.message));
            }

            // Se tem agent_id (login por PIN), busca direto pelo ID
            if (rows[0].agent_id) {
                const agentIdUpper = rows[0].agent_id.toUpperCase();
                
                // 1. Tenta buscar em colaboradores primeiro (prioridade)
                let { rows: agentRows } = await cenos_pool.query(
                    `SELECT "ID" as id, "estado", "seccional", "regional", "Nome" as nome, "MAT" as mat
                     FROM colaboradores
                     WHERE upper("ID") = $1`,
                    [agentIdUpper]
                );

                // 2. Se não encontrou, tenta na tabela login (fallback para usuários legados/admins)
                if (agentRows.length === 0) {
                    const { rows: loginRows } = await cenos_pool.query(
                        `SELECT id, estado, NULL as seccional, NULL as regional, id as nome, NULL as mat
                         FROM login
                         WHERE upper(id) = $1`,
                        [agentIdUpper]
                    );
                    agentRows = loginRows;
                }

                if (agentRows.length === 0) {
                    return res.status(403).json({ error: 'Usuário não autorizado' });
                }

                req.colaborador = {
                    id: agentRows[0].id,
                    estado: agentRows[0].estado,
                    seccional: agentRows[0].seccional ? agentRows[0].seccional.toUpperCase() : null,
                    regional: agentRows[0].regional ? agentRows[0].regional.toUpperCase() : null,
                    nome: agentRows[0].nome,
                    mat: agentRows[0].mat,
                    telegramId: String(rows[0].telegram_user_id)
                };

                return next();
            }

            telegramId = rows[0].telegram_user_id;
        }
        
        // Garantir que o ID seja string para bater com o tipo TEXT na tabela login
        const telegramIdStr = String(telegramId).trim();

        const { rows: collaboratorRows } = await cenos_pool.query(
            `SELECT l.id, l.estado, c."seccional", c."regional", c."Nome" as nome, c."MAT" as mat
             FROM login l
             LEFT JOIN colaboradores c ON l.id = c."ID"
             WHERE l.telegram_id = $1`,
            [telegramIdStr]
        );
        
        if (collaboratorRows.length === 0) {
            return res.status(403).json({ error: 'Usuário não autorizado' });
        }
        
        const collaborator = collaboratorRows[0];
        req.colaborador = {
            id: collaborator.id,
            estado: collaborator.estado,
            seccional: collaborator.seccional ? collaborator.seccional.toUpperCase() : null,
            regional: collaborator.regional ? collaborator.regional.toUpperCase() : null,
            nome: collaborator.nome,
            mat: collaborator.mat,
            telegramId: telegramIdStr
        };
        
        next();
    } catch (err) {
        console.error('Erro na autenticação Telegram:', err);
        return res.status(500).json({ error: 'Erro interno na autenticação' });
    }
}

module.exports = { telegramAuth };
