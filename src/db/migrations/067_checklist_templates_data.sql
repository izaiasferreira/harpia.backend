-- 067: Adiciona a coluna `data` (JSONB) em checklist_templates e checklists.
-- As tabelas foram criadas originalmente pela 017 (sem `data`); a 023 usou
-- CREATE TABLE IF NOT EXISTS e nunca adicionou a coluna em bancos já existentes.
-- ADD COLUMN IF NOT EXISTS é idempotente e preserva dados existentes.

ALTER TABLE checklist_templates
  ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE checklists
  ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}'::jsonb;
