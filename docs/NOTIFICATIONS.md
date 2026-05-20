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
| `src/routes/adminNotifications.js` | Rota POST /admin/notifications/send + broadcast |
