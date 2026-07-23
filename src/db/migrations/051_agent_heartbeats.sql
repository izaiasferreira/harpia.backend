-- Criar a nova tabela de heartbeats
CREATE TABLE IF NOT EXISTS agent_heartbeats (
    agent_id VARCHAR(50) PRIMARY KEY,
    last_heartbeat_at TIMESTAMP NOT NULL,
    last_heartbeat_lat DOUBLE PRECISION NOT NULL,
    last_heartbeat_lng DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index para facilitar a ordenacao e busca por tempo
CREATE INDEX IF NOT EXISTS idx_agent_heartbeats_at ON agent_heartbeats(last_heartbeat_at DESC);

-- Migrar dados existentes da tabela login para a nova tabela
INSERT INTO agent_heartbeats (agent_id, last_heartbeat_at, last_heartbeat_lat, last_heartbeat_lng)
SELECT id, last_heartbeat_at, last_heartbeat_lat, last_heartbeat_lng
FROM login
WHERE last_heartbeat_at IS NOT NULL
ON CONFLICT (agent_id) DO NOTHING;

-- Remover colunas antigas da tabela login
ALTER TABLE login DROP COLUMN IF EXISTS last_heartbeat_at;
ALTER TABLE login DROP COLUMN IF EXISTS last_heartbeat_lat;
ALTER TABLE login DROP COLUMN IF EXISTS last_heartbeat_lng;
