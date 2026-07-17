CREATE TABLE IF NOT EXISTS checklist_nonconformity_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR NOT NULL,
  question_label TEXT NOT NULL,
  resolved_date DATE NOT NULL,
  resolved_by INTEGER REFERENCES users(id),
  resolved_at TIMESTAMP DEFAULT NOW(),
  photo_url TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_resolutions_unique_streak
  ON checklist_nonconformity_resolutions(agent_id, question_label, resolved_date);

CREATE INDEX IF NOT EXISTS idx_resolutions_agent_question
  ON checklist_nonconformity_resolutions(agent_id, question_label);
