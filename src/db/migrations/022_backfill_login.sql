-- Backfill the login table for any existing agents in the colaboradores table
INSERT INTO login (id, estado)
SELECT "ID", estado
FROM colaboradores
ON CONFLICT (id) DO UPDATE SET estado = EXCLUDED.estado;
