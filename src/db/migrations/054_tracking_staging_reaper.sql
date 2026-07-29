-- 054_tracking_staging_reaper.sql
-- Adiciona coluna processing_started_at para detectar registros presos em 'processing'
-- e permitir que sejam retomados por outras instâncias do worker (reaper pattern).

BEGIN;

ALTER TABLE tracking_staging ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;

COMMIT;
