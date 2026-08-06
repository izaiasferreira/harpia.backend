-- 065_colaboradores_is_gestor.sql
-- Checklist de Segurança v2.0 — Pilar 1
-- Marca um agente como gestor. Default false: agentes existentes não viram gestores até
-- serem marcados manualmente no painel admin.
ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS is_gestor BOOLEAN NOT NULL DEFAULT false;
