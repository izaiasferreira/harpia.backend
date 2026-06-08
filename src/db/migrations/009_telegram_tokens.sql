-- Consolidar tabela telegram_tokens (removida de public.js e telegramAuth.js)
CREATE TABLE IF NOT EXISTS telegram_tokens (
    id SERIAL PRIMARY KEY,
    token VARCHAR(255) NOT NULL UNIQUE,
    telegram_user_id BIGINT NOT NULL,
    agent_id VARCHAR(50),
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_telegram_tokens_token ON telegram_tokens(token);
CREATE INDEX IF NOT EXISTS idx_telegram_tokens_user_id ON telegram_tokens(telegram_user_id);
