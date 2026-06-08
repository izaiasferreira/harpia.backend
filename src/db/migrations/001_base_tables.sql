-- Base Tables Migration

CREATE TABLE IF NOT EXISTS login (
    id VARCHAR(50) PRIMARY KEY,
    estado VARCHAR(2) NOT NULL,
    telegram_id VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS profiles (
    id VARCHAR(50) PRIMARY KEY REFERENCES login(id) ON DELETE CASCADE,
    "profilePicUrl" VARCHAR(255),
    badges JSONB DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS badges (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    image_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL,
    nome TEXT NOT NULL,
    role TEXT DEFAULT 'USER' CHECK (role IN ('COMPANY_ADMIN', 'USER')),
    estado TEXT DEFAULT 'pi',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    ultimo_login TIMESTAMP,
    ativo BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS branches (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    state TEXT DEFAULT 'pi',
    parent_id INTEGER,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_branches (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    branch_id INTEGER REFERENCES branches(id) ON DELETE CASCADE,
    state TEXT DEFAULT 'pi',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, branch_id, state)
);

CREATE TABLE IF NOT EXISTS permissions (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    modules TEXT[],
    filters JSONB DEFAULT '[]',
    user_count INTEGER DEFAULT 0,
    state TEXT DEFAULT 'pi',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    ativo BOOLEAN DEFAULT true,
    UNIQUE(slug, state)
);

CREATE TABLE IF NOT EXISTS user_permissions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
    state TEXT DEFAULT 'pi',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, permission_id, state)
);

CREATE TABLE IF NOT EXISTS app_pins (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(50) NOT NULL REFERENCES login(id) ON DELETE CASCADE,
    pin VARCHAR(6) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    used_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fcm_tokens (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(50) NOT NULL REFERENCES login(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    device_info TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(agent_id, token)
);

CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(50) NOT NULL REFERENCES login(id) ON DELETE CASCADE,
    sender TEXT NOT NULL,
    title TEXT,
    body TEXT NOT NULL,
    type TEXT DEFAULT 'success',
    method TEXT[] DEFAULT '{push}',
    read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sent_messages_admin (
    id SERIAL PRIMARY KEY,
    agente_id VARCHAR(50) REFERENCES login(id) ON DELETE SET NULL,
    operador_id TEXT,
    texto TEXT,
    arquivo TEXT,
    sucesso BOOLEAN,
    resposta JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS message_templates_admin (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    text TEXT,
    file TEXT,
    web_app_button_text TEXT,
    web_app_button_url TEXT,
    creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabelas de agente (antes inline em database functions — centralizadas aqui)
CREATE TABLE IF NOT EXISTS inventory (
    id SERIAL PRIMARY KEY,
    agente VARCHAR(50) NOT NULL,
    pda_imei_1 VARCHAR(100),
    pda_imei_2 VARCHAR(100),
    pda_numero_serie VARCHAR(100),
    pda_marca VARCHAR(100),
    pda_modelo VARCHAR(100),
    pda_numero_chip VARCHAR(100),
    pda_versao_android VARCHAR(50),
    pda_versao_bluetooth VARCHAR(50),
    impressora_numero_serie VARCHAR(100),
    impressora_modelo VARCHAR(100),
    impressora_marca VARCHAR(100),
    maquininha_numero_serie VARCHAR(100),
    maquininha_numero_logico VARCHAR(100),
    estado VARCHAR(2) DEFAULT 'pi',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS justificativas (
    id SERIAL PRIMARY KEY,
    instalacao VARCHAR(50) NOT NULL,
    tipo VARCHAR(100),
    motivo TEXT,
    justificativa TEXT,
    foto TEXT,
    data_leit_prev VARCHAR(30),
    author VARCHAR(50) NOT NULL,
    estado VARCHAR(2) NOT NULL DEFAULT 'pi',
    quantidade INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS justify_pending (
    id SERIAL PRIMARY KEY,
    autor VARCHAR(50) NOT NULL,
    quantidade INTEGER NOT NULL,
    tipo VARCHAR(100),
    unidade_leitura VARCHAR(50),
    instalacao JSONB DEFAULT '[]',
    foto TEXT,
    estado VARCHAR(2) NOT NULL DEFAULT 'pi',
    status VARCHAR(20) DEFAULT 'pendente',
    motivo TEXT,
    observacao TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_report (
    id SERIAL PRIMARY KEY,
    autor VARCHAR(50) NOT NULL,
    nota INTEGER NOT NULL CHECK (nota >= 1 AND nota <= 5),
    motivo TEXT,
    observacao TEXT,
    foto TEXT,
    estado VARCHAR(2) NOT NULL DEFAULT 'pi',
    data_report VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
