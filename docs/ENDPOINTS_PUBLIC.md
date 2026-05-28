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
