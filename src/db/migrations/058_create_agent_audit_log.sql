-- Migration 058: Cria tabela de auditoria de alterações de status/situação de agentes
-- Registra quem alterou, de/para, e quando para cada campo independentemente.
-- Ajuda a montar uma linha do tempo do agente.

CREATE TABLE IF NOT EXISTS agente_audit_log (
    id SERIAL PRIMARY KEY,
    agente_id VARCHAR(50) NOT NULL,
    field VARCHAR(20) NOT NULL CHECK (field IN ('status', 'situacao')),
    from_value VARCHAR(20),
    to_value VARCHAR(20) NOT NULL,
    changed_by VARCHAR(100) NOT NULL,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agente_audit_log_agente
    ON agente_audit_log(agente_id, changed_at DESC);
