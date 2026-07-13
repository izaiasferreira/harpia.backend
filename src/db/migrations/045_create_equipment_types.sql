CREATE TABLE IF NOT EXISTS equipment_types (
    slug VARCHAR(50) PRIMARY KEY,
    label VARCHAR(100) NOT NULL,
    identificador VARCHAR(50),
    campos JSONB NOT NULL DEFAULT '[]'::jsonb
);
