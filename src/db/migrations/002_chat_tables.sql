-- Chat Tables Migration

CREATE TABLE IF NOT EXISTS chat_rooms (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(50) NOT NULL REFERENCES login(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Suporte Técnico',
    type TEXT DEFAULT 'suporte',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    room_id INTEGER NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
    sender_id VARCHAR(50) NOT NULL,
    sender_type VARCHAR(10) CHECK (sender_type IN ('agent', 'admin')),
    sender_name VARCHAR(100) NOT NULL,
    message TEXT,
    message_type VARCHAR(20) DEFAULT 'text',
    file_url TEXT,
    file_name TEXT,
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),
    read BOOLEAN DEFAULT FALSE,
    channel VARCHAR(20) DEFAULT 'internal',
    metadata JSONB DEFAULT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
