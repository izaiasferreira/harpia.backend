-- Adiciona suporte a imagens/anexos nas mensagens do assistente de IA dos Avisos do App
ALTER TABLE app_alert_chat_messages ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;
