-- 046: Add is_deleted to checklist_templates for soft-delete support
-- This column is referenced in checklists.js listTemplatesAdmin() and deleteTemplate()
-- but was never formally added via migration.

ALTER TABLE checklist_templates
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;

-- Ensure existing rows have a value
UPDATE checklist_templates
  SET is_deleted = false
  WHERE is_deleted IS NULL;

-- Index to speed up the common query: WHERE is_deleted = false
CREATE INDEX IF NOT EXISTS idx_checklist_templates_not_deleted
  ON checklist_templates (is_deleted)
  WHERE is_deleted = false;
