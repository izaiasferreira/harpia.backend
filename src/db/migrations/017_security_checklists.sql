-- Security Checklists Migration
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS checklist_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES checklist_templates(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  order_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS checklist_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID REFERENCES checklist_sections(id) ON DELETE CASCADE,
  template_id UUID REFERENCES checklist_templates(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  required BOOLEAN DEFAULT true,
  requires_photo BOOLEAN DEFAULT false,
  severity VARCHAR(20) CHECK (severity IN ('critical', 'alert', 'normal')) DEFAULT 'normal',
  exemption_days INTEGER DEFAULT 0,
  order_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES checklist_templates(id) ON DELETE SET NULL,
  agent_id VARCHAR(50) REFERENCES login(id) ON DELETE CASCADE,
  type VARCHAR(20) CHECK (type IN ('official', 'supplementary')) DEFAULT 'official',
  parent_checklist_id UUID REFERENCES checklists(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  status VARCHAR(20) CHECK (status IN ('draft', 'submitted')) DEFAULT 'draft',
  signature_url TEXT,
  selfie_url TEXT,
  submitted_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ,
  local_id VARCHAR(100),
  pdf_url TEXT,
  regional_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
  sectional_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  coordinates VARCHAR(100),
  has_critical_non_compliant BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partial unique index to guarantee 1 official checklist per agent per day
CREATE UNIQUE INDEX IF NOT EXISTS unique_official_checklist_per_day
  ON checklists(agent_id, date)
  WHERE type = 'official';

CREATE TABLE IF NOT EXISTS checklist_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID REFERENCES checklists(id) ON DELETE CASCADE,
  question_id UUID REFERENCES checklist_questions(id) ON DELETE SET NULL,
  is_compliant BOOLEAN,
  is_exempt BOOLEAN DEFAULT false,
  exempt_until DATE,
  photo_url TEXT,
  local_photo_path TEXT,
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS checklist_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID REFERENCES checklists(id) ON DELETE CASCADE,
  answer_id UUID REFERENCES checklist_answers(id) ON DELETE CASCADE,
  media_type VARCHAR(30) CHECK (media_type IN ('answer_photo', 'selfie', 'signature')),
  url TEXT NOT NULL,
  local_path TEXT,
  timestamp_overlay TIMESTAMPTZ,
  uploaded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
