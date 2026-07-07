-- Secondary Indexes Migration
-- Tier 2: High (remaining) + Functional indexes for LOWER() queries

-- C24-C26: Service notes query patterns
CREATE INDEX IF NOT EXISTS idx_service_notes_group_archived
    ON service_notes(group_id, archived);

CREATE INDEX IF NOT EXISTS idx_service_notes_assigned_archived
    ON service_notes(assigned_to, archived);

CREATE INDEX IF NOT EXISTS idx_service_notes_created_at
    ON service_notes(created_at DESC);

-- C27: Service assignments FK indexes
CREATE INDEX IF NOT EXISTS idx_service_assignments_note
    ON service_assignments(service_note_id);

CREATE INDEX IF NOT EXISTS idx_service_assignments_agent
    ON service_assignments(agent_id);

-- C28: Agent alerts log time range queries
CREATE INDEX IF NOT EXISTS idx_agent_alerts_log_recorded
    ON agent_alerts_log(recorded_at DESC);

-- C29: Inventory LOWER() functional lookup
CREATE INDEX IF NOT EXISTS idx_inventory_lower_agente
    ON inventory(lower(agente));

-- C30: Justificativas autor lookup
CREATE INDEX IF NOT EXISTS idx_justificativas_autor
    ON justificativas(author);

-- C31: Daily report autor + data
CREATE INDEX IF NOT EXISTS idx_daily_report_autor_data
    ON daily_report(autor, created_at);

-- C32: Justify pending autor lookup
CREATE INDEX IF NOT EXISTS idx_justify_pending_autor
    ON justify_pending(autor);

-- C33: Telegram tokens agent lookup
CREATE INDEX IF NOT EXISTS idx_telegram_tokens_agent
    ON telegram_tokens(agent_id);

-- C34: Agent exemptions composite date-range overlap
CREATE INDEX IF NOT EXISTS idx_agent_exemptions_agent_dates
    ON agent_exemptions(agent_id, start_date, end_date);

-- C35: Checklists submitted_at ordering (listChecklistsAdmin, dashboard)
CREATE INDEX IF NOT EXISTS idx_checklists_submitted_at
    ON checklists(submitted_at DESC);

-- C36: Security report configs composite filter
CREATE INDEX IF NOT EXISTS idx_security_report_configs_estado_type
    ON security_report_configs(estado, config_type);

-- Functional indexes for LOWER() queries (used in various auth/lookup flows)
CREATE INDEX IF NOT EXISTS idx_login_lower_id
    ON login(lower(id));

CREATE INDEX IF NOT EXISTS idx_colaboradores_lower_id
    ON colaboradores(lower("ID"));
