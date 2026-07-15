-- Migration 047: Add optional foto column to security_report and accidents tables
ALTER TABLE security_report ADD COLUMN IF NOT EXISTS foto TEXT;
ALTER TABLE accidents ADD COLUMN IF NOT EXISTS foto TEXT;
