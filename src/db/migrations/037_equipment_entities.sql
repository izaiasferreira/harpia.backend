-- Migration 037: Equipment Entities (Consolidado)
-- Dados específicos por tipo ficam em JSONB `dados` — novos tipos não precisam de ALTER TABLE

-- ─── Tabela principal de equipamentos ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS equipment (
    id       SERIAL PRIMARY KEY,
    tipo     TEXT NOT NULL,       -- 'pda', 'impressora', 'maquineta', + futuros

    -- Estado geográfico do equipamento (não do agente)
    estado   TEXT NOT NULL DEFAULT 'pi',
    regional TEXT,
    seccional TEXT,

    -- Dados específicos do tipo armazenados como JSONB
    -- PDA:        { imei_1, imei_2, numero_serie, marca, modelo, numero_chip, versao_android }
    -- Impressora: { numero_serie, marca, modelo }
    -- Maquineta:  { numero_serie, numero_logico }
    -- Futuros:    qualquer estrutura, sem ALTER TABLE
    dados    JSONB NOT NULL DEFAULT '{}',

    -- Status operacional
    status   TEXT NOT NULL DEFAULT 'disponivel'
             CHECK (status IN ('disponivel', 'em_uso', 'manutencao', 'inativo')),

    -- Estado de conservação
    condicao TEXT NOT NULL DEFAULT 'bom'
             CHECK (condicao IN ('otimo', 'bom', 'regular', 'ruim', 'danificado')),

    -- Fotos do equipamento (array de URLs MinIO)
    fotos    JSONB NOT NULL DEFAULT '[]',

    -- Auditoria
    criado_por TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Histórico de posse (quem tem / teve o equipamento) ───────────────────────
CREATE TABLE IF NOT EXISTS equipment_assignments (
    id              SERIAL PRIMARY KEY,
    equipment_id    INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    agente          TEXT NOT NULL,

    -- Quem fez a associação (admin ou sistema)
    assignado_por       TEXT,
    assignado_por_nome  TEXT,
    data_associacao     TIMESTAMPTZ DEFAULT NOW(),

    -- Prova de associação (opcional para integrações antigas, obrigatória em novos fluxos)
    foto_comprovacao        TEXT,
    latitude_comprovacao    NUMERIC(10, 7),
    longitude_comprovacao   NUMERIC(10, 7),

    -- Quem e quando desassociou
    data_desassociacao    TIMESTAMPTZ,
    desassociado_por      TEXT,
    desassociado_por_nome TEXT,

    -- Status: ativa = posse atual | encerrada = histórico
    status TEXT NOT NULL DEFAULT 'ativa'
           CHECK (status IN ('ativa', 'encerrada')),

    observacao  TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Solicitações de agentes (entidade separada com prova fotográfica) ─────────
CREATE TABLE IF NOT EXISTS equipment_requests (
    id              SERIAL PRIMARY KEY,
    equipment_id    INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    agente          TEXT NOT NULL,
    tipo_solicitacao TEXT NOT NULL DEFAULT 'associacao'
                     CHECK (tipo_solicitacao IN ('associacao', 'devolucao')),

    -- Prova obrigatória: foto (URL MinIO) + localização GPS
    foto_url        TEXT NOT NULL,
    latitude        NUMERIC(10, 7),
    longitude       NUMERIC(10, 7),

    -- Status do fluxo de aprovação
    status TEXT NOT NULL DEFAULT 'pendente'
           CHECK (status IN ('pendente', 'aprovado', 'rejeitado')),

    -- Observação do agente ao fazer a solicitação
    observacao_agente TEXT,

    -- Processamento pelo admin
    processado_por       TEXT,
    processado_por_nome  TEXT,
    data_processamento   TIMESTAMPTZ,
    observacao_admin     TEXT,

    -- Referência ao assignment criado após aprovação (null enquanto pendente)
    assignment_id   INTEGER REFERENCES equipment_assignments(id),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Eventos / Histórico Tracker ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS equipment_events (
    id            SERIAL PRIMARY KEY,
    equipment_id  INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    
    -- Tipo do evento
    event_type    TEXT NOT NULL 
                  CHECK (event_type IN (
                      'criacao',
                      'edicao',
                      'solicitacao_associacao',
                      'solicitacao_devolucao',
                      'associacao_aprovada',
                      'associacao_rejeitada',
                      'devolucao_aprovada',
                      'devolucao_rejeitada',
                      'associacao_direta',
                      'desassociacao_direta'
                  )),
                  
    -- Agente envolvido no evento (ex: o agente que solicitou ou foi associado)
    agente        TEXT,
    
    -- Quem realizou a ação (Admin ID ou "sistema")
    actor_id      TEXT,
    actor_nome    TEXT,
    
    -- Alterações (usado em 'edicao') ou metadados extras (fotos, obs)
    changes       JSONB,
    metadata      JSONB,
    
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Índices ───────────────────────────────────────────────────────────────────

-- Garante apenas uma associação ativa por equipamento
CREATE UNIQUE INDEX IF NOT EXISTS uq_equipment_active_assignment
    ON equipment_assignments (equipment_id)
    WHERE status = 'ativa';

-- Garante apenas UMA solicitação pendente por agente/equipamento/tipo
CREATE UNIQUE INDEX IF NOT EXISTS uq_equipment_requests_pendente
    ON equipment_requests (equipment_id, agente, tipo_solicitacao)
    WHERE status = 'pendente';

-- Índices GIN para buscas dentro do JSONB (IMEI, número de série, etc.)
CREATE INDEX IF NOT EXISTS idx_equipment_dados   ON equipment USING gin (dados);
CREATE INDEX IF NOT EXISTS idx_equipment_estado  ON equipment (estado);
CREATE INDEX IF NOT EXISTS idx_equipment_tipo    ON equipment (tipo);
CREATE INDEX IF NOT EXISTS idx_equipment_status  ON equipment (status);

CREATE INDEX IF NOT EXISTS idx_assignments_agente     ON equipment_assignments (agente);
CREATE INDEX IF NOT EXISTS idx_assignments_equipment  ON equipment_assignments (equipment_id);
CREATE INDEX IF NOT EXISTS idx_assignments_status     ON equipment_assignments (status);

CREATE INDEX IF NOT EXISTS idx_requests_agente     ON equipment_requests (agente);
CREATE INDEX IF NOT EXISTS idx_requests_equipment  ON equipment_requests (equipment_id);
CREATE INDEX IF NOT EXISTS idx_requests_status     ON equipment_requests (status);

CREATE INDEX IF NOT EXISTS idx_events_equipment    ON equipment_events (equipment_id);
CREATE INDEX IF NOT EXISTS idx_events_agente       ON equipment_events (agente);
