-- Tracking Tables Migration

CREATE TABLE IF NOT EXISTS tracking_points (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(50) NOT NULL REFERENCES login(id) ON DELETE CASCADE,
    latitude DECIMAL(10,7) NOT NULL,
    longitude DECIMAL(10,7) NOT NULL,
    speed DECIMAL(6,2),
    accuracy DECIMAL(6,2),
    battery_level DECIMAL(4,2),
    network_type VARCHAR(20),
    device_model VARCHAR(100),
    device_platform VARCHAR(20),
    os_version VARCHAR(20),
    recorded_at TIMESTAMP NOT NULL,
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS speed_violations (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(50) NOT NULL REFERENCES login(id) ON DELETE CASCADE,
    latitude DECIMAL(10,7) NOT NULL,
    longitude DECIMAL(10,7) NOT NULL,
    speed DECIMAL(6,2) NOT NULL,
    speed_limit DECIMAL(6,2) DEFAULT 50,
    recorded_at TIMESTAMP NOT NULL,
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fall_incidents (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(50) NOT NULL REFERENCES login(id) ON DELETE CASCADE,
    latitude DECIMAL(10,7),
    longitude DECIMAL(10,7),
    status VARCHAR(20) DEFAULT 'pending',
    recorded_at TIMESTAMP NOT NULL,
    confirmed_at TIMESTAMP,
    notes TEXT,
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_alerts_log (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(50) NOT NULL REFERENCES login(id) ON DELETE CASCADE,
    alert_type VARCHAR(30) NOT NULL,
    latitude DECIMAL(10,7),
    longitude DECIMAL(10,7),
    details JSONB,
    recorded_at TIMESTAMP NOT NULL,
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Migration: add device info columns to existing tracking_points tables
ALTER TABLE tracking_points ADD COLUMN IF NOT EXISTS battery_level DECIMAL(4,2);
ALTER TABLE tracking_points ADD COLUMN IF NOT EXISTS network_type VARCHAR(20);
ALTER TABLE tracking_points ADD COLUMN IF NOT EXISTS device_model VARCHAR(100);
ALTER TABLE tracking_points ADD COLUMN IF NOT EXISTS device_platform VARCHAR(20);
ALTER TABLE tracking_points ADD COLUMN IF NOT EXISTS os_version VARCHAR(20);
