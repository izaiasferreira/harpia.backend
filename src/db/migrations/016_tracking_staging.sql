-- 016_tracking_staging.sql
-- Tabela de staging temporária para receber pontos de rastreamento de forma ultra-rápida.
CREATE TABLE IF NOT EXISTS tracking_staging (
    id BIGSERIAL PRIMARY KEY,
    agent_id TEXT NOT NULL,
    payload JSONB NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    error_message TEXT
);

-- Índice parcial para o worker localizar de forma eficiente os registros pendentes
CREATE INDEX IF NOT EXISTS idx_tracking_staging_worker
    ON tracking_staging (status, received_at)
    WHERE status = 'pending';

-- Acelerar inserções na tabela de staging não gerando logs WAL
ALTER TABLE tracking_staging SET UNLOGGED;

-- Garantir que as colunas necessárias existam caso a tabela já tenha sido criada anteriormente
ALTER TABLE tracking_staging ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tracking_staging ADD COLUMN IF NOT EXISTS error_message TEXT;
