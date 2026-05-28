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

### `POST /public/telegram-webhook?token=SECRET`

Recebe updates do Telegram Bot API. Mensagens de agentes são salvas em `chat_messages` e emitidas via socket.io para admins.

**Autenticação:** Query param `token` validado contra `TELEGRAM_WEBHOOK_SECRET`

**Tipos suportados:** text, photo, video, document, voice, audio, location

**Fluxo:**
1. Telegram envia update → webhook recebe
2. Identifica agente por `message.from.id` → busca `telegram_id` na tabela `login`
3. Obtém/cria `chat_room` para o agente
4. Salva em `chat_messages` (sender_type='agent', channel='telegram')
5. Para mídia: baixa do Telegram (`getFile`) → upload no MinIO
6. Emite `admin_new_chat_message` + `receive_message` via socket.io

**Configuração:**
```env
TELEGRAM_WEBHOOK_SECRET=seu_secret_aqui
TELEGRAM_BOT_TOKEN=token_do_bot
```

**Registrar webhook no Telegram:**
```
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://api.izi.tec.br/public/telegram-webhook?token=<SECRET>
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
    created_at TIMESTAMP DEFAULT NOW()
);
```
