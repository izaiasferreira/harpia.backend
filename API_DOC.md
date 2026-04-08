# Documentação da API Banco

API para gestão de leituras, agentes e monitoria de serviços.

---

## Autenticação

A API possui 3 tipos de autenticação:

### 1. Token Simples (Query Param)
Usado em rotas de consultas gerais, revalidação e webhooks.

```bash
curl "http://localhost:3040/endpoint?token=SEU_TOKEN"
```

**Headers:** `token` como query param.

---

### 2. Autenticação Telegram (TMA)
Usado nas rotas do agente (Telegram Mini Apps).

```bash
curl "http://localhost:3040/agente/endpoint" -H "X-Telegram-Init-Data: TOKEN"
```

O token pode ser:
- **Token manual:** Criado via `test_token.js` para testes
- **initData real:** Enviado automaticamente pelo Telegram em Mini Apps

O middleware autentica usando o `telegram_id` do usuário e busca na tabela `login` para obter:
- `id` (matrícula)
- `estado` (pi/ma)

---

### 3. Auth Logs
Usado nas rotas de logs via header Authorization.

```bash
curl "http://localhost:3040/api/logs/data" -H "Authorization: SENHA"
```

---

## Endpoints

### Health Check

#### `GET /health`
Verifica se a API está online.

- **Autenticação:** Nenhuma
- **Retorno:**
```json
{
    "status": "ok",
    "timestamp": "08/04/2026, 15:18:21",
    "atual_time": "Wed Apr 08 2026 15:18:21 GMT-0300"
}
```

---

### Rotas do Agente (`/agente/*`)

**Autenticação:** Telegram (Header `X-Telegram-Init-Data`)

#### `GET /agente/agent_statistics`
Retorna estatísticas do agente para o dia atual.

- **Query Params:** `date` (opcional, formato DD.MM.YYYY)
- **Retorno:**
```json
[
    { "title": "Leituras Realizadas", "value": 150, "color": "#00c742ff", "unity": "", "filter": "all" },
    { "title": "Perdas Geradas", "value": 250, "color": "#EF4444", "unity": "Kwh", "filter": "perdas" },
    { "title": "Quantidade de CNL", "value": "10", "color": "#EF4444", "unity": "", "filter": "cnl" },
    { "title": "Percentual de CNL", "value": "6.7", "color": "#EF4444", "unity": "%", "filter": "cnl" },
    { "title": "Quantidade de C12", "value": 50, "color": "#00c742ff", "unity": "", "filter": "c12" },
    { "title": "C12 Fora de Horário", "value": 2, "color": "#EF4444", "unity": "", "filter": "c12_out_time" },
    { "title": "C12 em Ligação Nova", "value": 5, "color": "#EF4444", "unity": "", "filter": "c12_ligacao_nova" }
]
```

#### `GET /agente/agent_statistics_more`
Estatísticas complementares (C12 rápidos e entrantes).

- **Retorno:**
```json
[
    { "title": "C12 Rápidos", "value": 3, "color": "#EF4444", "unity": "", "filter": "fast_c12" },
    { "title": "C12 Entrante", "value": 2, "color": "#EF4444", "unity": "", "filter": "first_c12" }
]
```

#### `GET /agente/agent_services`
Lista de leituras do agente.

- **Query Params:**
  - `page` (padrão: 1)
  - `date` (formato DD.MM.YYYY)
  - `filter`: `all`, `cnl`, `c12`, `c12_out_time`, `c12_ligacao_nova`, `fast_c12`, `first_c12`

- **Retorno:** Array de leituras com campos: instalacao, etapa, ntlei, data_conclusao, hora_conclusao, etc.

#### `POST /agente/search_in`
Busca instalações no cadastro.

- **Body:**
```json
{
    "type": "instalacao" | "medidor" | "contacontrato",
    "queries": ["10000001", "10000002"]
}
```

- **Retorno:** Dados completos de cadastro (coordenadas, endereço, cliente, etc).

#### `GET /agente/predicted`
Busca serviços com perdas previstas.

- **Query Params:** `status` (padrão: PENDENTE), `page`, `limit`

- **Retorno:** Lista de serviços com perdas previstas.

#### `GET /agente/calendar`
Retorna calendário de etapas.

- **Retorno:** Array de etapas do roteiro.

#### `GET /agente/feriados`
Retorna feriados conforme o estado do colaborador.

- **Retorno:** Array de datas de feriados.

---

### Consultas Gerais (`/*`)

**Autenticação:** Token simples via query param `token`

#### `GET /last_update`
Retorna horário da última atualização.

- **Query Params:** `state` (pi/ma, padrão: pi)
- **Retorno:**
```json
[
    { "title": "abap2_hora", "value": "16:30:00" },
    { "title": "abap_hora", "value": "16:30:00" },
    { "title": "last_register", "value": "08/04/2026 às 16:35:00" }
]
```

#### `GET /pendencias` / `GET /pendencias_json`
Retorna pendências do mês atual.

- **Query Params:** `token`, `state`, `regional`
- **Retorno (pendencias):** Texto formatado com resumo
- **Retorno (pendencias_json):** Array de objetos com pendências

#### `GET /cnl`
Retorna informações de CNL.

- **Query Params:** `token`, `state`, `regional`, `dateinit`, `dateend`
- **Retorno:** Texto formatado com resumo de CNL por regional/seccional

#### `GET /cnl_to_lido_json`
Retorna CNL que foram para lido.

#### `GET /first_cnl_json`
Retorna primeiros CNL do dia.

#### `GET /c12_json`
Retorna registros C12 (fora de horário).

- **Query Params:** `token`, `state`, `regional`, `dateinit`, `dateend`

#### `GET /c12_to_lido_json`
Retorna C12 que foram para lido.

#### `GET /first_c12_json`
Retorna primeiros C12 do dia.

#### `GET /fast_c12_json`
Retorna C12 executados em menos de 60 segundos.

#### `GET /licacao_nova_c12_json`
Retorna C12 de ligação nova (instalação inicia com 200).

#### `GET /e02_json`
Retorna registros E02.

#### `GET /c16_json`
Retorna registros C16.

#### `GET /perdas` / `GET /perdas_json`
Retorna informações de perdas.

- **Query Params:** `token`, `state`, `regional`, `dateinit`, `dateend`

#### `GET /not_start_services`
Serviços que não iniciaram hoje.

- **Query Params:** `token`, `state`

#### `GET /completed_services`
Serviços concluídos hoje com mais de 10 serviços pendentes.

- **Query Params:** `token`, `state`

#### `GET /incompleted_services`
Serviços com conclusão parcial.

- **Query Params:** `token`, `state`

#### `GET /agent_telegram_id`
Retorna o telegram_id vinculado à matrícula.

- **Query Params:** `token`, `state`, `id` (matrícula)
- **Retorno:**
```json
{ "telegram_id": 8469360771 }
```

---

### Revalidação (`/*`)

**Autenticação:** Token simples via query param `token`

#### `GET /files_for_revalidate`
Fotos marcadas como suspeitas.

- **Query Params:** `token`

#### `POST /revalidate_file`
Revalida arquivo.

- **Query Params:** `token`
- **Body:**
```json
{
    "instalacao": "12345",
    "data": "08.04.2026",
    "validation": "VERDADEIRO" | "FALSO"
}
```

#### `GET /filter_options`
Opções de filtro disponíveis.

- **Query Params:** `token`

#### `GET /files_for_view`
Visualiza arquivos filtrados.

- **Query Params:** `token`, `date`, `regional`, `seccional`, `agent`, `validation`

---

### Webhooks (`/*`)

**Autenticação:** Token simples via query param `token`

#### `POST /webhook_perdas`
Recebe notificações de perdas.

- **Query Params:** `token`
- **Body (exemplo):**
```json
{
    "event": "service.completed",
    "data": {
        "title": "IN:12345",
        "description": "Descrição da perda",
        "completionData": { "foto": "url da imagem" }
    }
}
```

---

### Redirects (`/*`)

**Autenticação:** Nenhuma

#### `GET /metabase_geral`
Redirect para dashboard Metabase embedado.

- **Sem autenticação**
- **Retorno:** Redirect (302) para URL do Metabase

---

### Logs (`/api/*`)

**Autenticação:** Header `Authorization` com senha

#### `POST /api/logs/login`
Login nos logs.

- **Body:**
```json
{ "password": "senha" }
```

- **Retorno:**
```json
{ "success": true, "token": "senha" }
```

#### `GET /api/logs/data`
Busca logs com paginação.

- **Headers:** `Authorization: SENHA`
- **Query Params:** `page`, `limit`, `route`, `status`, `dateStart`, `dateEnd`
- **Retorno:**
```json
{
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5,
    "data": [...]
}
```

#### `GET /api/logs/export`
Exporta logs filtrados em CSV.

- **Headers:** `Authorization: SENHA`
- **Query Params:** `route`, `status`, `dateStart`, `dateEnd`
- **Retorno:** Arquivo CSV

#### `DELETE /api/logs/clear`
Limpa logs baseados em filtros.

- **Headers:** `Authorization: SENHA`
- **Query Params:** `route`, `status`, `dateStart`, `dateEnd`
- **Retorno:**
```json
{ "success": true, "removedCount": 50 }
```

---

## Variáveis de Ambiente

```env
# Token para rotas simples
API_TOKEN=

# Telegram
TELEGRAM_BOT_TOKEN=

# Logs
LOGS_PASSWORD=

# Database
PG_CONNECTION_PI=
PG_CONNECTION_MA=
PG_CONNECTION_LOCALIZACOES_PI=

# Metabase
METABASE_SITE_URL=
METABASE_SECRET_KEY_GERAL=

# WhatsApp
WHATSAPP_LINK_SEND_FILES=
WHATSAPP_LINK_SEND_TEXT=

# CORS
CORS_ORIGINS=

# Redis
REDIS_URL=

# Server
PORT=
```

---

## Tabelas Relacionadas

- `login` - Colaboradores com telegram_id
- `matriz` - Leituras e serviços
- `auditoria` - Fotos e validações
- `telegram_tokens` - Tokens de autenticação (criado automaticamente)
- `cadastro` - Dados de instalações
- `dados_instalacoes` - Informações adicionais de localização

---

## Fluxo de Autenticação Telegram

1. **Desenvolvimento/Teste:**
   - Execute `node test_token.js [telegram_id]`
   - Use o token retornado no header `X-Telegram-Init-Data`

2. **Produção (Telegram Mini App):**
   - No frontend: `WebApp.initData`
   - Envie no header: `X-Telegram-Init-Data: WebApp.initData`
   - A API valida o hash usando `TELEGRAM_BOT_TOKEN`
   - Busca o usuário na tabela `login` pelo `telegram_id`
   - Extrai `id` (matrícula) e `estado` automaticamente
