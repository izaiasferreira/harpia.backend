-- Migration 063: Service Annotations expiration
-- Anotações podem ter expiração opcional (definida pelo admin).
-- NULL = nunca expira (padrão, inclui todas criadas por agentes).

ALTER TABLE service_annotations ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_service_annotations_expires_at ON service_annotations(expires_at);
