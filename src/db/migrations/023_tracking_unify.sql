-- 023_tracking_unify.sql
-- 1. Corrige: adiciona unique constraint para ON CONFLICT (agent_id, recorded_at)
-- 2. Migra dados legados de tracking_points e speed_violations
-- 3. Remove tabelas legadas
-- 4. Torna staging LOGGED para evitar perda de dados em crash

BEGIN;

-- 1. Migrar tracking_points legados para tracking_session_points
INSERT INTO tracking_session_points (
    agent_id, latitude, longitude, speed, accuracy,
    battery_level, is_charging, network_type, gps_enabled,
    device_model, device_platform, os_version,
    recorded_at
)
SELECT
    tp.agent_id, tp.latitude, tp.longitude, ROUND((tp.speed * 3.6)::numeric, 1), tp.accuracy,
    tp.battery_level, NULL, tp.network_type, TRUE,
    tp.device_model, tp.device_platform, tp.os_version,
    tp.recorded_at
FROM tracking_points tp
WHERE EXISTS (SELECT 1 FROM login l WHERE l.id = tp.agent_id)
AND NOT EXISTS (
    SELECT 1 FROM tracking_session_points tsp
    WHERE tsp.agent_id = tp.agent_id AND tsp.recorded_at = tp.recorded_at
);

-- 2. Migrar speed_violations legados para tracking_session_points (como is_speed_violation = TRUE)
INSERT INTO tracking_session_points (
    agent_id, latitude, longitude, speed, accuracy,
    recorded_at, is_speed_violation, speed_limit_applied
)
SELECT
    sv.agent_id, sv.latitude, sv.longitude, sv.speed, NULL,
    sv.recorded_at, TRUE, sv.speed_limit
FROM speed_violations sv
WHERE EXISTS (SELECT 1 FROM login l WHERE l.id = sv.agent_id)
AND NOT EXISTS (
    SELECT 1 FROM tracking_session_points tsp
    WHERE tsp.agent_id = sv.agent_id AND tsp.recorded_at = sv.recorded_at
);

-- 3. Remover duplicatas (mesmo agent_id + recorded_at) antes da unique constraint
DELETE FROM tracking_session_points t1
USING tracking_session_points t2
WHERE t1.id > t2.id
  AND t1.agent_id = t2.agent_id
  AND t1.recorded_at = t2.recorded_at;

-- 4. Adicionar unique constraint para permitir ON CONFLICT no worker
ALTER TABLE tracking_session_points
ADD CONSTRAINT uq_tracking_session_points_agent_recorded
UNIQUE (agent_id, recorded_at);

-- 5. Dropar tabelas legadas (índices removidos em cascata)
DROP TABLE IF EXISTS speed_violations CASCADE;
DROP TABLE IF EXISTS tracking_points CASCADE;

-- 6. Migrar staging de UNLOGGED para LOGGED (evita perda em crash/restart)
ALTER TABLE tracking_staging SET LOGGED;

COMMIT;
