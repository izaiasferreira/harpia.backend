-- Migration 062: Service Annotations (Anotações de Serviço)
-- Tabela principal para anotações de serviço criadas pelos agentes

CREATE TABLE IF NOT EXISTS service_annotations (
    id SERIAL PRIMARY KEY,
    autor VARCHAR(50) NOT NULL REFERENCES login(id) ON DELETE CASCADE,
    tipo VARCHAR(50) NOT NULL,               -- 'Remanejamento' | 'Anotação' | 'Coordenada'
    identificacao_tipo VARCHAR(50),          -- 'Medidor' | 'Instalação' | 'Unidade Consumidora'
    identificacao_valor VARCHAR(100),         -- Valor correspondente ao identificador
    descricao TEXT NOT NULL,                 -- Descrição da anotação
    latitude DECIMAL(10,7),
    longitude DECIMAL(10,7),
    foto TEXT,                               -- Foto do anexo (MinIO URL ou base64)
    estado VARCHAR(2) DEFAULT 'pi',
    seccional VARCHAR(100),
    regional VARCHAR(100),
    resolvido BOOLEAN DEFAULT FALSE,
    resolvido_por VARCHAR(50),
    resolvido_por_nome TEXT,
    resolvido_em TIMESTAMP,
    descricao_solucao TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de evidências da solução da anotação
CREATE TABLE IF NOT EXISTS service_annotation_evidencias (
    id SERIAL PRIMARY KEY,
    annotation_id INTEGER NOT NULL REFERENCES service_annotations(id) ON DELETE CASCADE,
    nome_arquivo TEXT NOT NULL,
    tipo VARCHAR(50) NOT NULL DEFAULT 'imagem',
    caminho TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_annotations_autor ON service_annotations(autor);
CREATE INDEX IF NOT EXISTS idx_service_annotations_status ON service_annotations(resolvido);
CREATE INDEX IF NOT EXISTS idx_service_annotations_estado ON service_annotations(estado);
CREATE INDEX IF NOT EXISTS idx_service_annotations_seccional ON service_annotations(seccional);
CREATE INDEX IF NOT EXISTS idx_service_annotations_regional ON service_annotations(regional);
CREATE INDEX IF NOT EXISTS idx_service_annotation_evidencias ON service_annotation_evidencias(annotation_id);
