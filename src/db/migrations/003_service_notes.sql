-- Service Notes Tables Migration

CREATE TABLE IF NOT EXISTS service_groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    completion_config JSONB NOT NULL DEFAULT '{}',
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    allow_all_agents BOOLEAN DEFAULT TRUE,
    allowed_agents JSONB DEFAULT '[]',
    allow_agent_creation BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marker_categories (
    id SERIAL PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES service_groups(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(7) NOT NULL DEFAULT '#2563EB',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_notes (
    id SERIAL PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES service_groups(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    coordinates VARCHAR(100),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    address TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'CONCLUIDO')),
    assigned_to VARCHAR(50) REFERENCES login(id) ON DELETE SET NULL,
    completed_by VARCHAR(50) REFERENCES login(id) ON DELETE SET NULL,
    completed_at TIMESTAMP,
    completion_coordinates VARCHAR(100),
    completion_data JSONB,
    custom_fields JSONB,
    marker_category_id INTEGER REFERENCES marker_categories(id) ON DELETE SET NULL,
    self_registered BOOLEAN NOT NULL DEFAULT FALSE,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_assignments (
    id SERIAL PRIMARY KEY,
    service_note_id INTEGER NOT NULL REFERENCES service_notes(id) ON DELETE CASCADE,
    agent_id VARCHAR(50) NOT NULL REFERENCES login(id) ON DELETE CASCADE,
    assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_notes_chat_messages (
    id SERIAL PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES service_groups(id) ON DELETE CASCADE,
    role VARCHAR(15) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    tool_call_id TEXT,
    tool_calls JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);
