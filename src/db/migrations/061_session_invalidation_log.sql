CREATE TABLE IF NOT EXISTS session_invalidation_log (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(50) NOT NULL,
    invalidated_by_id VARCHAR(50),
    invalidated_by_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_session_invalidation_log_agent
    ON session_invalidation_log(agent_id, created_at DESC);
