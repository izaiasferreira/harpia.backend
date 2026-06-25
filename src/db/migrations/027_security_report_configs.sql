-- Security Report Configs — migration 027
-- Configuração de perigos e tipos de acidente pelo admin,
-- com filtros de visibilidade por estado/regional/seccional/cargo

CREATE TABLE IF NOT EXISTS security_report_configs (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    estado VARCHAR(2),
    data JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_report_configs_estado ON security_report_configs(estado);
CREATE INDEX IF NOT EXISTS idx_security_report_configs_active ON security_report_configs(is_active);

-- Seed: cria configuração padrão com os perigos e tipos de acidente que estavam hardcoded
INSERT INTO security_report_configs (title, estado, data)
SELECT 'Configuração Padrão', NULL, jsonb_build_object(
  'perigos', jsonb_build_array(
    jsonb_build_object('valor', 'Sem Risco', 'cor', '#10b981', 'ordem', 0),
    jsonb_build_object('valor', 'Ataque de animais', 'cor', '#ef4444', 'ordem', 1),
    jsonb_build_object('valor', 'Queda em terreno irregular', 'cor', '#f59e0b', 'ordem', 2),
    jsonb_build_object('valor', 'Terreno off-road ou alagado', 'cor', '#3b82f6', 'ordem', 3),
    jsonb_build_object('valor', 'Acidente de trânsito', 'cor', '#7f1d1d', 'ordem', 4),
    jsonb_build_object('valor', 'Exposição ao calor e sol', 'cor', '#fbbf24', 'ordem', 5),
    jsonb_build_object('valor', 'Risco de choque elétrico', 'cor', '#f472b6', 'ordem', 6),
    jsonb_build_object('valor', 'Local de difícil acesso', 'cor', '#6b7280', 'ordem', 7),
    jsonb_build_object('valor', 'Risco de violência', 'cor', '#111827', 'ordem', 8),
    jsonb_build_object('valor', 'Cão solto ou agressivo', 'cor', '#b91c1c', 'ordem', 9),
    jsonb_build_object('valor', 'Trajeto exaustivo', 'cor', '#8b5cf6', 'ordem', 10),
    jsonb_build_object('valor', 'Problemas no clima', 'cor', '#06b6d4', 'ordem', 11),
    jsonb_build_object('valor', 'Vegetação cortante ou urticante', 'cor', '#10b981', 'ordem', 12),
    jsonb_build_object('valor', 'Poeira excessiva', 'cor', '#78350f', 'ordem', 13),
    jsonb_build_object('valor', 'Ambiente sem saneamento', 'cor', '#4d7c0f', 'ordem', 14),
    jsonb_build_object('valor', 'Risco de queda de moto', 'cor', '#d97706', 'ordem', 15)
  ),
  'tipos_acidente', jsonb_build_array(
    jsonb_build_object('valor', 'Acidente de moto', 'ordem', 0),
    jsonb_build_object('valor', 'Mordida de animal', 'ordem', 1),
    jsonb_build_object('valor', 'Choque elétrico', 'ordem', 2),
    jsonb_build_object('valor', 'Queda', 'ordem', 3),
    jsonb_build_object('valor', 'Torsão', 'ordem', 4),
    jsonb_build_object('valor', 'Desmaio', 'ordem', 5),
    jsonb_build_object('valor', 'Outro', 'ordem', 6)
  ),
  'filters', jsonb_build_object()
)
WHERE NOT EXISTS (SELECT 1 FROM security_report_configs LIMIT 1);
