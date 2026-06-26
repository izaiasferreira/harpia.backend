ALTER TABLE security_report ADD COLUMN IF NOT EXISTS seccional VARCHAR(100);
ALTER TABLE security_report ADD COLUMN IF NOT EXISTS regional VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_security_report_seccional ON security_report(seccional);

UPDATE security_report sr
SET seccional = c.seccional, regional = c.regional
FROM colaboradores c
WHERE LOWER(sr.autor) = LOWER(c."ID")
  AND (sr.seccional IS NULL OR sr.regional IS NULL);

ALTER TABLE accidents ADD COLUMN IF NOT EXISTS seccional VARCHAR(100);
ALTER TABLE accidents ADD COLUMN IF NOT EXISTS regional VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_accidents_seccional ON accidents(seccional);

UPDATE accidents a
SET seccional = c.seccional, regional = c.regional
FROM colaboradores c
WHERE LOWER(a.autor) = LOWER(c."ID")
  AND (a.seccional IS NULL OR a.regional IS NULL);
