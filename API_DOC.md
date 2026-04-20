# Documentação da API Banco

API para gestão de leituras, agentes e monitoria de serviços dos estados do Piauí (PI) e Maranhão (MA).

- **Porta padrão:** `3040`
- **Porta Admin:** `3041`
- **Timezone:** `America/Sao_Paulo`
- **Stack:** Node.js + Express + PostgreSQL + Redis

---

> **⚠️ Mantenha a documentação atualizada!**
> 
> Sempre que corrigir, adicionar ou remover uma feature, atualize esta documentação.
> Isso inclui: novos endpoints, parâmetros, respostas, erros, variáveis de ambiente, etc.

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

Usado nas rotas de consultas gerais.
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

> **Nota:** Todos os endpoints estão disponíveis com ou sem prefixo `/api`.
> Ex: `/pendencias` e `/api/pendencias` retornam o mesmo resultado.

---

### Públicos (sem autenticação)

Rate limit: **60 req/min** por IP.

#### `GET /public/health`
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

#### `GET /public/calendar`
#### `GET /public/feriados`
#### `GET /public/metabase_geral`
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

#### `GET /api/last_update`
#### `GET /api/pendencias`
#### `GET /api/pendencias_json`
#### `GET /api/pontualidade`
#### `GET /api/pontualidade_json`
#### `GET /api/cnl`
#### `GET /api/cnl_to_lido_json`
#### `GET /api/first_cnl_json`
#### `GET /api/c12_json`
#### `GET /api/c12_to_lido_json`
#### `GET /api/first_c12_json`
#### `GET /api/fast_c12_json`
#### `GET /api/licacao_nova_c12_json`
#### `GET /api/e02_json`
#### `GET /api/c16_json`
#### `GET /api/perdas`
#### `GET /api/perdas_json`
#### `GET /api/not_start_services`
#### `GET /api/completed_services`
#### `GET /api/incompleted_services`
Retorna agentes com conclusão parcial de serviços.

**Query Params:** `token`, `state`

---

#### `GET /agent/telegram_id`
#### `GET /agent/dashboard`
#### `GET /agent/statistics`
#### `GET /agent/statistics_more`
#### `GET /agent/services`
#### `GET /agent/data`
Retorna os dados do colaborador autenticado (matrícula e estado).

**Retorno:**
```json
{ "id": "MATRICULA", "estado": "pi" }
```

---

#### `GET /agent/get_justify`
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
    "instalacao": "649945",
    "unidade_leitura": "TH09B011",
    "tipo": "OB",
    "tipo_ordem": null,
    "concluido": "PENDENTE",
    "status_ds": "LG",
    "agente": "T19596",
    "nome_agente": "ANDRE FELIPE MIRANDA COSTA OLIVEIRA",
    "etapa": "09",
    "cidade": "TERESINA",
    "seccional": "UAC TERESINA",
    "regional": "METROPOLITANA",
    "supervisor": "CLEMILTON DE FRANCA FEITOSA",
    "ntlei": "SEM APONTAMENTO",
    "data_leit_prev": "2026-04-15T03:00:00.000Z",
    "data_conclusao": null,
    "latitude": null,
    "longitude": null,
    "perda_prevista_mensal": "49",
    "perda_definitiva": "0",
    "status_perda": "SEM PERDA",
    "apontamento": "C12",
    "grupo_cnl": "MEDIÇÃO",
    "tipo_perda": "CLIENTE CR SEM EVOLUCAO - 113",
    "tem_perda": "SEM PERDA",
    "motivo_perda": "SEM PERDA",
    "mes_ref_atual": "202604",
    "mes_ref_anterior": "202603",
    "has_justified": false
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

### Justify Pending (Pré-criação)

**Autenticação:** Token simples (`?token=API_TOKEN`)

---

#### `POST /justify_pending`
Pré-cria uma justificativa de pendências do dia.

**Body:**
```json
{
    "autor": "AG001",
    "estado": "pi",
    "quantidade": 5,
    "tipo": "cnl",
    "unidade_leitura": "1234567",
    "foto": "https://exemplo.com/foto.jpg"
}
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `autor` | string | **Sim** | Matrícula do agente |
| `estado` | string | **Sim** | Estado (`pi` ou `ma`) |
| `quantidade` | number | **Sim** | Quantidade de pendências |
| `tipo` | string | Não | Tipo de pendência (`cnl`, `c12`, etc.) |
| `unidade_leitura` | string | Não | Código da unidade de leitura |
| `foto` | string | Não | URL da foto |

**Retorno (sucesso):**
```json
{
    "id": 1,
    "autor": "ag001",
    "quantidade": 5,
    "tipo": "cnl",
    "unidade_leitura": "1234567",
    "motivo": null,
    "observacao": null,
    "foto": null,
    "estado": "pi",
    "status": "pendente",
    "created_at": "2026-04-13T10:00:00.000Z",
    "updated_at": "2026-04-13T10:00:00.000Z"
}
```

**Erros:**
- `400` — Autor, estado e quantidade são obrigatórios
- `401` — Token inválido

---

### Justify Pending (Resposta)

**Autenticação:** Telegram Auth (middleware `telegramAuth`)

---

#### `GET /agent/justify_pending/:id`
Consulta uma justificativa de pendências pelo ID.

**URL Params:**

| Param | Tipo | Descrição |
|---|---|---|
| `id` | number | ID da justificativa |

**Retorno (sucesso):** Objeto da justificativa.

**Erros:**
- `404` — Justificativa não encontrada

---

#### `PUT /justify_pending/:id/respond`
Responde uma justificativa de pendências pré-criada.

**URL Params:**

| Param | Tipo | Descrição |
|---|---|---|
| `id` | number | ID da justificativa |

**Body:**
```json
{
    "motivo": "Falta de veículo",
    "observacao": "Veículo quebrou durante a rota",
    "foto": "https://exemplo.com/foto.jpg"
}
```

**Retorno (sucesso):** Objeto da justificativa atualizada com status "respondido".

**Erros:**
- `404` — Justificativa não encontrada
- `409` — Justificativa já foi respondida

---

#### `GET /agent/justify_pending`
Lista justificativas de pendências por autor e/ou status.

**Query Params:**

| Param | Tipo | Padrão | Descrição |
|---|---|---|---|
| `autor` | string | (auto) | Filtrar por autor (padrão: logged in) |
| `status` | string | `pendente` | Filtrar por status: "pendente" ou "respondido" |
| `page` | number | 1 | Página |
| `limit` | number | 20 | Itens por página |

**Retorno (sucesso):**
```json
{
    "data": [...],
    "total": 10,
    "page": 1,
    "limit": 20,
    "totalPages": 1
}
```

---

#### `DELETE /justify_pending/:id`
Deleta uma justificativa de pendências pelo ID.

**URL Params:**

| Param | Tipo | Descrição |
|---|---|---|
| `id` | number | ID da justificativa a deletar |

**Retorno (sucesso):**
```json
{
    "success": true,
    "deleted": { "id": 1, "autor": "AG001", ... }
}
```

**Erros:**
- `404` — Justificativa não encontrada

---

### Daily Report

**Autenticação:** Telegram Auth (middleware `telegramAuth`)

---

#### `POST /daily_report`
Cria um reporte diário de performance (1 por dia).

**Body:**
```json
{
    "nota": 4,
    "motivo": "Boa performance",
    "observacao": "Concluiu todas as tarefas",
    "foto": "https://exemplo.com/foto.jpg"
}
```

**Retorno (sucesso):**
```json
{
    "id": 1,
    "autor": "AG001",
    "nota": 4,
    "motivo": "Boa performance",
    "observacao": "Concluiu todas as tarefas",
    "foto": null,
    "estado": "pi",
    "data_report": "2026-04-13",
    "created_at": "2026-04-13T10:00:00.000Z",
    "updated_at": "2026-04-13T10:00:00.000Z"
}
```

**Erros:**
- `400` — Nota deve ser entre 1 e 5
- `409` — Já existe um report diário para hoje

---

#### `GET /agent/daily_report`
Lista reportes diários por autor e/ou data.

**Query Params:**

| Param | Tipo | Descrição |
|---|---|---|
| `autor` | string | (opcional) Filtrar por autor |
| `data` | string | (opcional) Filtrar por data (YYYY-MM-DD) |
| `limit` | number | (opcional) Limite de resultados (padrão: 10) |

**Retorno (sucesso):** Array de reportes.

---

#### `GET /agent/daily_report/check_today`
Verifica se já existe um reporte diário para hoje.

**Retorno (sucesso):**
```json
{
    "hasReportToday": true,
    "data": { "id": 1, "nota": 4, ... }
}
```

---

#### `DELETE /daily_report/:id`
Deleta um reporte diário pelo ID.

**URL Params:**

| Param | Tipo | Descrição |
|---|---|---|
| `id` | number | ID do reporte a deletar |

**Retorno (sucesso):**
```json
{
    "success": true,
    "deleted": { "id": 1, "autor": "AG001", ... }
}
```

**Erros:**
- `404` — Report não encontrado

---

### Revalidação

**Autenticação:** Token simples (`?token=API_TOKEN`)

---

#### `GET /api/files_for_revalidate`
#### `GET /api/filter_options`
#### `GET /api/files_for_view`
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

---

## Sistema de Usuários, Permissões e Módulos

### Visão Geral

O sistema possui:
- **Roles**: `COMPANY_ADMIN` e `USER`
- **Módulos**: features do código (fixos): `search_in`, `justify`, `create_justify`, `inventory`, `daily_report`, etc.
- **Permissões**: agrupamentos de módulos criados pelo COMPANY_ADMIN
- **Usuários**: recebem permissões que definem acesso aos módulos
- **Filiais (branches)**: regionais/seccionais existentes

### Autenticação JWT

#### Login
```bash
curl -X POST http://localhost:3040/admin/user/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@empresa.com","senha":"senha123"}'
```

**Retorno:**
```json
{
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
        "id": 1,
        "email": "user@empresa.com",
        "nome": "João Silva",
        "role": "USER",
        "estado": "pi"
    }
}
```

#### Requisições Autenticadas
Todas as requisições autenticadas devem usar o header `Authorization: Bearer <token>`.

**Exemplo:**
```bash
curl http://localhost:3040/admin/user/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

### Roles e Permissões

| Role | Descrição |
|------|-----------|
| `COMPANY_ADMIN` | Admin da empresa - acesso total |
| `USER` | Usuário comum - acesso via permissões |

### Módulos Disponíveis

| ID | Nome | Descrição |
|----|----|-----------|
| `search_in` | Busca Instalação | Busca de instalações |
| `update_search_in` | Atualizar Busca Instalação | Editar dados de busca |
| `justify` | Consultar Justificativa | Visualizar justificativas de instalação |
| `create_justify` | Criar Justificativa | Criar novas justificativas |
| `update_justify` | Atualizar Justificativa | Editar justificativas existentes |
| `delete_justify` | Deletar Justificativa | Remover justificativas |
| `justify_pending` | Consultar Pendências | Visualizar justificativas de pendências |
| `daily_report` | Consultar Diário | Visualizar diários de bordo |
| `inventory` | Inventário | Gerenciar inventário de equipamentos |
| `users` | Usuários | Gerenciar usuários do sistema |
| `branches` | Filiais | Gerenciar filiais/regionais |
| `permissions` | Permissões | Gerenciar níveis de acesso |

### Verificação de Módulo

Para endpoints que requerem módulo específico, use:

```javascript
router.post('/endpoint', verifyToken, verifyModule('nome_modulo'), async (req, res) => {
```

O middleware `verifyModule` verifica se o usuário tem o módulo em `req.user.modules` (preenchido por `verifyToken`).

---

## API Routes

### Users

#### `POST /admin/user/login`
Login de usuário.

**Body:**
```json
{
    "email": "user@empresa.com",
    "senha": "senha123"
}
```

---

#### `POST /admin/user/register`
Cria novo usuário (apenas COMPANY_ADMIN).

**Headers:** `Authorization: Bearer <token>`

**Body:**
| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `email` | string | Sim | Email do usuário |
| `senha` | string | Sim | Senha do usuário |
| `nome` | string | Sim | Nome do usuário |
| `role` | string | Não | Papel: `USER` ou `COMPANY_ADMIN` (padrão: `USER`) |
| `estado` | string | Não | Estado: `pi` ou `ma` (padrão: `pi`) |
| `branches` | number[] | Não | IDs das filiais (array) |
| `permissions` | number[] | Não | IDs das permissões (array) |

**Body示例:**
```json
{
    "email": "joao@empresa.com",
    "senha": "senha123",
    "nome": "João Silva",
    "role": "USER",
    "estado": "pi",
    "branches": [1, 2],
    "permissions": [1, 2]
}
```

**Response 201:**
```json
{ "id": 3, "email": "joao@empresa.com", "nome": "João Silva", "role": "USER", "estado": "pi", "ativo": true }
```

---

#### `GET /admin/user/me`
Dados do usuário logado com seus módulos.

**Headers:** `Authorization: Bearer <token>`

---

#### `GET /admin/user/users`
Lista usuários (apenas COMPANY_ADMIN).

---

#### `GET /admin/user/users/:id`
Detalhes de usuário com permissões.

---

#### `PUT /admin/user/users/:id`
Atualiza usuário (apenas COMPANY_ADMIN).

---

#### `PUT /admin/user/users/:id/permissions`
Atribui permissões a usuário.

**Body:**
```json
{ "permissionIds": [1, 2, 3] }
```

---

#### `DELETE /admin/user/users/:id`
Desativa usuário (apenas COMPANY_ADMIN).

---

---

### Branches

### Branches

#### `GET /admin/branch`
Lista filiais (apenas COMPANY_ADMIN).

---

#### `POST /admin/branch`
Cria filial (apenas COMPANY_ADMIN).

**Body:**
```json
{
    "name": "METROPOLITANA",
    "code": "MET",
    "state": "pi"
}
```

---

#### `GET /admin/branch/:id`
Detalhes de filial.

---

#### `PUT /admin/branch/:id`
Atualiza filial.

---

#### `DELETE /admin/branch/:id`
Remove filial.

---

### Permissions

#### `GET /admin/permission`
Lista permissões (apenas COMPANY_ADMIN).

---

#### `POST /admin/permission`
Cria permissão (apenas COMPANY_ADMIN).

**Body:**
```json
{
    "name": "Supervisor",
    "description": "Pode gerenciar justificativas",
    "modules": ["justify", "create_justify", "update_justify", "justify_pending"]
}
```

---

#### `GET /admin/permission/:id`
Detalhes de permissão.

---

#### `PUT /admin/permission/:id`
Atualiza permissão.

---

#### `DELETE /admin/permission/:id`
Remove permissão.

---

## API Admin (Legacy)

**Autenticação:** Basic Auth + Header `x-admin-id`

> Rotas legadas (mantidas para compatibilidade).

### Login

#### `POST /admin/login`
Realiza login e retorna os dados do admin.

**Body:**
```json
{
    "email": "admin@email.com",
    "senha": "senha123"
}
```

**Retorno (sucesso):**
```json
{
    "id": 1,
    "email": "admin@email.com",
    "nome": "Admin Principal",
    "estado": "pi",
    "nivel": "admin"
}
```

**Erros:**
- `400` — Email e senha obrigatórios
- `401` — Credenciais inválidas

---

### Registro

#### `POST /admin/register`
Cria um novo admin. **Apenas para criar o primeiro admin.**

**Body:**
```json
{
    "email": "admin@email.com",
    "senha": "senha123",
    "nome": "Nome do Admin",
    "estado": "pi",
    "nivel": "admin"
}
```

**Retorno (sucesso):** `201` com dados do admin criado.

**Erros:**
- `400` — Email, senha e nome obrigatórios
- `409` — Admin já existe com este email

---

### CRUD de Admins

#### `GET /admin/admins`
Lista todos os admins.

**Query Params:**

| Param | Tipo | Descrição |
|---|---|---|
| estado | string | (opcional) Filtrar por estado |

**Retorno:** Array de admins.

---

#### `PUT /admin/admins/:id`
Atualiza dados de um admin.

**Body:**
```json
{
    "nome": "Novo Nome",
    "estado": "pi",
    "nivel": "admin",
    "ativo": true
}
```

---

#### `PUT /admin/admins/:id/password`
Altera senha de um admin.

**Body:**
```json
{ "senha": "nova_senha" }
```

---

#### `DELETE /admin/admins/:id`
Desativa um admin (soft delete).

---

### Justificativas

#### `GET /admin/justify`
Busca justificativas (same API principal).

**Query Params:** `instalacao`, `tipo`, `data_leit_prev`, `estado`, `author`

---

#### `PUT /admin/justify/:id`
Atualiza uma justificativa.

---

#### `DELETE /admin/justify/:id`
Deleta uma justificativa.

---

### Justify Pending

#### `GET /admin/justify_pending`
Lista justificativas pendentes.

**Query Params:** `autor`, `status`, `page`, `limit`, `estado`

---

### Daily Report

#### `GET /admin/daily_report`
Lista reportes diários.

**Query Params:** `autor`, `data`, `limit`, `estado`

---

### Inventory

#### `GET /admin/inventory`
Busca inventário de agente.

**Query Params:** `agente`, `estado`

---

### Dados do Admin

#### `GET /admin/me`
Retorna dados do admin autenticado.

---

## Variáveis de Ambiente

```env
# Servidor
PORT=3040

# Token de API (consultas)
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

# Admin API JWT
JWT_SECRET=sua_chave_jwt_segura
ADMIN_SECRET=sua_chave_admin_segura

# Admin inicial (criado automaticamente na primeira execução)
ADMIN_EMAIL=admin@empresa.com
ADMIN_SENHA=senha_admin
ADMIN_NOME=Admin Principal

# MinIO/S3 (uploads)
MINIO_ENDPOINT=files.izu.tec.br
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=
MINIO_SECRET_KEY=
MINIO_BUCKET=api-banco-dev

# Token admin (uso interno)
ADMIN_TOKEN=

# ID do Telegram para testes E2E
TEST_TELEGRAM_ID=

# Admin API (criado automaticamente na primeira inicialização)
ADMIN_SECRET=
ADMIN_EMAIL=
ADMIN_SENHA=
ADMIN_NOME=
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

### Inventory

**Autenticação:** Telegram Auth (middleware `telegramAuth`)

---

#### `GET /api/inventory`
Retorna o último registro de inventário do agente.

**Query Params:**

| Param | Tipo | Descrição |
|---|---|---|
| `agente` | string | (opcional) Filtrar por agente específico |

**Retorno (sucesso):**
```json
{
    "id": 1,
    "agente": "t33029830",
    "pda_imei_1": "351234567890123",
    "pda_imei_2": "351234567890124",
    "pda_numero_serie": "PDA123456789",
    "pda_marca": "SAMSUNG",
    "pda_modelo": "SM-1234",
    "pda_numero_chip": "5511999998888",
    "pda_versao_android": "11.0",
    "pda_versao_bluetooth": "5.0",
    "impressora_numero_serie": "PRN987654321",
    "impressora_modelo": "MZ320",
    "impressora_marca": "ZEBRA",
    "estado": "pi",
    "created_at": "2026-04-13T10:00:00.000Z",
    "updated_at": "2026-04-13T10:00:00.000Z"
}
```

**Erros:**
- `404` — Nenhum inventário encontrado para este agente

---

#### `POST /inventory`
Cria ou atualiza registro de inventário (sempre atualiza o mesmo registro).

**Body:**
```json
{
    "agente": "T33029830",
    "pda_imei_1": "351234567890123",
    "pda_imei_2": "351234567890124",
    "pda_numero_serie": "PDA123456789",
    "pda_marca": "SAMSUNG",
    "pda_modelo": "SM-1234",
    "pda_numero_chip": "5511999998888",
    "pda_versao_android": "11.0",
    "pda_versao_bluetooth": "5.0",
    "impressora_numero_serie": "PRN987654321",
    "impressora_modelo": "MZ320",
    "impressora_marca": "ZEBRA"
}
```

**Retorno (sucesso):**
```json
{
    "id": 2,
    "agente": "t33029830",
    ...
    "estado": "pi",
    "created_at": "2026-04-13T11:00:00.000Z",
    "updated_at": "2026-04-13T11:00:00.000Z",
    "action": "updated"
}
```

**Comportamento:**
- Se registro existe → atualiza todos os campos (retorna `action: "updated"`)
- Se não existe → cria novo registro (retorna `action: "created"`)
- Ao criar, remove registros antigos do mesmo agente (mantém apenas o mais recente)

**Erros:**
- `400` — Agente é obrigatório

---

### Upload (MinIO/S3)

**Autenticação:** Token simples (`?token=API_TOKEN`)

---

#### `POST /upload`
Faz upload de arquivo para o MinIO/S3.

**Query Params:**
| Param | Tipo | Descrição |
|---|---|---|
| `token` | string | **Obrigatório** |

**Body:** `multipart/form-data`

| Campo | Tipo | Descrição |
|---|---|---|
| `file` | file | Arquivo (obrigatório) |

**Tipos permitidos:** `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `application/pdf`

**Tamanho máx:** 10MB

**Retorno (sucesso):**
```json
{
    "success": true,
    "fileName": "reports/1234567890-abc.png",
    "url": "http://files.izu.tec.br:9000/api-banco-dev/reports/1234567890-abc.png",
    "size": 6509737,
    "mimetype": "image/png"
}
```

**Retorno (erro):**
```json
{ "error": "Nenhum arquivo enviado" }
```
```json
{ "error": "Tipo de arquivo não permitido" }
```

**Nota:** A URL retornada é pública (acesso sem autenticação). O bucket precisa ter a policy `s3:GetObject` aplicada.

---

#### `POST /admin/upload/upload`
Upload de arquivo (imagem ou PDF) com compressão.

**Headers:** `Authorization: Bearer <token>`

**Body:** `multipart/form-data`

| Campo | Tipo | Descrição |
|---|---|---|
| file | file | Arquivo (máx 10MB) |

**Tipos permitidos:** image/jpeg, image/png, image/gif, image/webp, application/pdf

**Retorno:**
```json
{
    "url": "https://file.izu.tec.br/api-banco-dev/reports/1234567890-abc.jpg",
    "fileName": "reports/1234567890-abc.jpg",
    "originalSize": 1024000,
    "finalSize": 204800
}
```

---

### Upload do Agente

**Autenticação:** Telegram (`X-Telegram-Init-Data`)

---

#### `POST /upload_agent`
Faz upload de arquivo para o MinIO/S3 vinculado ao agente autenticado.

**Headers:** `X-Telegram-Init-Data`

**Body:** `multipart/form-data`

| Campo | Tipo | Descrição |
|---|---|---|
| `file` | file | Arquivo (obrigatório) |

**Tipos permitidos:** `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `application/pdf`

**Tamanho máx:** 10MB

**Path do arquivo:** `agents/{matricula}/{timestamp}-{matricula}-{random}.{ext}`

**Retorno (sucesso):**
```json
{
    "success": true,
    "fileName": "agents/t19596/1234567890-t19596-abc.png",
    "url": "http://files.izi.tec.br:9000/api-banco-dev/agents/t19596/1234567890-t19596-abc.png",
    "size": 6509737,
    "mimetype": "image/png"
}
```

**Retorno (erro):**
```json
{ "error": "Nenhum arquivo enviado" }
```
```json
{ "error": "Tipo de arquivo não permitido" }
```

**Nota:** A URL retornada é pública (acesso sem autenticação). O arquivo é salvo na pasta do agente (agents/{matricula}/).

---

## GET /admin/dashboard

Retorna o dashboard administrativo com estatísticas e widgets.

**Autenticação:** Bearer token (COMPANY_ADMIN)

**Response 200:**
```json
{
    "layout": { "columns": 3, "gap": 16, "baseRowHeight": 165 },
    "widgets": [...]
}
```

---

## POST /admin/search_in

Busca informações de instalações no banco de localizações.

**Autenticação:** Bearer token + módulo `search_in`

**Módulos necessários:** `search_in`

Para usar este endpoint, o usuário precisa ter uma permissão com o módulo `search_in` atribuído.

**Body:**
| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `type` | string | Não | Tipo de busca: `instalacao` (padrão), `medidor`, `contacontrato` |
| `queries` | string[] | Sim | Array de valores para buscar (máx 10) |

**Body示例:**
```json
{
    "type": "instalacao",
    "queries": ["12345678", "87654321"]
}
```

**Response 200:**
```json
[
    {
        "instalacao": "12345678",
        "medidor": "12345678",
        "conta_contrato": "12345678001",
        ...
    }
]
```

---

#### `GET /admin/available_modules`

Lista todos os módulos disponíveis no sistema com seus IDs e nomes amigáveis.

**Autenticação:** Bearer token (COMPANY_ADMIN)

**Response 200:**
```json
[
    { "id": "search_in", "name": "Busca Instalação" },
    { "id": "update_search_in", "name": "Atualizar Busca Instalação" },
    ...
]
```

**Response 400:**
```json
{ "error": "Nenhuma query fornecida" }
```
```json
{ "error": "Limite de consulta excedido (máximo 10)" }
```

---

## GET /admin/justify

Busca justificativas cadastradas.

**Autenticação:** Bearer token + módulo `justify`

**Query Params:**
| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `instalacao` | string | Não | Filtro por agente/autor |
| `tipo` | string | Não | Filtro por tipo |
| `data_leit_prev` | string | Não | Filtro por data (DD/MM/YYYY) |
| `estado` | string | Não | Estado: `pi` ou `ma` |

---

## GET /admin/justify_pending

Lista justificativas pendentes de aprovação.

**Autenticação:** Bearer token + módulo `justify_pending`

**Query Params:**
| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `autor` | string | Não | Filtro por agente |
| `status` | string | Não | Status: `PENDING`, `APPROVED`, `REJECTED` |
| `estado` | string | Não | Estado: `pi` ou `ma` |
| `page` | number | Não | Página (padrão: 1) |
| `limit` | number | Não | Limite (padrão: 20) |

---

## GET /admin/daily_report

Lista relatórios diários dos agentes.

**Autenticação:** Bearer token + módulo `daily_report`

**Query Params:**
| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `autor` | string | Não | Filtro por agente |
| `data` | string | Não | Filtro por data (DD/MM/YYYY) |
| `estado` | string | Não | Estado: `pi` ou `ma` |
| `limit` | number | Não | Limite (padrão: 10) |

---

## GET /admin/inventory

Lista inventário de equipamentos dos agentes.

**Autenticação:** Bearer token + módulo `inventory`

---

## CORS

O CORS é configurado via `CORS_ORIGINS` no `.env`:

- **`*`** — aceita qualquer origem
- **Lista de domínios/IPs** separados por vírgula: `192.168.1.100,https://meusite.com,izi.tec.br`
- Subdomínios são automaticamente aceitos (ex.: `izi.tec.br` aceita `app.izi.tec.br`)
- Requisições sem `Origin` (curl, server-to-server) são sempre aceitas
- Bloqueios CORS geram log: `[CORS BLOQUEADO] IP | HOST | ORIGIN` e retornam `403`
