-- Foreign Keys — adiciona FKs como NOT VALID para evitar escanear dados existentes
-- Depois de limpar dados órfãos, valide com: ALTER TABLE ... VALIDATE;

-- inventory.agente → login(id)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'inventory_agente_fkey'
    ) THEN
        ALTER TABLE inventory
            ADD CONSTRAINT inventory_agente_fkey
            FOREIGN KEY (agente) REFERENCES login(id) ON DELETE SET NULL;
    END IF;
END $$;

-- justificativas.author → login(id)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'justificativas_author_fkey'
    ) THEN
        ALTER TABLE justificativas
            ADD CONSTRAINT justificativas_author_fkey
            FOREIGN KEY (author) REFERENCES login(id) ON DELETE SET NULL;
    END IF;
END $$;

-- daily_report.autor → login(id)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'daily_report_autor_fkey'
    ) THEN
        ALTER TABLE daily_report
            ADD CONSTRAINT daily_report_autor_fkey
            FOREIGN KEY (autor) REFERENCES login(id) ON DELETE SET NULL;
    END IF;
END $$;

-- completed_by fkey em service_notes
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'service_notes_completed_by_fkey'
    ) THEN
        ALTER TABLE service_notes
            ADD CONSTRAINT service_notes_completed_by_fkey
            FOREIGN KEY (completed_by) REFERENCES login(id) ON DELETE SET NULL;
    END IF;
END $$;