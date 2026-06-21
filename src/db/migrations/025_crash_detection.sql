-- Migration 025: Crash Detection (Queda/Acidente de Moto)
-- Extende fall_incidents com dados dos sensores para auditoria forense

-- 1. Colunas de sensores (acelerômetro e giroscópio)
ALTER TABLE fall_incidents ADD COLUMN IF NOT EXISTS
    free_fall_gravity    DECIMAL(5,3);  -- gravidade medida na queda livre (m/s²), ex: 0.5

ALTER TABLE fall_incidents ADD COLUMN IF NOT EXISTS
    impact_gravity      DECIMAL(6,3);  -- pico de G no impacto (m/s²), ex: 35.2 (= 3.5g)

ALTER TABLE fall_incidents ADD COLUMN IF NOT EXISTS
    gyro_rotation_x     DECIMAL(8,3);  -- velocidade angular X no impacto (rad/s)

ALTER TABLE fall_incidents ADD COLUMN IF NOT EXISTS
    gyro_rotation_y     DECIMAL(8,3);  -- velocidade angular Y no impacto (rad/s)

ALTER TABLE fall_incidents ADD COLUMN IF NOT EXISTS
    gyro_rotation_z     DECIMAL(8,3);  -- velocidade angular Z no impacto (rad/s)

ALTER TABLE fall_incidents ADD COLUMN IF NOT EXISTS
    gyro_rotation_total  DECIMAL(8,3);  -- magnitude total da rotação (rad/s)

-- 2. Velocidade GPS no momento do acidente (km/h)
ALTER TABLE fall_incidents ADD COLUMN IF NOT EXISTS
    gps_speed_kmh       DECIMAL(6,2);

-- 3. Precisão GPS no momento do acidente (metros)
ALTER TABLE fall_incidents ADD COLUMN IF NOT EXISTS
    gps_accuracy_m      DECIMAL(7,2);

-- 4. Detecção: flags das fases completadas
ALTER TABLE fall_incidents ADD COLUMN IF NOT EXISTS
    phase_free_fall     BOOLEAN DEFAULT FALSE;  -- fase 1 detectada
ALTER TABLE fall_incidents ADD COLUMN IF NOT EXISTS
    phase_impact        BOOLEAN DEFAULT FALSE;  -- fase 2 detectada
ALTER TABLE fall_incidents ADD COLUMN IF NOT EXISTS
    phase_rotation      BOOLEAN DEFAULT FALSE;  -- fase 3 detectada
ALTER TABLE fall_incidents ADD COLUMN IF NOT EXISTS
    phase_immobility    BOOLEAN DEFAULT FALSE;  -- fase 4 detectada

-- 5. Validação: velocidade GPS indica acidente real vs buraco na rua
--    TRUE = velocidade era > 0 antes do impacto, caiu para ~0 → provável acidente
--    FALSE = velocidade permaneceu constante → provavelmente buraco/valeta
ALTER TABLE fall_incidents ADD COLUMN IF NOT EXISTS
    speed_drop_confirmed BOOLEAN DEFAULT FALSE;

-- 6. Timings das fases (timestamps em ms relativos ao impacto)
ALTER TABLE fall_incidents ADD COLUMN IF NOT EXISTS
    free_fall_duration_ms  INTEGER;  -- duração da queda livre em ms
ALTER TABLE fall_incidents ADD COLUMN IF NOT EXISTS
    impact_latency_ms     INTEGER;  -- tempo entre free-fall e impacto em ms

-- 7. Status do alerta: foi cancelado pelo usuário (estava bem)?
--    user_cancelled = TRUE → cancelado pelo agente (F5 no app)
--    NOT NULL → horário em que cancelou
ALTER TABLE fall_incidents ADD COLUMN IF NOT EXISTS
    user_cancelled       BOOLEAN DEFAULT FALSE;
ALTER TABLE fall_incidents ADD COLUMN IF NOT EXISTS
    user_cancelled_at     TIMESTAMP;

-- 8. Info do dispositivo no momento do acidente
ALTER TABLE fall_incidents ADD COLUMN IF NOT EXISTS
    device_model         VARCHAR(200);
ALTER TABLE fall_incidents ADD COLUMN IF NOT EXISTS
    os_version           VARCHAR(20);
ALTER TABLE fall_incidents ADD COLUMN IF NOT EXISTS
    battery_level        INTEGER;      -- 0-100
ALTER TABLE fall_incidents ADD COLUMN IF NOT EXISTS
    is_charging          BOOLEAN;
ALTER TABLE fall_incidents ADD COLUMN IF NOT EXISTS
    network_type         VARCHAR(20); -- wifi, 4g, 3g, 2g, etc

-- 9. JSONB para dados crus dos sensores (armazenamento completo forense)
ALTER TABLE fall_incidents ADD COLUMN IF NOT EXISTS
    sensor_raw           JSONB;

-- 10. Índice para consultas frequentes
CREATE INDEX IF NOT EXISTS idx_fall_incidents_status
    ON fall_incidents(status);
CREATE INDEX IF NOT EXISTS idx_fall_incidents_recorded
    ON fall_incidents(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_fall_incidents_speed_drop
    ON fall_incidents(speed_drop_confirmed) WHERE speed_drop_confirmed = TRUE;
