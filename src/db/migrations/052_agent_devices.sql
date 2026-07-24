-- Migration 052: Tabela de vinculação e histórico de dispositivos por agente
CREATE TABLE IF NOT EXISTS agent_devices (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(100) NOT NULL,
    device_id VARCHAR(255) NOT NULL,
    platform VARCHAR(50) DEFAULT 'android',
    first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    login_count INT DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    CONSTRAINT unique_agent_device UNIQUE (agent_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_devices_agent_id ON agent_devices(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_devices_device_id ON agent_devices(device_id);
