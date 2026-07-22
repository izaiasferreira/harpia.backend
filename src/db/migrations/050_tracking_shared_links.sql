-- Criação da tabela de links compartilhados de tracking

CREATE TABLE tracking_shared_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token VARCHAR(64) UNIQUE NOT NULL,
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    duration_minutes INTEGER NOT NULL,
    target_agents JSONB NOT NULL,
    revoked_at TIMESTAMP
);

CREATE INDEX idx_tracking_shared_links_token ON tracking_shared_links(token);
CREATE INDEX idx_tracking_shared_links_expires_at ON tracking_shared_links(expires_at);
