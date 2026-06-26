-- Fix NOT NULL constraints for tables with ON DELETE SET NULL foreign keys
ALTER TABLE inventory ALTER COLUMN agente DROP NOT NULL;
ALTER TABLE justificativas ALTER COLUMN author DROP NOT NULL;
ALTER TABLE daily_report ALTER COLUMN autor DROP NOT NULL;
ALTER TABLE justify_pending ALTER COLUMN autor DROP NOT NULL;
