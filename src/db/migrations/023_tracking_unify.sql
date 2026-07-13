-- 023_tracking_unify.sql
-- 1. Adiciona unique constraint para ON CONFLICT (agent_id, recorded_at)
-- 2. Remove tabelas legadas
-- 3. Torna staging LOGGED para evitar perda de dados em crash

BEGIN;

-- 1. Adicionar unique constraint para permitir ON CONFLICT no worker
ALTER TABLE tracking_session_points
DROP CONSTRAINT IF EXISTS uq_tracking_session_points_agent_recorded;

ALTER TABLE tracking_session_points
ADD CONSTRAINT uq_tracking_session_points_agent_recorded
UNIQUE (agent_id, recorded_at);

-- 2. Dropar tabelas legadas (índices removidos em cascata)
DROP TABLE IF EXISTS speed_violations CASCADE;
DROP TABLE IF EXISTS tracking_points CASCADE;

-- 3. Migrar staging de UNLOGGED para LOGGED (evita perda em crash/restart)
ALTER TABLE tracking_staging SET LOGGED;

COMMIT;
