-- Migration 067: Melhorias no sistema de detecção de queda
-- 1. Adiciona device_incident_id para idempotência de sync (id gerado no celular)
-- 2. Adiciona impact_band para banda de severidade do impacto
-- 3. Adiciona rotation_fallback_used para indicar detecção sem giroscópio
-- 4. Adiciona immobility_verified para indicar se imobilidade foi confirmada limpa

-- 1. Coluna de ID único do dispositivo (UUID gerado no celular)
ALTER TABLE fall_incidents ADD COLUMN IF NOT EXISTS
    device_incident_id UUID;

-- Índice único para idempotência de sync (evita duplicatas por re-sync)
CREATE UNIQUE INDEX IF NOT EXISTS idx_fall_incidents_device_id
    ON fall_incidents(device_incident_id)
    WHERE device_incident_id IS NOT NULL;

-- 2. Banda de severidade do impacto: 'normal' (2.5-5g), 'violent' (5-10g), 'extreme' (>10g)
ALTER TABLE fall_incidents ADD COLUMN IF NOT EXISTS
    impact_band VARCHAR(10);

-- 3. Fallback sem giroscópio: TRUE quando ROTATION foi pulada (dispositivo sem giroscópio)
ALTER TABLE fall_incidents ADD COLUMN IF NOT EXISTS
    rotation_fallback_used BOOLEAN DEFAULT FALSE;

-- 4. Imobilidade verificada limpa (sem movimento sustentado). FALSE = caso marginal.
ALTER TABLE fall_incidents ADD COLUMN IF NOT EXISTS
    immobility_verified BOOLEAN DEFAULT TRUE;

-- 5. Status 'cancelled' para quedas marcadas como "Estou Bem" (telemetria futura)
-- Já existe no campo status como VARCHAR(20), só documentar os valores:
-- 'pending' = aguardando revisão admin
-- 'confirmed' = confirmado como acidente real
-- 'false_positive' = confirmado como falso positivo pelo admin
-- 'cancelled' = agente marcou "Estou Bem" (não deve existir no servidor, mas reservado)

-- 6. Índice para filtrar por impact_band e rotation_fallback
CREATE INDEX IF NOT EXISTS idx_fall_incidents_band
    ON fall_incidents(impact_band)
    WHERE impact_band IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fall_incidents_rotation_fallback
    ON fall_incidents(rotation_fallback_used)
    WHERE rotation_fallback_used = TRUE;
