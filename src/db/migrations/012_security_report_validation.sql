-- Security Report Validation Migration
-- Adds resolution columns + evidence table

ALTER TABLE security_report
  ADD COLUMN IF NOT EXISTS resolvido BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS resolvido_por VARCHAR(50),
  ADD COLUMN IF NOT EXISTS resolvido_por_nome TEXT,
  ADD COLUMN IF NOT EXISTS resolvido_em TIMESTAMP,
  ADD COLUMN IF NOT EXISTS descricao_solucao TEXT;

CREATE TABLE IF NOT EXISTS security_report_evidencias (
  id SERIAL PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES security_report(id) ON DELETE CASCADE,
  nome_arquivo TEXT NOT NULL,
  tipo VARCHAR(50) NOT NULL,
  caminho TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evidencias_report_id ON security_report_evidencias(report_id);
