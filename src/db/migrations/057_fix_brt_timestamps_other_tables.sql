-- Migration 057: Corrige timestamps BRT em tracking tables (fall_incidents, agent_alerts_log, agent_proximity_alerts)
--
-- Mesmo problema da migration 056: app.js tinha process.env.TZ = 'America/Sao_Paulo'
-- fazendo new Date() no Node serializar em BRT. PostgreSQL armazenou o valor BRT
-- em colunas TIMESTAMP WITHOUT TIME ZONE.
--
-- Tabelas afetadas:
--   fall_incidents.recorded_at        (vs synced_at da PG = UTC)
--   agent_alerts_log.recorded_at      (vs synced_at da PG = UTC)
--   agent_proximity_alerts.recorded_at (vs created_at da PG = UTC)

UPDATE fall_incidents
SET recorded_at = recorded_at + INTERVAL '3 hours'
WHERE recorded_at IS NOT NULL
  AND synced_at IS NOT NULL
  AND EXTRACT(EPOCH FROM (synced_at - recorded_at)) BETWEEN 10700 AND 10900;

UPDATE agent_alerts_log
SET recorded_at = recorded_at + INTERVAL '3 hours'
WHERE recorded_at IS NOT NULL
  AND synced_at IS NOT NULL
  AND EXTRACT(EPOCH FROM (synced_at - recorded_at)) BETWEEN 10700 AND 10900;

UPDATE agent_proximity_alerts
SET recorded_at = recorded_at + INTERVAL '3 hours'
WHERE recorded_at IS NOT NULL
  AND created_at IS NOT NULL
  AND EXTRACT(EPOCH FROM (created_at - recorded_at)) BETWEEN 10700 AND 10900;
