-- Migration 014: Aumenta device_model para 200 chars
-- O user agent na web pode ultrapassar 100 chars; o schema agora trunca em 200.

ALTER TABLE tracking_session_points
    ALTER COLUMN device_model TYPE VARCHAR(200);

ALTER TABLE tracking_points
    ALTER COLUMN device_model TYPE VARCHAR(200);
