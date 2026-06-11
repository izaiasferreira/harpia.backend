# LLM Handover - API Banco (Backend)

Este documento foi criado para guiar outra LLM a entender rapidamente o repositório **API Banco**. Ele contém a arquitetura, padrões, estado atual e referências essenciais.

## 1. Visão Geral do Projeto

A **API Banco** é o backend do ecossistema Cenos, servindo tanto os agentes de campo (via Telegram Mini App / APK nativo) quanto o painel administrativo (Control Panel). Atua como camada única de API REST com suporte a WebSockets (Socket.io) para chat em tempo real, múltiplos bancos PostgreSQL (PI, MA e corporativo), cache Redis, armazenamento MinIO/S3 e push notifications via Firebase Cloud Messaging.

## 2. Stack Tecnológica

- **Runtime**: Node.js 20+
- **Framework**: Express 4
- **Banco Principal**: PostgreSQL (pools: `poolCenos`, `poolPi`, `poolMa`, `poolLocPi`)
- **Cache / Logs**: Redis
- **Armazenamento**: MinIO (S3-compatible)
- **Realtime**: Socket.io
- **Push**: Firebase Admin (FCM)
- **Auth**: JWT (admin), hash Telegram (agente), SHA-256 (API tokens)
- **Validação**: Zod 4
- **Upload**: Busboy + Sharp (redimensionamento)
- **LLM**: Modular (OpenAI / Gemini)
- **Testes**: Jest + Supertest

## 3. Estrutura do Repositório

```
src/
  index.js                 # Entry point — inicia servidor HTTP
  app.js                   # Express app — middlewares globais e montagem de routers
  db.js                    # Pools PostgreSQL (pi, ma, localizacoes_pi, cenos)
  redis.js                 # Cliente Redis (logs e rate limit)
  socket.js                # Socket.io (chat, notificações)
  db/
    migrations/            # Migrações SQL versionadas (001-012)
    schemas/               # Schemas Zod de validação (23 arquivos)
  routes/                  # 35+ arquivos de rotas Express
  middlewares/             # auth, jwtAuth, telegramAuth, permissions, logMiddleware, validate
  llm/                     # Módulo LLM modular (factory + providers)
    providers/             # openai.js, gemini.js
    prompts/               # formBuilder.js, serviceNotes.js
  functions/
    database/              # Queries especializadas por módulo (34 arquivos)
    modules.js             # Definição de 50+ módulos de permissão
    firebase.js            # Firebase Admin (FCM)
    minio.js               # Cliente MinIO/S3
    generateDashboard.js   # Montagem SDUI do dashboard do agente
    badges.js              # Lógica de badges
  utils/
    dates.js               # Helpers de formatação de datas
tests/                     # 20 arquivos de teste (Jest + Supertest)
docs/                      # Documentação técnica
```

## 4. Bancos de Dados

Gerenciados em `src/db.js`:

| Pool | Finalidade |
|---|---|
| `poolCenos` | Tabelas corporativas: usuários, agentes, segurança, gamificação, formulários, tracking, chat |
| `poolPi` | Base legada do Piauí — leituras, ordens de serviço |
| `poolMa` | Base legada do Maranhão — leituras, ordens de serviço |
| `poolLocPi` | Dados geográficos do Piauí |

### Padrão de Criação de Tabelas

Toda função de banco chama `createTable()` no início para garantir que a tabela existe (auto-migration pattern). Exemplo:
```javascript
const { createTable } = require('../../db/schemas/security');
// ...
await createTable();
```

## 5. Sistema de Módulos e Permissões

Definido em `src/functions/modules.js`. Cada módulo tem um `id` único usado como chave de permissão. Os módulos são verificados pelo middleware `permissions.js` via `verifyModule(moduleId)`. 50+ módulos cadastrados cobrindo: CRUDs administrativos, segurança, tracking, chat, formulários, badges, ceneduc, service notes, etc.

## 6. Autenticação

| Tipo | Middleware | Como funciona |
|---|---|---|
| Admin | `jwtAuth.js` | JWT (email/senha), token em `Authorization: Bearer <token>` |
| Agente | `telegramAuth.js` | Valida `X-Telegram-Init-Data` (hash HMAC-SHA256) |
| API Pública | `auth.js` | Token SHA-256 via query param `token` ou tabela `api_tokens` |
| Logs | `logMiddleware.js` | Senha estática via `Authorization` header |

## 7. Rotas Principais

| Router | Prefixo | Autenticação | Finalidade |
|---|---|---|---|
| `agente.js` | `/agent/*` | Telegram | App do agente de campo |
| `agentServiceNotes.js` | `/agent/service-notes/*` | Telegram | Notas de serviço do agente |
| `adminModules.js` | `/admin/*` | JWT | Dashboard, CRUDs gerais |
| `adminUsers.js` | `/admin/user/*` | JWT | Usuários admin |
| `adminBranches.js` | `/admin/branch/*` | JWT | Filiais |
| `adminPermissions.js` | `/admin/permission/*` | JWT | Permissões |
| `adminSecurityReports.js` | `/admin/security_reports/*` | JWT | Relatórios de segurança (CRUD) |
| `adminSecurityReportsValidation.js` | `/admin/security_reports/*` | JWT | Validação/resolução de relatórios |
| `adminBadges.js` | `/admin/badge/*` | JWT | Badges |
| `adminCeneduc.js` | `/admin/ceneduc/*` | JWT | Cards CenEduc |
| `adminTracking.js` | `/admin/tracking/*` | JWT | Monitoramento GPS |
| `adminServiceNotes.js` | `/admin/service-notes/*` | JWT | Service notes admin |
| `adminNotifications.js` | `/admin/notifications/*` | JWT | Notificações push |
| `adminMessages.js` | `/admin/messages/*` | JWT | Mensagens multicanal |
| `adminChat.js` | `/admin/chat/*` | JWT | Chat admin (Socket.io complementar) |
| `trainingProjects.js` | `/admin/training/*` | JWT | Treinamentos interativos |
| `forms.js` | `/admin/forms/*` | JWT | Formulários dinâmicos |
| `upload.js` | `/*` | Misto | Upload de arquivos (MinIO) |
| `public.js` | `/public/*` | Nenhuma | Rotas públicas |
| `consultas.js` | `/api/*` | Token simples | Consultas gerais |
| `chat.js` | `/api/chat/*` | Telegram | Chat do agente |

## 8. Fluxo de Upload

Gerenciado por `src/functions/minio.js`:
1. `POST /admin/upload` — upload de arquivo, retorna `{ url: string }`
2. Usa Busboy para parsing multipart + Sharp para redimensionamento de imagens
3. Armazena no bucket MinIO configurado via variáveis de ambiente

## 9. LLM (Inteligência Artificial)

Sistema modular em `src/llm/`:
- **Factory** (`index.js`): seleciona provider via `LLM_PROVIDER` (openai/gemini)
- **Providers**: `openai.js`, `gemini.js` — interface unificada `ask(prompt)`
- **Prompts**: `formBuilder.js` (geração de estrutura de formulários), `serviceNotes.js` (assistente de service notes)
- Usado nos chats IA: `trainingChat.js`, `formChat.js`, `serviceNotesChat.js`

## 10. Tempo Real (Socket.io)

Gerenciado em `src/socket.js`:
- **Handshake**: autenticação via JWT (admin) ou Telegram hash (agente)
- **Salas**: `room_{roomId}` — isolamento por chat
- **Eventos**: `typing_status`, `recording_status`, `online_status`, `send_message`, `chat_message`
- **Append-Only**: mensagens de chat nunca são editadas ou removidas (auditoria)
- **FCM Fallback**: notificação push quando agente está offline

## 11. Testes

20 arquivos em `tests/`, usando Jest + Supertest. Padrão:
```javascript
const request = require('supertest');
const app = require('../src/app');
describe('feature', () => {
  test('deve retornar 200', async () => {
    const res = await request(app).post('/endpoint').send({});
    expect(res.status).toBe(200);
  });
});
```
Rodar com: `npm test` ou `npm run test`.

## 12. Padrões Importantes

### Regra Crítica: Nunca Modificar Rotas Existentes

Sempre criar **novos** arquivos, novas rotas, novas features. Reaproveitar tabelas e funções existentes sem alterar contratos.

### Schemas de Validação (Zod)

Em `src/db/schemas/`, usados com o middleware `validate.js`:
```javascript
router.post('/endpoint', validate(mySchema), handler);
```

### Migrações SQL

Arquivos versionados em `src/db/migrations/` (001-012). Executar com `node src/db/migrations/run.js`.

### Documentação Obrigatória

Conforme `AGENTS.md`:
1. Todo novo endpoint/feature deve ser documentado em `API_DOC.md`
2. Todo novo endpoint/feature deve ter teste correspondente
3. Tabelas devem ser auto-criadas via `createTable()` no início de cada função

## 13. Estado Atual (Junho 2026)

- **30+ rotas** implementadas cobrindo todos os módulos administrativos e de agente
- **LLM modular** funcional com suporte a OpenAI e Gemini
- **Chat em tempo real** com Socket.io + FCM fallback + append-only audit trail
- **Tracking GPS** com background geolocation, isenção de bateria e alertas de proximidade
- **Relatórios de Segurança** com ciclo completo: criação → listagem → resolução com evidências → reabertura
- **Gamificação**: badges e cards CenEduc com verificação de conclusão no servidor
- **Upload de arquivos** via MinIO com redimensionamento Sharp
- **20 testes** automatizados cobrindo rotas críticas
- **Redis** operacional para rate limit e logs de auditoria

## 14. Instruções para a Próxima LLM

1. **Leia `AGENTS.md`** antes de qualquer modificação — contém regras obrigatórias de desenvolvimento
2. **Consulte `docs/ARCHITECTURE.md`** para entender a estrutura completa de diretórios e pools de banco
3. **Consulte `API_DOC.md`** para documentação detalhada de endpoints
4. **Nunca modifique** endpoints, rotas ou funções existentes — crie novos arquivos
5. **Sempre atualize** `API_DOC.md` e crie testes ao adicionar novas features
6. **Sempre chame `createTable()`** no início de funções de banco para garantir que a tabela existe
7. **Use `uploadAdminFile`** no frontend para uploads — nunca envie base64 para o banco

---

*Documento atualizado em: 11/06/2026*
