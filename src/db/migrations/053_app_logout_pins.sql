CREATE TABLE IF NOT EXISTS app_logout_pins (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(50) NOT NULL REFERENCES login(id) ON DELETE CASCADE,
    pin VARCHAR(6) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    used_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_app_logout_pins_agent_pin
    ON app_logout_pins(agent_id, pin);
