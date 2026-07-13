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

