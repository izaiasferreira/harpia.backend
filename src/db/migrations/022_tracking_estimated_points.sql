-- Tracking: Dead Reckoning / estimativa de posição
-- Adiciona colunas para pontos estimados quando GPS falha temporariamente

ALTER TABLE tracking_session_points
  ADD COLUMN IF NOT EXISTS is_estimated BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS estimated_from_lat DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS estimated_from_lng DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS dead_reckon_drift DECIMAL(6,2),
  ADD COLUMN IF NOT EXISTS heading_at_estimation DECIMAL(5,1);
