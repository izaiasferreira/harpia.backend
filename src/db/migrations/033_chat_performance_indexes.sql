-- Chat Performance Indexes Migration
-- Melhora performance das queries de chat (N+1, unread count, last message)

-- C8: chat_rooms lookup by agent_id + type (get_or_create_support_room)
CREATE INDEX IF NOT EXISTS idx_chat_rooms_agent_type
    ON chat_rooms(agent_id, type);

-- C9: chat_messages unread count queries + last message ORDER BY
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created
    ON chat_messages(room_id, created_at DESC);

-- C9: chat_messages unread count filter (sender_type + read)
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_sender_read
    ON chat_messages(room_id, sender_type, read);
