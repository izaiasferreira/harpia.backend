-- Accidents (Acidentes) — migration 024
-- Registros de acidentes reportados pelo agente via FAB longo-press
-- Semelhante a security_report + security_report_evidencias

-- Tabela principal de acidentes
CREATE TABLE IF NOT EXISTS accidents (
    id SERIAL PRIMARY KEY,
    autor VARCHAR(50) NOT NULL REFERENCES login(id) ON DELETE CASCADE,
    tipo VARCHAR(100) NOT NULL,               -- ex: 'Acidente de moto', 'Mordida de animal'
    descricao TEXT,                            -- descrição livre do agente
    latitude DECIMAL(10,7),
    longitude DECIMAL(10,7),
    estado VARCHAR(2) DEFAULT 'pi',
    resolvido BOOLEAN DEFAULT FALSE,
    resolvido_por VARCHAR(50),
    resolvido_por_nome TEXT,
    resolvido_em TIMESTAMP,
    descricao_solucao TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de evidências (fotos da resolução)
CREATE TABLE IF NOT EXISTS accident_evidencias (
    id SERIAL PRIMARY KEY,
    accident_id INTEGER NOT NULL REFERENCES accidents(id) ON DELETE CASCADE,
    nome_arquivo TEXT NOT NULL,
    tipo VARCHAR(50) NOT NULL,               -- 'imagem'
    caminho TEXT NOT NULL,                    -- URL no MinIO
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accidents_autor ON accidents(autor);
CREATE INDEX IF NOT EXISTS idx_accidents_status ON accidents(resolvido);
CREATE INDEX IF NOT EXISTS idx_accidents_evidencias ON accident_evidencias(accident_id);
