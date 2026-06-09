# Endpoints Públicos e Consultas Gerais

Este documento descreve os endpoints expostos sem autenticação (públicos) ou autenticados por meio de token estático simples (para integrações e consultas de BI).

---

## 1. Endpoints Públicos (Sem Autenticação)

A API possui uma camada pública que limita o consumo a **60 requisições por minuto (Rate Limit)** por endereço IP.

### `GET /public/health`
Verifica a saúde física do servidor da API, pools de banco de dados e conexão ao Redis.

**Resposta 200 (sucesso):**
```json
{
    "status": "ok",
    "timestamp": "10/05/2026, 15:00:00",
    "atual_time": "Thu May 10 2026 15:00:00 GMT-0300 (Hora padrão de Brasília)"
}
```

---

### `GET /public/calendar`
Redireciona para o calendário público de eventos integrados.

---

### `GET /public/feriados`
Retorna feriados declarados para o ano corrente baseados no estado requisitado.

---

### `GET /public/metabase_geral`
Redireciona o painel geral para uma URL segura e temporariamente assinada pelo JWT do Metabase interno.

**Resposta 302:** Redirect para painel de Business Intelligence (Metabase Dashboard ID 4).

---

### `GET /public/generate_token`
Gera tokens de acesso temporário de uso estritamente interno e controle de testes.

---

### `POST /public/telegram-webhook`
Webhook para receber eventos do serviço intermediário Telegram. Mensagens inbound de agentes são salvas no chat unificado e emitidas via socket.io para admins.

**Autenticação:** Middleware `checkToken` — valida `API_TOKEN` via query param `?token=` ou header.

**Body (JSON):** Payload estruturado do serviço Telegram:
```json
{
  "event": "message.received",
  "direction": "inbound",
  "chatId": "123456789",
  "from": { "id": "123456789", "firstName": "João", "lastName": "Silva" },
  "message": { "type": "text", "text": "Olá", "fileId": null, "caption": null, "location": null, "contact": null, "webAppData": null }
}
```

**Eventos processados:** `message.received`, `web_app_data`

**Tipos de mensagem suportados:** text, photo, video, video_note, animation, document, voice, audio, location, sticker, contact, web_app_data

**Fluxo:** Identifica agente por `from.id` (telegram_id) → obtém/cria room → salva em `chat_messages` (channel='telegram') → download mídia via Telegram getFile → MinIO → emite via socket.io.

**Resposta 200:**
```json
{ "ok": true }
```

---

### `POST /public/notify`
Endpoint público para apps externos gerarem notificações para agentes. Salva na tabela `notifications` e despacha pelos canais escolhidos. Suporta envio em massa (múltiplos agentes).

**Autenticação:** `checkToken` — valida `API_TOKEN` via query param `?token=`.

**Body (JSON):**
```json
{
  "sender": "id_de_quem_enviou",
  "to": "MATRICULA_AGENTE",
  "title": "Título opcional",
  "body": "Conteúdo obrigatório",
  "type": "success|warn|danger|info",
  "method": ["telegram", "internal", "push", "priority"]
}
```

| Campo | Tipo | Obrigatório | Default | Descrição |
|-------|------|-------------|---------|-----------|
| `sender` | string | Sim | — | Identificador de quem enviou |
| `to` | string ou string[] | Sim | — | Matrícula do agente (string) ou array de matrículas (bulk) |
| `title` | string | Não | null | Título da notificação |
| `body` | string | Sim | — | Conteúdo da notificação |
| `type` | string | Não | `success` | Tipo visual: `success`, `info`, `warn`, `danger` |
| `method` | string[] | Não | `["push"]` | Canais de entrega (ver abaixo) |

**Canais disponíveis (`method`):**

| Canal | Comportamento |
|-------|---------------|
| `telegram` | Envia via Telegram Bot (busca `telegram_id` do agente) |
| `push` | Envia FCM push notification (busca tokens registrados) |
| `priority` | Envia FCM com flag `critical: true` (overlay/bolha flutuante) |
| `internal` | Salva em `chat_messages` + emite via socket.io (chat interno) |

**Resposta 200 (sucesso) — single:**
```json
{
  "success": true,
  "id": 42,
  "agentCount": 1,
  "results": {
    "12345": {
      "telegram": { "success": true },
      "push": { "success": true, "sent": 2 },
      "internal": { "success": true, "messageId": 156 }
    }
  }
}
```

**Resposta 200 (sucesso) — bulk:**
```json
{
  "success": true,
  "id": 42,
  "agentCount": 3,
  "results": {
    "AGENTE1": { "telegram": { "success": true }, "push": { "success": true, "sent": 1 } },
    "AGENTE2": { "telegram": { "success": false, "error": "sem telegram_id" }, "push": { "success": true, "sent": 1 } },
    "AGENTE3": { "push": { "success": true, "sent": 1 } }
  }
}
```

**Resposta 400:**
```json
{ "error": "body é obrigatório" }
```

**Exemplo de uso (curl) — single:**
```bash
curl -X POST "https://api.izi.tec.br/public/notify?token=SEU_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sender": "sistema_rh",
    "to": "12345",
    "title": "Aviso Importante",
    "body": "Seu treinamento vence amanhã.",
    "type": "warn",
    "method": ["push", "telegram"]
  }'
```

**Exemplo de uso (curl) — bulk:**
```bash
curl -X POST "https://api.izi.tec.br/public/notify?token=SEU_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sender": "sistema_rh",
    "to": ["AGENTE1", "AGENTE2", "AGENTE3"],
    "title": "Comunicado Geral",
    "body": "Todos devem revisar o procedimento.",
    "type": "info",
    "method": ["push", "telegram"]
  }'
```

---

### `GET /public/form/:id`
Retorna a estrutura pública de um formulário dinâmico.

**Resposta 200 (sucesso):**
A estrutura do formulário (`FormProject` mapeado), incluindo suas configurações e páginas:
```json
{
  "id": "form_uuid",
  "title": "Vistoria de Campo",
  "structure": [
    {
      "title": "Informações Iniciais",
      "elements": [
        { "id": "1", "type": "question", "field_type": "text", "label": "Nome do Agente", "required": true }
      ]
    }
  ],
  "settings": { "limitToOneResponse": true }
}
```

---

### `GET /public/form/:id/check`
Verifica se um respondente específico já enviou uma resposta para este formulário (utilizado para limitar a uma resposta por usuário).

**Query Params:**
- `respondentId` (string): Identificador único do respondente (matrícula do agente ou ID anônimo).

**Resposta 200:**
`true` se já respondeu, `false` caso contrário.

---

### `POST /public/form/submit/:id`
Envia as respostas preenchidas de um formulário.

**Body (JSON):**
```json
{
  "answers": {
    "respondent_id": "12345",
    "campo_id": "Valor preenchido"
  },
  "metadata": {
    "score": 10,
    "maxScore": 10,
    "duration_seconds": 120
  }
}
```

**Resposta 200 (sucesso):**
```json
{
  "success": true,
  "response": {
    "id": "response_uuid",
    "form_id": "form_uuid",
    "answers": { ... },
    "metadata": { ... }
  }
}
```

---

### `POST /public/form/upload`
Endpoint público para upload de arquivos/imagens anexados a formulários dinâmicos.

**Body:** `multipart/form-data` contendo a chave `file`.

**Resposta 200 (sucesso):**
```json
{
  "url": "/public/uploads/file_name.png"
}
```

---

## 2. Consultas Gerais (Token Simples)

Estas rotas são desenhadas para extração em lote e integrações automáticas com ferramentas de BI.

* **Autenticação Requerida:** Token simples (`?token=API_TOKEN`) no formato query string.

### Parâmetros Comuns Suportados:

| Parâmetro | Tipo | Padrão | Descrição |
|---|---|---|---|
| `token` | string | — | **Obrigatório** (deve bater com `API_TOKEN` no `.env`). |
| `state` | string | `pi` | Estado federativo (`pi` ou `ma`). |
| `regional` | string | `all` | Regional de distribuição de energia ou `all`. |
| `dateinit` | string | data de hoje | Data inicial no formato `DD.MM.YYYY`. |
| `dateend` | string | data de hoje | Data final no formato `DD.MM.YYYY`. |

---

### Lista de Endpoints de Relatórios JSON/CSV:

* **`GET /api/last_update`**: Data e hora da última sincronização com o banco central.
* **`GET /api/pendencias`** / **`GET /api/pendencias_json`**: Relatório consolidado ou JSON cru de ordens de serviço pendentes por colaborador.
* **`GET /api/pontualidade`** / **`GET /api/pontualidade_json`**: Índices de pontualidade na primeira e última leitura do dia executadas em campo.
* **`GET /api/cnl`** / **`GET /api/cnl_to_lido_json`** / **`GET /api/first_cnl_json`**: Leituras do tipo CNL (Consumo Não Lido).
* **`GET /api/c12_json`** / **`GET /api/c12_to_lido_json`** / **`GET /api/first_c12_json`** / **`GET /api/fast_c12_json`**: Metas e status de faturamento na rota C12.
* **`GET /api/licacao_nova_c12_json`**: Relatório de novas ligações identificadas em rotas de faturamento.
* **`GET /api/e02_json`**: Leituras do tipo E02 (excesso de demanda).
* **`GET /api/c16_json`**: Leituras do tipo C16.
* **`GET /api/perdas`** / **`GET /api/perdas_json`**: Relatório analítico de vistorias de fraude e perdas de energia.
* **`GET /api/not_start_services`**: Relação de colaboradores que ainda não iniciaram rotas na data atual.
* **`GET /api/completed_services`**: Relação de serviços finalizados com sucesso nas últimas 24 horas.
* **`GET /api/incompleted_services`**: Relação de serviços não executados devido a impedimentos.

---

### `GET /api/agent_telegram_id`
Recupera o ID único de conversa do Telegram associado à matrícula de um colaborador.

**Query Params:** `token`, `state`, `id` (matrícula do agente).

**Resposta 200:**
```json
{ "telegram_id": "7136458344" }
```

---

### `POST /api/justification_codes`
Retorna os códigos e regras de justificativa válidas para o colaborador preencher caso encontre impedimentos de leitura no campo.

**Query Params:** `token`, `state`, `id` (matrícula do agente).

---

### `POST /api/justify_pending`

Cria uma justificativa pendente em lote para múltiplas instalações. Rota auxiliar sem autenticação Telegram (apenas token simples).

**Autenticação:** Token simples (`?token=API_TOKEN`)

**Body (JSON):**
```json
{
  "autor": "T60702",
  "estado": "pi",
  "quantidade": 5,
  "tipo": "CNL",
  "unidade_leitura": "12345",
  "instalacao": "67890",
  "foto": "https://..."
}
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `autor` | string | **sim** | Matrícula do agente |
| `estado` | string | **sim** | Estado (`pi` ou `ma`) |
| `quantidade` | number | **sim** | Quantidade (> 0) |
| `tipo` | string | não | Tipo da justificativa |
| `unidade_leitura` | string | não | Unidade de leitura |
| `instalacao` | string | não | Instalação |
| `foto` | string | não | URL da foto |

**Resposta 201:** Objeto da justificativa criada.

---

## 3. Webhooks

### `POST /webhook_perdas`

Webhook para processar eventos de serviços concluídos do módulo de perdas. Quando um serviço de perda é completado (`service.completed`), dispara uma mensagem WhatsApp com a foto do serviço para o número configurado em `WHATSAPP_NUMBER_PERDAS`.

**Nota:** Esta rota não está montada no `app.js` atualmente (código presente em `routes/webhooks.js` mas sem `require`/`app.use` na inicialização). Para ativar, adicionar ao `app.js`:
```javascript
const webhooksRouter = require('./routes/webhooks');
app.use('/', webhooksRouter);
```

**Body (JSON):**
```json
{
  "event": "service.completed",
  "data": {
    "title": "Perda na IN 12345",
    "description": "Descrição do serviço",
    "completionData": {
      "foto": "https://..."
    }
  }
}
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `event` | string | **sim** | Deve ser `service.completed` |
| `data.title` | string | **sim** | Título do serviço |
| `data.description` | string | **sim** | Descrição |
| `data.completionData` | object | **sim** | Objeto com URLs de fotos |

**Resposta 200:** Resultado do envio WhatsApp.

**Resposta 400:** `{ "error": "Evento inválido" }` (se event != `service.completed`)
