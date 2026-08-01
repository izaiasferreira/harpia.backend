ALTER TABLE agent_heartbeats ADD COLUMN IF NOT EXISTS android_version VARCHAR(20);
ALTER TABLE agent_heartbeats ADD COLUMN IF NOT EXISTS device_model VARCHAR(100);
ALTER TABLE agent_heartbeats ADD COLUMN IF NOT EXISTS metadata JSONB;
