-- Forms and Training Tables Migration

CREATE TABLE IF NOT EXISTS forms (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    cover_url TEXT,
    is_active BOOLEAN DEFAULT false,
    badge_id INTEGER REFERENCES badges(id) ON DELETE SET NULL,
    settings JSONB DEFAULT '{}',
    structure JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS form_responses (
    id SERIAL PRIMARY KEY,
    form_id INTEGER REFERENCES forms(id) ON DELETE CASCADE,
    answers JSONB NOT NULL DEFAULT '{}',
    submitted_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS form_chat_messages (
    id SERIAL PRIMARY KEY,
    form_id INTEGER REFERENCES forms(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    attachments JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS training_projects (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    badge_id INTEGER REFERENCES badges(id) ON DELETE SET NULL,
    flow_data JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS training_chat_messages (
    id SERIAL PRIMARY KEY,
    training_id INTEGER REFERENCES training_projects(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ceneduc_cards (
    id SERIAL PRIMARY KEY,
    card_type VARCHAR(20) NOT NULL CHECK (card_type IN ('cover', 'train_item')),
    section VARCHAR(20) CHECK (section IN ('slider', 'banner')),
    group_title VARCHAR(255),
    state VARCHAR(2),
    sort_order INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT true,
    badge_id INTEGER REFERENCES badges(id) ON DELETE SET NULL,
    data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_training_completions (
    id SERIAL PRIMARY KEY,
    training_id INTEGER NOT NULL REFERENCES training_projects(id) ON DELETE CASCADE,
    agent_id VARCHAR(50) NOT NULL REFERENCES login(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(training_id, agent_id)
);

CREATE TABLE IF NOT EXISTS security_report (
    id SERIAL PRIMARY KEY,
    autor VARCHAR(50) NOT NULL REFERENCES login(id) ON DELETE CASCADE,
    motivo TEXT NOT NULL,
    observacao TEXT,
    latitude TEXT,
    longitude TEXT,
    estado TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS security_check (
    id SERIAL PRIMARY KEY,
    autor VARCHAR(50) NOT NULL REFERENCES login(id) ON DELETE CASCADE,
    latitude TEXT,
    longitude TEXT,
    estado TEXT DEFAULT 'pi',
    data_check DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
