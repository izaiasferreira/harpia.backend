-- Checklists Core Indexes Migration
-- Tier 1: Critical — accelerates every checklist query

-- C1: JOIN with checklist_templates (getChecklistById, listChecklistsAdmin, etc.)
CREATE INDEX IF NOT EXISTS idx_checklists_template_id
    ON checklists(template_id);

-- C2: Agent-specific lookups (getAgentTodayChecklist, getAgentTemplatesStatus)
CREATE INDEX IF NOT EXISTS idx_checklists_agent_id
    ON checklists(agent_id);

-- C3: Status filtering (dashboard queries: WHERE status = 'submitted')
CREATE INDEX IF NOT EXISTS idx_checklists_status
    ON checklists(status);

-- C4: Date range filtering (listChecklistsAdmin, dashboard stats)
CREATE INDEX IF NOT EXISTS idx_checklists_date
    ON checklists(date);

-- C5: Supplementary sub-queries (WHERE parent_checklist_id = $1 AND type = 'supplementary')
CREATE INDEX IF NOT EXISTS idx_checklists_parent
    ON checklists(parent_checklist_id);

-- C6: Agent template listing (listTemplatesForAgent: WHERE is_active = true AND estado = $1)
CREATE INDEX IF NOT EXISTS idx_checklist_templates_active_estado
    ON checklist_templates(is_active, estado);

-- C7: Admin template listing filter
CREATE INDEX IF NOT EXISTS idx_checklist_templates_active
    ON checklist_templates(is_active);
