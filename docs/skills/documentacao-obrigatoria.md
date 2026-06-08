# Skill: Documentação Obrigatória (Mandatory Documentation)

## Descrição

Toda alteração no código — seja nova feature, novo endpoint, modificação em schema, migration, ou refatoração — **DEVE** ser acompanhada da atualização de TODOS os artefatos de documentação listados abaixo.

## Ativação

Ativada **sempre** que o agente for solicitar a criar, modificar ou remover qualquer código no backend, frontend ou mobile.

## Checklist Obrigatório

### Para cada mudança, verificar e atualizar:

#### 1. OpenAPI / Swagger (`back/docs/openapi.yaml`)
- Novo endpoint? → Adicionar path, method, tags, parameters, requestBody, responses
- Mudou schema de request/response? → Atualizar ou criar schema em `components/schemas/`
- Mudou autenticação? → Atualizar `components/securitySchemes` e `security` no path
- Removeu endpoint? → Remover do openapi.yaml

#### 2. Documentação Markdown (`back/docs/*.md`)
| Arquivo | Quando atualizar |
|---------|-----------------|
| `ENDPOINTS_ADMIN.md` | Novo endpoint admin (`/admin/*`) |
| `ENDPOINTS_AGENT.md` | Novo endpoint agente (`/agent/*`) |
| `ENDPOINTS_PUBLIC.md` | Novo endpoint público (`/public/*`) ou consulta (`/api/*`) |
| `GAMIFICATION_TRAINING.md` | Mudanças em badges, ceneduc, treinamentos |
| `AUTHENTICATION.md` | Mudanças em auth middlewares |
| `ARCHITECTURE.md` | Nova rota, novo módulo, nova estrutura de diretórios |
| `TRACKING.md` | Mudanças em tracking GPS, detecção de quedas |
| `NOTIFICATIONS.md` | Mudanças em push, overlay, notificações |
| `SERVICE_NOTES.md` | Mudanças em service notes |
| `APP_UPDATE.md` | Mudanças em auto-update |
| `ENVIRONMENT.md` | Nova variável de ambiente |
| `API_DOC.md` | **Sempre** que qualquer endpoint for adicionado/alterado |

#### 3. Database Migrations (`back/src/db/migrations/`)
- Nova tabela? → Criar migration com `CREATE TABLE` + `IF NOT EXISTS`
- Nova coluna? → Criar migration com `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- Mudou tipo de coluna? → Migration de alteração
- Toda migration DEVE ser idempotente (`IF NOT EXISTS`)

#### 4. Schemas de Validação (`back/src/db/schemas/`)
- Novo body de request? → Criar schema Zod em `back/src/db/schemas/{modulo}.js`
- Mudou campo obrigatório? → Atualizar schema existente
- Removeu campo? → Remover do schema
- Schemas são usados pelo middleware `validate()` nas rotas

#### 5. Typescript Types (Frontend)
- Nova resposta de API? → Atualizar `front/src/admin/types/admin.ts` e/ou `front/src/types/`
- Novo parâmetro de API? → Atualizar types das funções em `adminApi.ts` / `api.ts`
- Novo model no banco? → Se exposto no front, tipar

#### 6. Testes (`back/tests/`)
- Novo endpoint? → Criar `{feature}.test.js`
- Mudou comportamento? → Atualizar testes existentes ou criar novos
- Cobre happy path + erros (400, 404, 403, 500)
- Usar padrão: `describe('feature')` / `test('descricao', async () => { ... })`

#### 7. Funções de Banco (`back/src/functions/database/`)
- `ensureTable()` chamado no início de cada função de query
- Parâmetros documentados com JSDoc (`@param`, `@returns`)
- SQL com parâmetros nomeados (`$1`, `$2`) — **nunca** concatenar strings

#### 8. Módulos de Permissão
- Nova rota admin que requer módulo? → Registrar módulo em `back/src/functions/modules.js`
- Frontend: Adicionar moduleId em `ModuleIds` no tipo `front/src/admin/types/admin.ts`
- Documentar na seção de módulos do endpoint em `ENDPOINTS_ADMIN.md`

#### 9. Checklist Geral (`aiz/SERVICE_NOTES_CHECKLIST.md`)
- Feature nova? → Adicionar subtarefas com `- [ ]` agrupadas por fase
- Subtarefa concluída? → Marcar com `- [x]`
- Incluir backend + frontend + infra como itens separados
- Nunca remover itens já marcados

## Ordem de Execução

Ao implementar uma mudança, seguir nesta ordem:

1. **Planejamento** — Adicionar ao checklist (`SERVICE_NOTES_CHECKLIST.md`)
2. **Banco** — Migration + schemas Zod + functions de database
3. **Backend** — Rota + middlewares + módulos de permissão
4. **Testes** — Unitários com Jest + Supertest
5. **Frontend** — Types + API calls + páginas/componentes
6. **Documentação Markdown** — Atualizar docs relevantes
7. **OpenAPI/Swagger** — Adicionar/atualizar no openapi.yaml
8. **Verificação** — Rodar `tsc -b` (front) e `npm test` (back)
9. **Checklist** — Marcar subtarefas como concluídas

## Exemplo de Uso

```
usuário: "Adicione um endpoint GET /admin/config/feriados/{id}"

agente:
  1. Adiciona ao checklist
  2. Cria migration (SE necessário)
  3. Adiciona função no database/configs.js
  4. Adiciona rota no adminConfig.js + validação Zod SE necessário
  5. Cria teste em tests/adminConfig.test.js
  6. Documenta em ENDPOINTS_ADMIN.md seção 15
  7. Adiciona path em openapi.yaml
  8. Atualiza API_DOC.md SE necessário
  9. Marca checklist
```
