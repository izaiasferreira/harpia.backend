-- Migration 056: Corrige timestamps armazenados em BRT (UTC-3) para UTC
-- 
-- Contexto: app.js tinha process.env.TZ = 'America/Sao_Paulo' hardcoded,
-- fazendo com que pg serializasse Date objects com offset -03:00.
-- PostgreSQL ignora timezone em colunas TIMESTAMP WITHOUT TIME ZONE,
-- armazenando o horário local BRUTO (BRT) em vez de UTC.
--
-- affected: checklists.submitted_at, checklists.synced_at

-- checklists.submitted_at: gerado via new Date() no Node → armazenado em BRT
-- Correção: adicionar 3 horas aos registros afetados (where submitted_at != created_at)
UPDATE checklists
SET submitted_at = submitted_at + INTERVAL '3 hours',
    synced_at = CASE WHEN synced_at IS NOT NULL THEN synced_at + INTERVAL '3 hours' ELSE NULL END
WHERE submitted_at IS NOT NULL
  AND created_at IS NOT NULL
  AND EXTRACT(EPOCH FROM (created_at - submitted_at)) BETWEEN 10700 AND 10900;

-- checklists_old (backup): mesma correção se existir
UPDATE checklists_old
SET submitted_at = submitted_at + INTERVAL '3 hours',
    synced_at = CASE WHEN synced_at IS NOT NULL THEN synced_at + INTERVAL '3 hours' ELSE NULL END
WHERE submitted_at IS NOT NULL
  AND created_at IS NOT NULL
  AND EXTRACT(EPOCH FROM (created_at - submitted_at)) BETWEEN 10700 AND 10900;
