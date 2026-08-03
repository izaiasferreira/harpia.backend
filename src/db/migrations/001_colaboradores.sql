-- Colaboradores Migration
-- Tabela externa de colaboradores (fonte: sistema legado).
-- Em bancos novos ela não existia, o que quebrava a migração 022 (ALTER TABLE colaboradores).
-- Em produção a tabela já existe e é populada por scripts externos (scripts/migrate_colaboradores.js) — este CREATE é no-op.
CREATE TABLE IF NOT EXISTS colaboradores (
    "ID" TEXT PRIMARY KEY,
    "MAT" TEXT,
    "Nome" TEXT,
    "Cargo" TEXT,
    "GESTOR IMEDIATO" TEXT,
    seccional TEXT,
    regional TEXT,
    estado VARCHAR(2) DEFAULT 'pi',
    status BOOLEAN DEFAULT true,
    situacao VARCHAR(20) DEFAULT 'active',
    processo VARCHAR(50)
);
