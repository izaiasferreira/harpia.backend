-- Migração de tipos de coluna
-- Corrige colunas TEXT que deveriam ter tipos específicos

-- users
ALTER TABLE users ALTER COLUMN senha TYPE VARCHAR(255);
ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(20);
ALTER TABLE users ALTER COLUMN estado TYPE VARCHAR(2);

-- branches
ALTER TABLE branches ALTER COLUMN state TYPE VARCHAR(2);

-- permissions
ALTER TABLE permissions ALTER COLUMN state TYPE VARCHAR(2);

-- user_branches
ALTER TABLE user_branches ALTER COLUMN state TYPE VARCHAR(2);

-- user_permissions
ALTER TABLE user_permissions ALTER COLUMN state TYPE VARCHAR(2);

-- notifications
ALTER TABLE notifications ALTER COLUMN type TYPE VARCHAR(30);

-- message_templates_admin
ALTER TABLE message_templates_admin ALTER COLUMN name TYPE VARCHAR(255);

-- chat_rooms
ALTER TABLE chat_rooms ALTER COLUMN name TYPE VARCHAR(255);
ALTER TABLE chat_rooms ALTER COLUMN type TYPE VARCHAR(20);

-- chat_messages
ALTER TABLE chat_messages ALTER COLUMN sender_type TYPE VARCHAR(10);
ALTER TABLE chat_messages ALTER COLUMN message_type TYPE VARCHAR(20);
ALTER TABLE chat_messages ALTER COLUMN channel TYPE VARCHAR(20);

-- service_notes_chat_messages
ALTER TABLE service_notes_chat_messages ALTER COLUMN tool_call_id TYPE VARCHAR(100);

-- security_report — lat/lon de TEXT para DECIMAL
ALTER TABLE security_report ALTER COLUMN latitude TYPE DECIMAL(10,7) USING NULLIF(latitude::text, '')::DECIMAL;
ALTER TABLE security_report ALTER COLUMN longitude TYPE DECIMAL(10,7) USING NULLIF(longitude::text, '')::DECIMAL;
ALTER TABLE security_report ALTER COLUMN estado TYPE VARCHAR(2);

-- security_check — lat/lon de TEXT para DECIMAL
ALTER TABLE security_check ALTER COLUMN latitude TYPE DECIMAL(10,7) USING NULLIF(latitude::text, '')::DECIMAL;
ALTER TABLE security_check ALTER COLUMN longitude TYPE DECIMAL(10,7) USING NULLIF(longitude::text, '')::DECIMAL;
ALTER TABLE security_check ALTER COLUMN estado TYPE VARCHAR(2);

-- justificativas — quantidade de TEXT para INTEGER
ALTER TABLE justificativas ALTER COLUMN quantidade TYPE INTEGER USING (
    CASE
        WHEN quantidade IS NULL OR trim(quantidade::text) = '' THEN NULL
        WHEN trim(quantidade::text) ~ '^\d+$' THEN trim(quantidade::text)::INTEGER
        ELSE NULL
    END
);

-- justify_pending — quantidade de TEXT para INTEGER
ALTER TABLE justify_pending ALTER COLUMN quantidade TYPE INTEGER USING (
    CASE
        WHEN quantidade IS NULL OR trim(quantidade::text) = '' THEN NULL
        WHEN trim(quantidade::text) ~ '^\d+$' THEN trim(quantidade::text)::INTEGER
        ELSE NULL
    END
);