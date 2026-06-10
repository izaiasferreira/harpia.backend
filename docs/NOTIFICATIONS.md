# Notificações Push (FCM) — Backend

## Visão Geral

Sistema unificado de envio de notificações para agentes de campo via Telegram e/ou Push Notification (FCM). Suporta alertas críticos com overlay nativo que aparece por cima de qualquer app.

---

## Arquitetura

```
Admin UI (MessageAgentModal)
    ↓
POST /admin/notifications/send
    ↓
┌─────────────────────────────────────┐
│  channels: ["telegram", "push"]     │
│  critical: true → data-only push    │
└─────────────────────────────────────┘
    ↓                    ↓
Telegram Bot API     Firebase Cloud Messaging
    ↓                    ↓
Mensagem no chat     Notificação no dispositivo
                         ↓ (se critical)
                     OverlayAlertService (Android)
```

---

## Endpoint Principal

### `POST /admin/notifications/send`

Endpoint unificado para envio de mensagens/notificações.

**Módulo requerido:** `send_message_user_agent`

**Content-Type:** `multipart/form-data`

**Campos:**

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `channels` | JSON array | Sim | `["telegram"]`, `["push"]`, ou `["telegram", "push"]` |
| `text` | string | Sim | Corpo da mensagem |
| `title` | string | Push: sim | Título da notificação push |
| `agent_ids` | JSON array | * | IDs dos agentes destinatários |
| `broadcast` | "true" | * | Enviar para todos (alternativa a agent_ids) |
| `file` | File/string | Não | Anexo (Telegram only) — upload ou URL |
| `data` | JSON object | Não | Dados extras para push. Se `critical: "true"`, envia como data-only |
| `webAppButtonText` | string | Não | Texto do botão webapp (Telegram) |
| `webAppButtonUrl` | string | Não | URL do botão webapp (Telegram) |

**Resposta 200:**
```json
{
  "telegram": { "sent": 5, "failed": 1 },
  "push": { "sent": 4, "failed": 0 }
}
```

---

## Push Crítico (Overlay)

Quando `data.critical = "true"`:
- Push é enviado como **data-only message** (sem campo `notification`)
- Garante que `onMessageReceived` é chamado mesmo com app em background
- O `FcmRestartReceiver` detecta e dispara `OverlayAlertService`
- Overlay aparece por cima de qualquer app (requer permissão SYSTEM_ALERT_WINDOW)

**Campos extras no `data`:**

| Campo | Valores | Default |
|-------|---------|---------|
| `type` | `danger`, `warn`, `success` | `danger` |
| `icon` | Emoji (🚨, ⚠️, 🔥, etc.) | 🚨 |

---

## Tabela `fcm_tokens`

```sql
CREATE TABLE fcm_tokens (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(50) NOT NULL,
    token TEXT NOT NULL,
    device_info TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(agent_id, token)
);
```

Tokens inválidos são removidos automaticamente após falha de envio.

---

## Configuração

### Firebase Service Account

O backend precisa do service account JSON para enviar push:

- **Local:** `back/cenos-622fb-firebase-adminsdk-fbsvc-*.json`
- **Produção:** variável de ambiente `FIREBASE_SERVICE_ACCOUNT_JSON` com o JSON inteiro

### google-services.json

Necessário apenas no build Android: `mobile/android/app/google-services.json`

---

## Arquivos

| Arquivo | Função |
|---------|--------|
| `src/functions/firebase.js` | Init Firebase Admin + sendNotification + sendToMultiple |
| `src/functions/database/fcmTokens.js` | CRUD tabela fcm_tokens |
| `src/routes/adminNotifications.js` | Rota POST /admin/notifications/send + broadcast (legado) |
| `src/routes/adminMessages.js` | Rota POST /admin/messages/send — endpoint unificado multicanal |
| `src/routes/telegramWebhook.js` | Rota POST /public/telegram-webhook — recebe mensagens do Telegram |

---

## Endpoint Unificado (Novo)

### `POST /admin/messages/send`

Substitui o endpoint de notificações para uso integrado com o chat. Toda mensagem enviada é registrada em `chat_messages` com o canal correspondente.

**Autenticação:** JWT Admin (Bearer)

**Content-Type:** `multipart/form-data`

**Campos:**

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `channels` | JSON array | Sim | `["telegram"]`, `["push"]`, `["internal"]`, ou combinação |
| `text` | string | Sim* | Corpo da mensagem (*ou file) |
| `title` | string | Push: sim | Título da notificação push |
| `agent_ids` | JSON array | Sim | IDs dos agentes destinatários |
| `file` | File/string | Não | Anexo — upload (multer) ou URL |
| `webAppButtonText` | string | Não | Texto do botão webapp (Telegram) |
| `webAppButtonUrl` | string | Não | URL do botão webapp (Telegram) |
| `critical` | "true" | Não | Marca como alerta crítico (overlay) |
| `alertType` | string | Não | `danger`, `warn`, `success` |
| `alertIcon` | string | Não | Emoji do alerta |

**Comportamento por canal:**
- `telegram`: Envia via `TELEGRAM_API_URL` (serviço intermediário) + registra em `chat_messages` (channel='telegram')
- `push`: Envia FCM + registra em `chat_messages` (channel='push')
- `overlay`: Envia FCM com critical=true + registra em `chat_messages` (channel='overlay')
- `internal`: Apenas registra em `chat_messages` (channel='internal') + emite via socket.io

**Resposta 200:**
```json
{
  "telegram": { "sent": 3, "failed": 0 },
  "push": { "sent": 3, "failed": 1 },
  "chat": [{ "agentId": "T12345", "roomId": 42, "messageId": 501 }]
}
```

---

## Telegram Webhook

### `POST /public/telegram-webhook`

Recebe eventos do serviço intermediário Telegram. Mensagens inbound de agentes são salvas em `chat_messages` e emitidas via socket.io para admins.

**Autenticação:** Middleware `checkToken` — valida token via query param `?token=` ou header `X-API-Token` (tokens gerenciáveis no admin).

**Payload esperado (JSON):**
```json
{
  "event": "message.received",
  "direction": "inbound",
  "timestamp": "2026-05-28T14:00:00.000Z",
  "messageId": "uuid-v4",
  "chatId": "123456789",
  "from": {
    "id": "123456789",
    "firstName": "João",
    "lastName": "Silva",
    "username": "joaosilva",
    "isBot": false
  },
  "message": {
    "type": "text|photo|video|audio|document|voice|location|sticker|contact|web_app_data",
    "text": "string | null",
    "caption": "string | null",
    "fileId": "string | null",
    "location": { "latitude": 0, "longitude": 0 },
    "contact": { "first_name": "", "last_name": "", "phone_number": "" },
    "webAppData": { "data": "string", "button_text": "string" }
  },
  "origin": "telegram_polling"
}
```

**Eventos processados:** `message.received`, `web_app_data` (direction=inbound apenas)

**Tipos de mensagem:** text, photo, video, video_note, animation, document, voice, audio, location, sticker, contact, web_app_data

**Fluxo:**
1. Serviço Telegram envia evento → webhook recebe
2. Identifica agente por `from.id` → busca `telegram_id` na tabela `login`
3. Obtém/cria `chat_room` para o agente
4. Salva em `chat_messages` (sender_type='agent', channel='telegram')
5. Para mídia: baixa do Telegram (`getFile` com `fileId`) → upload no MinIO
6. Emite `admin_new_chat_message` + `receive_message` via socket.io

**Configuração:**
```env
TELEGRAM_BOT_TOKEN=token_do_bot_para_download_de_midia
```

**URL para configurar no serviço Telegram:**
```
https://api.izi.tec.br/public/telegram-webhook
Header: X-Webhook-Secret = <seu_token_api>
```

---

## Schema `chat_messages`

```sql
CREATE TABLE chat_messages (
    id SERIAL PRIMARY KEY,
    room_id INTEGER NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL,
    sender_type TEXT NOT NULL,        -- 'admin' | 'agent'
    sender_name TEXT NOT NULL,
    message TEXT,
    message_type TEXT NOT NULL DEFAULT 'text',  -- text|image|video|audio|document|location
    file_url TEXT,
    file_name TEXT,
    latitude NUMERIC,
    longitude NUMERIC,
    read BOOLEAN DEFAULT FALSE,
    channel TEXT DEFAULT 'internal',  -- internal|telegram|push|overlay
    metadata JSONB DEFAULT NULL,      -- dados extras (botões, alertas, etc.)
    created_at TIMESTAMP DEFAULT NOW()
);
```

### Coluna `metadata` — Exemplos de conteúdo

| Canal | Conteúdo metadata |
|---|---|
| telegram | `{ "webAppButtonText": "Abrir App", "webAppButtonUrl": "https://..." }` |
| push | `{ "title": "Alerta", "critical": true, "alertType": "danger", "alertIcon": "🚨" }` |
| overlay | `{ "title": "Emergência", "critical": true, "alertType": "danger", "alertIcon": "🔥" }` |
| internal | `null` |
