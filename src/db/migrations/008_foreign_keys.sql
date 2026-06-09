-- Foreign Keys — NOT VALID para não escanear dados existentes
-- Cada constraint é independente com fallback silencioso

DO $$ BEGIN
    ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_agente_fkey;
    ALTER TABLE inventory ADD CONSTRAINT inventory_agente_fkey
        FOREIGN KEY (agente) REFERENCES login(id) ON DELETE SET NULL NOT VALID;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'SKIP inventory_agente_fkey: %', SQLERRM; END $$;

DO $$ BEGIN
    ALTER TABLE justificativas DROP CONSTRAINT IF EXISTS justificativas_author_fkey;
    ALTER TABLE justificativas ADD CONSTRAINT justificativas_author_fkey
        FOREIGN KEY (author) REFERENCES login(id) ON DELETE SET NULL NOT VALID;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'SKIP justificativas_author_fkey: %', SQLERRM; END $$;

DO $$ BEGIN
    ALTER TABLE daily_report DROP CONSTRAINT IF EXISTS daily_report_autor_fkey;
    ALTER TABLE daily_report ADD CONSTRAINT daily_report_autor_fkey
        FOREIGN KEY (autor) REFERENCES login(id) ON DELETE SET NULL NOT VALID;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'SKIP daily_report_autor_fkey: %', SQLERRM; END $$;

DO $$ BEGIN
    ALTER TABLE service_notes DROP CONSTRAINT IF EXISTS service_notes_completed_by_fkey;
    ALTER TABLE service_notes ADD CONSTRAINT service_notes_completed_by_fkey
        FOREIGN KEY (completed_by) REFERENCES login(id) ON DELETE SET NULL NOT VALID;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'SKIP service_notes_completed_by_fkey: %', SQLERRM; END $$;