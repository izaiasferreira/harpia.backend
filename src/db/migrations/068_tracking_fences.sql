-- Migration 068: Tracking Fences (Geofences)
CREATE TABLE IF NOT EXISTS tracking_fences (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,
    estado VARCHAR(2) NOT NULL,
    geometry JSONB NOT NULL,
    speed_limit INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tracking_fences_estado ON tracking_fences(estado);
CREATE INDEX IF NOT EXISTS idx_tracking_fences_is_active ON tracking_fences(is_active);
