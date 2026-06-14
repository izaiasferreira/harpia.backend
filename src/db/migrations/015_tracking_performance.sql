-- 015_tracking_performance.sql
-- Índice composto para consultas comuns de histórico de trajetos (agent_id + recorded_at)
CREATE INDEX IF NOT EXISTS idx_tracking_session_points_agent_ts
    ON tracking_session_points (agent_id, recorded_at DESC)
    WHERE recorded_at IS NOT NULL;

-- Índice parcial para violações de velocidade (consultas frequentes no painel de controle)
CREATE INDEX IF NOT EXISTS idx_tracking_session_points_violations
    ON tracking_session_points (agent_id, recorded_at DESC)
    WHERE is_speed_violation = TRUE;
