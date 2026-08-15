-- Adiciona suporte a galeria de assets nos Avisos do App
ALTER TABLE app_alerts ADD COLUMN IF NOT EXISTS assets JSONB DEFAULT '[]'::jsonb;
