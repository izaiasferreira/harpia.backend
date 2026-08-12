-- App Alerts Migration
-- Tabela de alertas/pop-ups para exibição no app do agente

CREATE TABLE IF NOT EXISTS app_alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  content_type  TEXT NOT NULL CHECK (content_type IN ('html', 'image')),
  content       TEXT NOT NULL,         -- HTML sanitizado OU path da imagem no MinIO
  link_url      TEXT,                  -- URL de destino ao clicar (opcional)
  is_active     BOOLEAN DEFAULT true,
  filters       JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- ex: { "estado": ["PI"], "regional": ["R1"], "seccional": [], "cargo": [], "processo": [] }
  frequency     TEXT NOT NULL DEFAULT 'once',
  -- 'once' | 'daily' | 'weekly' | 'weekday:1' | 'weekday:1,3,5' (dias ISO: 1=segunda)
  expires_at    TIMESTAMPTZ,           -- nulo = nunca expira
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Histórico de visualizações por agente
CREATE TABLE IF NOT EXISTS app_alert_views (
  id          SERIAL PRIMARY KEY,
  alert_id    UUID NOT NULL REFERENCES app_alerts(id) ON DELETE CASCADE,
  agent_id    VARCHAR(50) NOT NULL REFERENCES login(id) ON DELETE CASCADE,
  viewed_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_alert_views_alert_id ON app_alert_views(alert_id);
CREATE INDEX IF NOT EXISTS idx_app_alert_views_agent_id ON app_alert_views(agent_id);

-- Mensagens do assistente de IA para criação de HTML
CREATE TABLE IF NOT EXISTS app_alert_chat_messages (
  id          SERIAL PRIMARY KEY,
  alert_id    UUID NOT NULL REFERENCES app_alerts(id) ON DELETE CASCADE,
  role        VARCHAR(15) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
