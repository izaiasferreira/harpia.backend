CREATE TABLE IF NOT EXISTS api_tokens (
    id SERIAL PRIMARY KEY,
    token_identifier VARCHAR(16) NOT NULL UNIQUE,
    token_hash TEXT NOT NULL,
    label VARCHAR(255) NOT NULL,
    created_by VARCHAR(50) NOT NULL,
    created_by_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP DEFAULT NULL,
    revoked_at TIMESTAMP DEFAULT NULL,
    revoked_by VARCHAR(50) DEFAULT NULL,
    last_used_at TIMESTAMP DEFAULT NULL,
    last_used_ip VARCHAR(45) DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS api_token_usage (
    id SERIAL PRIMARY KEY,
    token_id INTEGER NOT NULL REFERENCES api_tokens(id) ON DELETE CASCADE,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    ip VARCHAR(45) DEFAULT NULL,
    user_agent TEXT DEFAULT NULL,
    accessed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_identifier ON api_tokens(token_identifier);
CREATE INDEX IF NOT EXISTS idx_api_token_usage_token_id ON api_token_usage(token_id);
CREATE INDEX IF NOT EXISTS idx_api_token_usage_accessed_at ON api_token_usage(accessed_at);
