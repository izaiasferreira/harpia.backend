-- Tracking Fences: DDL canônico, constraints, bbox, trigger e índices.
-- A tabela já existe em produção; esta migration é idempotente e aditiva.

CREATE TABLE IF NOT EXISTS tracking_fences (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL,
    estado VARCHAR(2) NOT NULL,
    geometry JSONB NOT NULL,
    speed_limit INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

-- ── CHECK constraints (idempotentes) ─────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_tracking_fences_type') THEN
        ALTER TABLE tracking_fences
            ADD CONSTRAINT ck_tracking_fences_type
            CHECK (type IN ('speed', 'min_speed', 'enter', 'exit'));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_tracking_fences_estado') THEN
        ALTER TABLE tracking_fences
            ADD CONSTRAINT ck_tracking_fences_estado
            CHECK (estado ~ '^[a-z]{2}$');
    END IF;
END $$;

CREATE OR REPLACE FUNCTION fence_geometry_valid(geometry jsonb)
RETURNS boolean AS $$
DECLARE
    pt jsonb;
    lat numeric;
    lng numeric;
BEGIN
    IF geometry IS NULL OR jsonb_typeof(geometry) <> 'array' OR jsonb_array_length(geometry) < 3 THEN
        RETURN FALSE;
    END IF;

    FOR pt IN SELECT * FROM jsonb_array_elements(geometry) LOOP
        IF jsonb_typeof(pt -> 'lat') <> 'number' OR jsonb_typeof(pt -> 'lng') <> 'number' THEN
            RETURN FALSE;
        END IF;
        lat := (pt ->> 'lat')::numeric;
        lng := (pt ->> 'lng')::numeric;
        IF lat < -90 OR lat > 90 OR lng < -180 OR lng > 180 THEN
            RETURN FALSE;
        END IF;
    END LOOP;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_tracking_fences_geometry') THEN
        ALTER TABLE tracking_fences
            ADD CONSTRAINT ck_tracking_fences_geometry
            CHECK (fence_geometry_valid(geometry));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_tracking_fences_speed_limit') THEN
        ALTER TABLE tracking_fences
            ADD CONSTRAINT ck_tracking_fences_speed_limit
            CHECK (speed_limit IS NULL OR (speed_limit BETWEEN 1 AND 300));
    END IF;
END $$;

-- ── Colunas de bounding box (pré-filtro espacial sem PostGIS) ─────────────────

ALTER TABLE tracking_fences
    ADD COLUMN IF NOT EXISTS lat_min DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS lat_max DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS lng_min DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS lng_max DOUBLE PRECISION;

-- Backfill dos dados existentes
UPDATE tracking_fences tf
SET lat_min = s.lat_min, lat_max = s.lat_max,
    lng_min = s.lng_min, lng_max = s.lng_max
FROM (
    SELECT id,
           MIN((e ->> 'lat')::numeric)::double precision AS lat_min,
           MAX((e ->> 'lat')::numeric)::double precision AS lat_max,
           MIN((e ->> 'lng')::numeric)::double precision AS lng_min,
           MAX((e ->> 'lng')::numeric)::double precision AS lng_max
    FROM tracking_fences, LATERAL jsonb_array_elements(geometry) AS e
    WHERE lat_min IS NULL
    GROUP BY id
) s
WHERE tf.id = s.id;

-- ── Trigger de manutenção do bbox ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sync_fence_bbox() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.geometry IS NULL OR jsonb_typeof(NEW.geometry) <> 'array' OR jsonb_array_length(NEW.geometry) < 1 THEN
        NEW.lat_min := NULL;
        NEW.lat_max := NULL;
        NEW.lng_min := NULL;
        NEW.lng_max := NULL;
        RETURN NEW;
    END IF;

    SELECT MIN((e ->> 'lat')::numeric)::double precision,
           MAX((e ->> 'lat')::numeric)::double precision,
           MIN((e ->> 'lng')::numeric)::double precision,
           MAX((e ->> 'lng')::numeric)::double precision
    INTO NEW.lat_min, NEW.lat_max, NEW.lng_min, NEW.lng_max
    FROM jsonb_array_elements(NEW.geometry) AS e;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tracking_fences_bbox ON tracking_fences;
CREATE TRIGGER trg_tracking_fences_bbox
    BEFORE INSERT OR UPDATE OF geometry ON tracking_fences
    FOR EACH ROW EXECUTE FUNCTION sync_fence_bbox();

-- ── Índices ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tracking_fences_estado_active
    ON tracking_fences (estado, is_active);

CREATE INDEX IF NOT EXISTS idx_tracking_fences_geometry_gin
    ON tracking_fences USING GIN (geometry jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_tracking_fences_bbox_lat
    ON tracking_fences (lat_min, lat_max);

CREATE INDEX IF NOT EXISTS idx_tracking_fences_bbox_lng
    ON tracking_fences (lng_min, lng_max);
