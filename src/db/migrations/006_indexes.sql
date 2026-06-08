-- Database Indexes Migration

CREATE INDEX IF NOT EXISTS idx_notifications_agent ON notifications(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(agent_id, read);

CREATE INDEX IF NOT EXISTS idx_chat_messages_room_id ON chat_messages(room_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);

CREATE INDEX IF NOT EXISTS idx_service_notes_group ON service_notes(group_id);
CREATE INDEX IF NOT EXISTS idx_service_notes_assigned ON service_notes(assigned_to);
CREATE INDEX IF NOT EXISTS idx_service_notes_status ON service_notes(status);
CREATE INDEX IF NOT EXISTS idx_marker_categories_group ON marker_categories(group_id);

CREATE INDEX IF NOT EXISTS idx_tracking_points_agent ON tracking_points(agent_id);
CREATE INDEX IF NOT EXISTS idx_tracking_points_recorded ON tracking_points(recorded_at);
CREATE INDEX IF NOT EXISTS idx_speed_violations_agent ON speed_violations(agent_id);
CREATE INDEX IF NOT EXISTS idx_fall_incidents_agent ON fall_incidents(agent_id);
CREATE INDEX IF NOT EXISTS idx_fall_incidents_status ON fall_incidents(status);
CREATE INDEX IF NOT EXISTS idx_agent_alerts_log_agent ON agent_alerts_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_alerts_log_type ON agent_alerts_log(alert_type);

CREATE INDEX IF NOT EXISTS idx_form_responses_form_id ON form_responses(form_id);
CREATE INDEX IF NOT EXISTS idx_form_responses_submitted_at ON form_responses(submitted_at);
CREATE INDEX IF NOT EXISTS idx_form_chat_messages_form_id ON form_chat_messages(form_id);
CREATE INDEX IF NOT EXISTS idx_training_chat_messages_training_id ON training_chat_messages(training_id);
