-- Centraliza checklists em JSONB: uma linha por template / uma linha por submissão

-- 1. Nova tabela de templates (seções + perguntas aninhadas em data JSONB)
CREATE TABLE IF NOT EXISTS checklist_templates_new (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    estado VARCHAR(2),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Nova tabela de submissões (respostas dentro de data JSONB, signature/selfie em colunas)
CREATE TABLE IF NOT EXISTS checklists_new (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id VARCHAR(50) NOT NULL REFERENCES login(id) ON DELETE CASCADE,
    template_id UUID REFERENCES checklist_templates_new(id) ON DELETE SET NULL,
    type VARCHAR(20) DEFAULT 'official' CHECK (type IN ('official', 'supplementary')),
    parent_checklist_id UUID REFERENCES checklists_new(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
    regional_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
    sectional_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
    signature_url TEXT,
    selfie_url TEXT,
    has_critical_non_compliant BOOLEAN DEFAULT false,
    local_id VARCHAR(100),
    submitted_at TIMESTAMPTZ,
    synced_at TIMESTAMPTZ,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_official_checklist_per_day
    ON checklists_new(agent_id, date) WHERE type = 'official';

-- 3. Chat messages — recria com FK para a nova tabela
DROP TABLE IF EXISTS checklist_template_chat_messages CASCADE;

CREATE TABLE IF NOT EXISTS checklist_template_chat_messages (
    id SERIAL PRIMARY KEY,
    template_id UUID NOT NULL REFERENCES checklist_templates_new(id) ON DELETE CASCADE,
    role VARCHAR(15) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    attachments JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 4. Remove tabelas antigas
DROP TABLE IF EXISTS checklist_media CASCADE;
DROP TABLE IF EXISTS checklist_answers CASCADE;
DROP TABLE IF EXISTS checklist_questions CASCADE;
DROP TABLE IF EXISTS checklist_sections CASCADE;
DROP TABLE IF EXISTS checklists CASCADE;
DROP TABLE IF EXISTS checklist_templates CASCADE;

-- 5. Renomeia novas tabelas para os nomes originais
ALTER TABLE IF EXISTS checklist_templates_new RENAME TO checklist_templates;
ALTER TABLE IF EXISTS checklists_new RENAME TO checklists;
