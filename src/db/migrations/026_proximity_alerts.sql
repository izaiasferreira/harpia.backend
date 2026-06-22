-- Migration 026: Proximity Alerts
-- Salva logs de alertas de proximidade recebidos ou processados pelo app nativo (foreground/notification)

CREATE TABLE IF NOT EXISTS agent_proximity_alerts (
    id VARCHAR(100) PRIMARY KEY,
    agent_id VARCHAR(50) NOT NULL REFERENCES login(id) ON DELETE CASCADE,
    latitude DECIMAL(10,7),
    longitude DECIMAL(10,7),
    motivo VARCHAR(255) NOT NULL,
    distance DECIMAL(8,2) NOT NULL,
    action_taken VARCHAR(50) NOT NULL, -- 'foreground' | 'notification'
    recorded_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_proximity_alerts_agent ON agent_proximity_alerts(agent_id);
CREATE INDEX IF NOT EXISTS idx_proximity_alerts_recorded ON agent_proximity_alerts(recorded_at DESC);
