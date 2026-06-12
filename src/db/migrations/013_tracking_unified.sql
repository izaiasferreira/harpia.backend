-- Tracking Unificado: todos os dados em um único ponto
-- Substitui tracking_points (adiciona gps_enabled, is_charging, speed_limit_usado)
-- e elimina speed_violations separada (validação agora é no backend)

-- Tabela unificada de pontos de sessão
CREATE TABLE IF NOT EXISTS tracking_session_points (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(50) NOT NULL REFERENCES login(id) ON DELETE CASCADE,

    -- Localização
    latitude  DECIMAL(10,7) NOT NULL,
    longitude DECIMAL(10,7) NOT NULL,
    speed     DECIMAL(6,2),        -- km/h
    accuracy  DECIMAL(6,2),        -- metros

    -- Status do dispositivo (capturado junto com o ponto)
    battery_level   DECIMAL(4,1),  -- 0-100
    is_charging     BOOLEAN DEFAULT FALSE,
    network_type    VARCHAR(20),
    gps_enabled     BOOLEAN DEFAULT TRUE,
    device_model    VARCHAR(100),
    device_platform VARCHAR(20),
    os_version      VARCHAR(20),

    -- Auditoria
    recorded_at TIMESTAMP NOT NULL,
    synced_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Resultado da validação de velocidade (feita no backend)
    speed_limit_applied DECIMAL(6,2),  -- limite que estava configurado neste ponto
    is_speed_violation  BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_tsp_agent_recorded
    ON tracking_session_points(agent_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_tsp_violations
    ON tracking_session_points(agent_id, is_speed_violation)
    WHERE is_speed_violation = TRUE;

-- Tabela de configurações de tracking por agente
CREATE TABLE IF NOT EXISTS tracking_agent_config (
    agent_id VARCHAR(50) PRIMARY KEY REFERENCES login(id) ON DELETE CASCADE,
    speed_limit_kmh      DECIMAL(6,2) DEFAULT 81.0,
    updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by           VARCHAR(50)
);

-- Tabela de configurações globais de tracking
CREATE TABLE IF NOT EXISTS tracking_global_config (
    key   VARCHAR(50) PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO tracking_global_config (key, value) VALUES ('default_speed_limit_kmh', '81.0')
ON CONFLICT (key) DO NOTHING;

-- Migra dados antigos de speed_violations para tracking_session_points
-- (pontos que já tinham velocidade registrada na tabela antiga)
-- Isso garante continuidade histórica — não perde dados de violações anteriores