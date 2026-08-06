-- Migration 064: Service Annotations archive
-- Anotações arquivadas não aparecem mais para os agentes (soft-delete reversível).
-- Admin pode arquivar e desarquivar.

ALTER TABLE service_annotations ADD COLUMN IF NOT EXISTS arquivada BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_service_annotations_arquivada ON service_annotations(arquivada);
