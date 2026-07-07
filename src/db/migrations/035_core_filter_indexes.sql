-- Core Filter Indexes Migration
-- Tier 2: High — accelerates permission filters, dashboard queries, admin listing

-- C10: Login state filtering (getUsersOnlyLoginPaginated, getAgentsHeartbeat, etc.)
CREATE INDEX IF NOT EXISTS idx_login_estado
    ON login(estado);

-- C11-C16: Colaboradores — universal permission/dashboard filters
CREATE INDEX IF NOT EXISTS idx_colaboradores_estado
    ON colaboradores(estado);

CREATE INDEX IF NOT EXISTS idx_colaboradores_regional
    ON colaboradores(regional);

CREATE INDEX IF NOT EXISTS idx_colaboradores_seccional
    ON colaboradores(seccional);

CREATE INDEX IF NOT EXISTS idx_colaboradores_gestor
    ON colaboradores("GESTOR IMEDIATO");

CREATE INDEX IF NOT EXISTS idx_colaboradores_situacao
    ON colaboradores(situacao);

CREATE INDEX IF NOT EXISTS idx_colaboradores_cargo
    ON colaboradores("Cargo");

-- C17-C19: Security report — admin filters and ORDER BY
CREATE INDEX IF NOT EXISTS idx_security_report_autor
    ON security_report(autor);

CREATE INDEX IF NOT EXISTS idx_security_report_created_at
    ON security_report(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_report_estado
    ON security_report(estado);

-- C20-C21: Accidents — admin filters and ORDER BY
CREATE INDEX IF NOT EXISTS idx_accidents_estado
    ON accidents(estado);

CREATE INDEX IF NOT EXISTS idx_accidents_created_at
    ON accidents(created_at DESC);

-- C22: App pins — agent PIN validation
CREATE INDEX IF NOT EXISTS idx_app_pins_agent_pin
    ON app_pins(agent_id, pin);
