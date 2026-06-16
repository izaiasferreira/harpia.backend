-- Checklist Template Chat Messages Table
CREATE TABLE IF NOT EXISTS checklist_template_chat_messages (
    id SERIAL PRIMARY KEY,
    template_id UUID NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
    role VARCHAR(15) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    attachments JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);
