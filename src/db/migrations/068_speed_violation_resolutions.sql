-- Resoluções de Infrações de Velocidade
-- Cada resolução cobre TODAS as infrações de um agente em uma data.
-- Não altera tracking_session_points (dados brutos permanecem intactos).

CREATE TABLE IF NOT EXISTS speed_violation_resolutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id VARCHAR(50) NOT NULL REFERENCES login(id) ON DELETE CASCADE,
    resolved_date DATE NOT NULL,
    is_valid BOOLEAN NOT NULL,               -- true = infração procedente; false = não procedente
    description TEXT NOT NULL,               -- o que foi feito
    photo_url TEXT NOT NULL,                 -- evidência fotográfica (URL no MinIO)
    violation_ids INTEGER[] NOT NULL DEFAULT '{}', -- ids dos pontos (tracking_session_points) solucionados
    resolved_by INTEGER REFERENCES users(id), -- quem criou
    resolved_by_nome TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_by INTEGER REFERENCES users(id), -- quem editou
    updated_at TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_speed_resolutions_agent_date
    ON speed_violation_resolutions(agent_id, resolved_date);

CREATE INDEX IF NOT EXISTS idx_speed_resolutions_date
    ON speed_violation_resolutions(resolved_date);
