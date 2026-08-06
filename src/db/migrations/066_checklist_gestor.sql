-- 066_checklist_gestor.sql
-- Checklist de Segurança v2.0 — Pilar 2
-- Templates do gestor (is_gestor) e alvo do checklist (target_agent_id).

-- 1. Flag de template do gestor
ALTER TABLE checklist_templates
  ADD COLUMN IF NOT EXISTS is_gestor BOOLEAN NOT NULL DEFAULT false;

-- 2. Agente alvo (liderado) do checklist preenchido pelo gestor
--    NULL = checklist do agente (comportamento atual); NOT NULL = checklist do gestor.
ALTER TABLE checklists
  ADD COLUMN IF NOT EXISTS target_agent_id VARCHAR(50) REFERENCES login(id) ON DELETE CASCADE;

-- 3. Regra de mês: 1 checklist do gestor por (gestor, liderado, mês), global.
--    Usa EXTRACT + CAST para evitar erro "functions in index expression must be marked IMMUTABLE".
CREATE UNIQUE INDEX IF NOT EXISTS unique_gestor_target_mes
  ON checklists(agent_id, target_agent_id,
                CAST(EXTRACT(YEAR FROM date) AS INTEGER),
                CAST(EXTRACT(MONTH FROM date) AS INTEGER))
  WHERE target_agent_id IS NOT NULL;
