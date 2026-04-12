# Documentação da API Banco

API para gestão de leituras, agentes e monitoria de serviços dos estados do Piauí (PI) e Maranhão (MA).

- **Porta padrão:** `3040`
- **Timezone:** `America/Sao_Paulo`
- **Stack:** Node.js + Express + PostgreSQL + Redis

---

## Arquitetura

```
src/
├── index.js                 # Entry point — inicia o servidor HTTP
├── app.js                   # Express app — middlewares globais e montagem de routers
├── db.js                    # Pools de conexão PostgreSQL (pi, ma, localizacoes_pi)
├── redis.js                 # Cliente Redis (logs)
├── routes/
│   ├── public.js            # Rotas públicas (sem autenticação)
│   ├── consultas.js         # Consultas gerais (token simples)
│   ├── revalidate.js        # Revalidação de fotos (token simples)
│   ├── webhooks.js          # Webhooks externos (token simples)
│   ├── agente.js            # Rotas para o app do agente (Telegram auth)
│   └── logs.js              # Interface de logs Redis (auth por senha)
├── middlewares/
│   ├── logMiddleware.js     # Registra todas as requisições no Redis
│   └── telegramAuth.js      # Valida initData ou token manual do Telegram
├── functions/
│   ├── postgresFunctions.js # Todas as queries SQL
│   └── requestsFunctions.js # Integração WhatsApp (Cattalk)
└── utils/
    └── dates.js             # Funções de data no formato DD.MM.YYYY
```

---

## Autenticação

A API possui 3 modos de autenticação:

### 1. Token Simples (Query Param)

Usado nas rotas de consultas gerais, revalidação e webhooks.
O token é definido em `API_TOKEN`.

```bash
curl "http://localhost:3040/endpoint?token=SEU_TOKEN"
```

---

### 2. Autenticação Telegram (TMA)

Usado nas rotas do agente — requer o header `X-Telegram-Init-Data`.

```bash
curl "http://localhost:3040/agent_statistics" \
     -H "X-Telegram-Init-Data: TOKEN_OU_INIT_DATA"
```

O valor do header pode ser:

| Tipo | Descrição |
|---|---|
| **Token manual** | Gerado via `node test_token.js [telegram_id]` (persiste em `telegram_tokens`) |
| **initData real** | String enviada automaticamente pelo Telegram em Mini Apps (`WebApp.initData`) |

O middleware verifica o hash HMAC-SHA256 e, após autenticado, busca o colaborador na tabela `login` pelo `telegram_id`. O objeto `req.colaborador` fica disponível com:

```json
{ "id": "MATRICULA", "estado": "pi", "telegramId": 12345678 }
```

---

### 3. Auth de Logs (Header Authorization)

Usado nas rotas `/api/logs/*`. A senha é definida em `LOGS_PASSWORD`.

```bash
curl "http://localhost:3040/api/logs/data" -H "Authorization: SENHA"
```

---

## Endpoints

---

### Públicos (sem autenticação)

Rate limit: **60 req/min** por IP.

#### `GET /health`
Verifica se a API está online.

**Retorno:**
```json
{
    "status": "ok",
    "timestamp": "10/04/2026, 15:00:00",
    "atual_time": "Thu Apr 10 2026 15:00:00 GMT-0300 (Hora padrão de Brasília)"
}
```

---

#### `GET /calendar`
Retorna o calendário de etapas de leitura do mês.

**Query Params:**

| Param | Tipo | Padrão | Descrição |
|---|---|---|---|
| `state` | string | `pi` | Estado (`pi` ou `ma`) |

**Retorno:** Array de etapas do roteiro.

---

#### `GET /feriados`
Retorna lista de feriados do estado.

**Query Params:**

| Param | Tipo | Padrão | Descrição |
|---|---|---|---|
| `state` | string | `pi` | Estado (`pi` ou `ma`) |

**Retorno:**
```json
["03/04/2026", "21/04/2026"]
```

---

#### `GET /metabase_geral`
Redireciona para o dashboard geral embarcado no Metabase (dashboard ID 4).

- **Autenticação:** Nenhuma
- **Retorno:** Redirect `302` para URL JWT-assinada do Metabase

---

### Consultas Gerais

**Autenticação:** Token simples (`?token=API_TOKEN`)

Parâmetros comuns:

| Param | Tipo | Padrão | Descrição |
|---|---|---|---|
| `token` | string | — | **Obrigatório** |
| `state` | string | `pi` | Estado (`pi` ou `ma`) |
| `regional` | string | `all` | Regional ou `all` |
| `dateinit` | string | hoje | Data inicial `DD.MM.YYYY` |
| `dateend` | string | hoje | Data final `DD.MM.YYYY` |

---

#### `GET /last_update`
Retorna horários da última atualização dos dados.

**Query Params:** `token`, `state`

**Retorno:**
```json
[
    { "title": "abap2_hora", "value": "16:30:00" },
    { "title": "abap_hora",  "value": "16:30:00" },
    { "title": "last_register", "value": "10/04/2026 às 16:35:00" }
]
```

---

#### `GET /pendencias`
Retorna pendências do mês atual como texto formatado.

**Query Params:** `token`, `state`, `regional`

---

#### `GET /pendencias_json`
Retorna pendências do mês atual como array JSON.

**Query Params:** `token`, `state`, `regional`

---

#### `GET /pontualidade`
Retorna indicadores de pontualidade como texto formatado.

**Query Params:** `token`, `state`, `regional`

---

#### `GET /pontualidade_json`
Retorna indicadores de pontualidade como array JSON.

**Query Params:** `token`, `state`, `regional`

---

#### `GET /cnl`
Retorna resumo de CNL (Consumo Não Lido) como texto formatado.

**Query Params:** `token`, `state`, `regional`, `dateinit`, `dateend`

---

#### `GET /cnl_to_lido_json`
Retorna registros CNL que transitaram para "Lido".

**Query Params:** `token`, `state`, `regional`, `dateinit`

---

#### `GET /first_cnl_json`
Retorna primeiros CNL registrados no período.

**Query Params:** `token`, `state`, `regional`, `dateinit`, `dateend`

---

#### `GET /c12_json`
Retorna registros C12 (leituras fora de horário).

**Query Params:** `token`, `state`, `regional`, `dateinit`, `dateend`

---

#### `GET /c12_to_lido_json`
Retorna registros C12 que transitaram para "Lido".

**Query Params:** `token`, `state`, `regional`, `dateinit`

---

#### `GET /first_c12_json`
Retorna primeiros C12 registrados no período.

**Query Params:** `token`, `state`, `regional`, `dateinit`, `dateend`

---

#### `GET /fast_c12_json`
Retorna C12 executados em menos de 60 segundos (suspeitos de fraude).

**Query Params:** `token`, `state`, `regional`, `dateinit`, `dateend`

---

#### `GET /licacao_nova_c12_json`
Retorna C12 em ligações novas (instalação cujo código inicia com `200`).

**Query Params:** `token`, `state`, `regional`, `dateinit`, `dateend`

---

#### `GET /e02_json`
Retorna registros E02.

**Query Params:** `token`, `state`, `regional`, `dateinit`, `dateend`

---

#### `GET /c16_json`
Retorna registros C16.

**Query Params:** `token`, `state`, `regional`, `dateinit`, `dateend`

---

#### `GET /perdas`
Retorna resumo de perdas como texto formatado.

**Query Params:** `token`, `state`, `regional`, `dateinit`, `dateend`

---

#### `GET /perdas_json`
Retorna resumo de perdas como array JSON.

**Query Params:** `token`, `state`, `regional`, `dateinit`, `dateend`

---

#### `GET /not_start_services`
Retorna agentes que ainda não iniciaram nenhum serviço no dia.

**Query Params:** `token`, `state`

---

#### `GET /completed_services`
Retorna agentes que concluíram serviços mas têm mais de 10 pendências.

**Query Params:** `token`, `state`

---

#### `GET /incompleted_services`
Retorna agentes com conclusão parcial de serviços.

**Query Params:** `token`, `state`

---

#### `GET /agent_telegram_id`
Retorna o `telegram_id` vinculado a uma matrícula.

**Query Params:** `token`, `state`, `id` (matrícula)

**Retorno:**
```json
{ "telegram_id": 8469360771 }
```
> Retorna `{ "telegram_id": null }` se não encontrado.

---

### Rotas do Agente

**Autenticação:** Telegram (`X-Telegram-Init-Data`)

> ⚠️ Todas as rotas deste grupo requerem o header `X-Telegram-Init-Data`. Sem ele, a resposta será `401`.

---

#### `GET /agent_statistics`
Retorna estatísticas resumidas do agente para o dia.

**Query Params:**

| Param | Tipo | Padrão | Descrição |
|---|---|---|---|
| `date` | string | hoje | Data no formato `DD.MM.YYYY` ou `YYYY-MM-DD` |

**Retorno:**
```json
[
    { "title": "Leituras Realizadas",  "value": 150,   "color": "#00c742ff", "unity": "",    "filter": "all" },
    { "title": "Perdas Geradas",       "value": 250,   "color": "#EF4444",   "unity": "Kwh", "filter": "perdas" },
    { "title": "Quantidade de CNL",    "value": "10",  "color": "#EF4444",   "unity": "",    "filter": "cnl" },
    { "title": "Percentual de CNL",    "value": "6.7", "color": "#EF4444",   "unity": "%",   "filter": "cnl" },
    { "title": "Quantidade de C12",    "value": 5,     "color": "#00c742ff", "unity": "",    "filter": "c12" },
    { "title": "C12 Fora de Horário",  "value": 2,     "color": "#EF4444",   "unity": "",    "filter": "c12_out_time" },
    { "title": "C12 em Ligação Nova",  "value": 1,     "color": "#EF4444",   "unity": "",    "filter": "c12_ligacao_nova" }
]
```

> A cor muda para `#EF4444` (vermelho) quando os valores excedem os limiares: CNL > 6%, C12 fora de horário > 1, perdas > 0, ligação nova > 0.

---

#### `GET /agent_statistics_more`
Retorna estatísticas complementares (C12 rápidos e entrantes).

**Query Params:**

| Param | Tipo | Padrão | Descrição |
|---|---|---|---|
| `date` | string | hoje | Data no formato `DD.MM.YYYY` ou `YYYY-MM-DD` |

**Retorno:**
```json
[
    { "title": "C12 Rápidos",  "value": 3, "color": "#EF4444",   "unity": "", "filter": "fast_c12" },
    { "title": "C12 Entrante", "value": 2, "color": "#EF4444",   "unity": "", "filter": "first_c12" }
]
```

---

#### `GET /agent_services`
Lista de leituras/serviços do agente com paginação e filtro.

**Query Params:**

| Param | Tipo | Padrão | Descrição |
|---|---|---|---|
| `page` | number | `1` | Página |
| `date` | string | hoje | Data no formato `DD.MM.YYYY` ou `YYYY-MM-DD` |
| `filter` | string | `all` | Filtro de tipo de serviço |

**Valores válidos para `filter`:**

| Valor | Descrição |
|---|---|
| `all` | Todos os serviços |
| `cnl` | Apenas CNL |
| `c12` | Apenas C12 |
| `c12_out_time` | C12 fora de horário (antes das 8h) |
| `c12_ligacao_nova` | C12 em ligação nova |
| `fast_c12` | C12 executados em < 60s |
| `first_c12` | Primeiros C12 do dia |
| `perdas` | Serviços com perda prevista > 0 |

**Retorno:** Array de leituras com campos como `instalacao`, `etapa`, `ntlei`, `data_conclusao`, `hora_conclusao`, `perda_prevista_mensal`, `tem_perda`, etc.

---

#### `POST /search_in`
Busca instalações no cadastro por instalação, medidor ou contacontrato.

**Body:**
```json
{
    "type": "instalacao",
    "queries": ["10000001", "10000002"]
}
```

| Campo | Valores válidos |
|---|---|
| `type` | `instalacao`, `medidor`, `contacontrato` |
| `queries` | Array de strings (máximo 10 itens) |

**Retorno:** Array de dados cadastrais (coordenadas, endereço, cliente, etc.).

**Erros:**
- `400` — Nenhuma query fornecida ou limite excedido (> 10)

---

#### `GET /predicted`
Busca serviços com perdas previstas do agente.

**Query Params:**

| Param | Tipo | Padrão | Descrição |
|---|---|---|---|
| `status` | string | `PENDENTE` | Status da perda |
| `page` | number | — | Página |
| `limit` | number | — | Itens por página |

**Retorno:** Lista de serviços com perdas previstas.

---

#### `GET /last_update_agent`
Retorna o horário do último processamento (`abap2_hora`) para uso no app do agente.

**Retorno:**
```json
{ "title": "abap2_hora", "value": "16:30:00" }
```

---

#### `GET /agent_data`
Retorna os dados do colaborador autenticado (matrícula e estado).

**Retorno:**
```json
{ "id": "MATRICULA", "estado": "pi" }
```

---

#### `GET /get_justify`
Consulta justificativas de erros do agente com dados da matriz.

**Query Params:**

| Param | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `instalacao` | string | Não | Filtro por instalação |
| `tipo` | string | Não | Filtro por tipo (ex: `cnl`, `c12`) |
| `data_leit_prev` | string | Não | Filtro por data de leitura prevista (DD/MM/YYYY) |

> O `estado` e `author` são extraídos automaticamente do token de autenticação.

**Retorno (com resultado):**
```json
{
    "id": 1,
    "instalacao": "18518168",
    "tipo": "cnl",
    "motivo": "Medidor com defeito",
    "justificativa": "Realmente estava com defeito",
    "foto": "base64_string",
    "data_leit_prev": "10/04/2026",
    "author": "t19596",
    "estado": "pi",
    "has_justified": true,
    "created_at": "2026-04-12T01:50:22.000Z",
    "updated_at": "2026-04-12T01:50:22.000Z"
}
```

**Retorno (sem resultado):**
```json
{ "has_justified": false }
```

---

#### `POST /create_justify`
Cria uma nova justificativa. Bloqueia duplicatas (mesma instalação + data).

**Body:**
```json
{
    "instalacao": "18518168",
    "data_leit_prev": "10/04/2026",
    "tipo": "cnl",
    "motivo": "Medidor com defeito",
    "justificativa": "Realmente estava com defeito",
    "foto": "base64_string_aqui"
}
```

| Campo | Tipo | Descrição |
|---|---|---|
| `instalacao` | string | Número da instalação |
| `data_leit_prev` | string | Data da leitura prevista (DD/MM/YYYY) |
| `tipo` | string | Tipo de erro (`cnl`, `c12`, etc.) |
| `motivo` | string | Motivo do erro |
| `justificativa` | string | Texto da justificativa |
| `foto` | string | Foto em base64 (opcional) |
| `quantidade` | number | Quantidade de instalações (opcional) |

> O `author` e `estado` são extraídos automaticamente do token.

**Retorno (sucesso):** Objeto da justificativa criada com `id`.

**Erros:**
- `400` — Justificativa já criada para esta instalação e data

---

#### `PUT /update_justify`
Atualiza uma justificativa existente pelo ID.

**Body:**
```json
{
    "id": 1,
    "motivo": "Motivo atualizado",
    "justificativa": "Nova justificativa"
}
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `id` | number | **Sim** | ID da justificativa |
| `instalacao` | string | Não | Nova instalação |
| `tipo` | string | Não | Novo tipo |
| `motivo` | string | Não | Novo motivo |
| `justificativa` | string | Não | Nova justificativa |
| `foto` | string | Não | Nova foto (base64) |
| `data_leit_prev` | string | Não | Nova data |
| `quantidade` | number | Não | Nova quantidade |

> O campo `updated_at` é atualizado automaticamente.

**Retorno (sucesso):** Objeto da justificativa atualizada.

**Erros:**
- `400` — ID da justificativa é obrigatório
- `404` — Justificativa não encontrada

---

#### `DELETE /delete_justify/:id`
Deleta uma justificativa pelo ID.

**URL Params:**

| Param | Tipo | Descrição |
|---|---|---|
| `id` | number | ID da justificativa a deletar |

**Retorno (sucesso):**
```json
{
    "success": true,
    "deleted": { "id": 1, "instalacao": "18518168", "..." : "..." }
}
```

**Erros:**
- `404` — Justificativa não encontrada

---

### Revalidação

**Autenticação:** Token simples (`?token=API_TOKEN`)

---

#### `GET /files_for_revalidate`
Retorna fotos marcadas como suspeitas aguardando revisão.

**Query Params:** `token`

---

#### `POST /revalidate_file`
Registra a validação manual de uma foto suspeita.

**Query Params:** `token`

**Body:**
```json
{
    "instalacao": "12345",
    "data": "10.04.2026",
    "validation": "VERDADEIRO"
}
```

| Campo | Valores |
|---|---|
| `validation` | `VERDADEIRO` ou `FALSO` |

---

#### `GET /filter_options`
Retorna as opções de filtro disponíveis (regionais, seccionais, agentes).

**Query Params:** `token`

---

#### `GET /files_for_view`
Visualiza arquivos filtrados de revalidação.

**Query Params:** `token`, `date`, `regional`, `seccional`, `agent`, `validation`

---

### Webhooks

**Autenticação:** Token simples (`?token=API_TOKEN`)

---

#### `POST /webhook_perdas`
Recebe notificações de perda recuperada e envia mensagem para o WhatsApp.

**Query Params:** `token`

**Body:**
```json
{
    "event": "service.completed",
    "data": {
        "title": "IN:12345",
        "description": "Descrição da perda",
        "completionData": { "foto": "https://url-da-imagem.jpg" }
    }
}
```

> Apenas o evento `service.completed` é processado. Outros eventos retornam `{ "error": "Evento inválido" }`.

---

### Logs (`/api/*`)

**Autenticação:** Header `Authorization: LOGS_PASSWORD`

> Requisições para rotas de log não são registradas no Redis para evitar recursão.

---

#### `POST /api/logs/login`
Valida a senha e retorna o token para uso nas demais rotas de log.

**Body:**
```json
{ "password": "SENHA" }
```

**Retorno (sucesso):**
```json
{ "success": true, "token": "SENHA" }
```

**Retorno (falha):** `401`

---

#### `GET /api/logs/data`
Busca e filtra os últimos 2.000 logs com paginação.

**Headers:** `Authorization: LOGS_PASSWORD`

**Query Params:**

| Param | Tipo | Padrão | Descrição |
|---|---|---|---|
| `page` | number | `1` | Página |
| `limit` | number | `20` | Itens por página |
| `route` | string | — | Filtra por fragmento de URL |
| `status` | number | — | Filtra por HTTP status code |
| `dateStart` | string | — | Data/hora inicial (ISO 8601) |
| `dateEnd` | string | — | Data/hora final (ISO 8601) |

**Retorno:**
```json
{
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5,
    "data": [
        {
            "timestamp": "2026-04-10T18:00:00.000Z",
            "method": "GET",
            "url": "/pendencias?token=...&state=pi",
            "ip": "192.168.1.1",
            "query": {
                "url_query": { "token": "...", "state": "pi" },
                "params": {},
                "body": null
            },
            "status": 200,
            "success": true,
            "duration": "45ms"
        }
    ]
}
```

---

#### `GET /api/logs/export`
Exporta os últimos 5.000 logs filtrados como CSV (com BOM UTF-8 para Excel).

**Headers:** `Authorization: LOGS_PASSWORD`

**Query Params:** `route`, `status`, `dateStart`, `dateEnd`

**Retorno:** Arquivo `logs_api_dinamico.csv`

> O CSV possui colunas dinâmicas para todos os campos presentes em `url_query`, `params` e `body` dos logs exportados. Prefixos: `Q_` (query), `P_` (params), `B_` (body).

---

#### `DELETE /api/logs/clear`
Remove seletivamente logs que correspondem aos filtros informados.

**Headers:** `Authorization: LOGS_PASSWORD`

**Query Params:** `route`, `status`, `dateStart`, `dateEnd`

> Ao menos um filtro é obrigatório. Sem filtros, retorna `400`.

**Retorno:**
```json
{ "success": true, "removedCount": 50 }
```

---

## Variáveis de Ambiente

```env
# Servidor
PORT=3040

# Token de API (consultas, revalidação e webhooks)
API_TOKEN=

# Autenticação Telegram
TELEGRAM_BOT_TOKEN=

# Senha do painel de logs
LOGS_PASSWORD=

# PostgreSQL
PG_CONNECTION_PI=postgresql://user:pass@host:port/leitura
PG_CONNECTION_MA=postgresql://user:pass@host:port/maranhao
PG_CONNECTION_LOCALIZACOES_PI=postgresql://user:pass@host:port/localizacoes

# Redis
REDIS_URL=redis://default:pass@host:port

# Metabase Embed
METABASE_SITE_URL=
METABASE_SECRET_KEY_GERAL=

# WhatsApp (Cattalk)
WHATSAPP_LINK_SEND_FILES=
WHATSAPP_LINK_SEND_TEXT=

# CORS — separar por vírgula, usar * para liberar tudo
# Aceita IPs, domínios e URLs completas; subdomínios são aceitos automaticamente
CORS_ORIGINS=*

# Token admin (uso interno)
ADMIN_TOKEN=

# ID do Telegram para testes E2E
TEST_TELEGRAM_ID=
```

---

## Tabelas do Banco de Dados

| Tabela | Banco | Descrição |
|---|---|---|
| `login` | PI / MA | Colaboradores com `telegram_id`, `id` (matrícula) e `estado` |
| `matriz` | PI / MA | Leituras e serviços (principal) |
| `auditoria` | PI | Fotos e validações de revalidação |
| `cadastro` | PI / MA | Dados cadastrais das instalações |
| `dados_instalacoes` | Localizações PI | Coordenadas e endereços |
| `telegram_tokens` | PI | Tokens manuais de autenticação (criado automaticamente pelo middleware) |
| `justificativas` | PI / MA | Justificativas de erros dos agentes (criada automaticamente) |

---

## Fluxo de Autenticação Telegram

### Desenvolvimento / Teste

```bash
node test_token.js [telegram_id]
```

Cria um token persistente na tabela `telegram_tokens` com validade. Use o valor retornado no header:

```bash
curl http://localhost:3040/agent_data \
     -H "X-Telegram-Init-Data: TOKEN_RETORNADO"
```

### Produção (Mini App Telegram)

1. No frontend: obtenha `window.Telegram.WebApp.initData`
2. Envie no header: `X-Telegram-Init-Data: <initData>`
3. O middleware valida o hash HMAC-SHA256 usando `TELEGRAM_BOT_TOKEN`
4. O `telegram_id` é extraído e consultado na tabela `login`
5. `req.colaborador` fica disponível com `id`, `estado` e `telegramId`

---

## Sistema de Logs (Redis)

Todas as requisições (exceto `/api/logs*` e `/logs*`) são registradas automaticamente no Redis na lista `logs:api` via `logMiddleware`.

**Estrutura de cada log:**
```json
{
    "timestamp": "2026-04-10T18:00:00.000Z",
    "method": "GET",
    "url": "/pendencias?token=...&state=pi",
    "ip": "192.168.1.1",
    "query": {
        "url_query": { "token": "...", "state": "pi" },
        "params": {},
        "body": null
    },
    "status": 200,
    "success": true,
    "duration": "45ms"
}
```

> O campo `body` é incluído apenas em requisições não-GET.

---

## CORS

O CORS é configurado via `CORS_ORIGINS` no `.env`:

- **`*`** — aceita qualquer origem
- **Lista de domínios/IPs** separados por vírgula: `192.168.1.100,https://meusite.com,izi.tec.br`
- Subdomínios são automaticamente aceitos (ex.: `izi.tec.br` aceita `app.izi.tec.br`)
- Requisições sem `Origin` (curl, server-to-server) são sempre aceitas
- Bloqueios CORS geram log: `[CORS BLOQUEADO] IP | HOST | ORIGIN` e retornam `403`
