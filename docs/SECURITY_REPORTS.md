# Security Reports — Backend

Documentação completa do módulo de Relatórios de Segurança.

---

## 1. Banco de Dados

### 1.1. Tabelas

**`security_report`** (criada na migration 005, alterada em 007 e 012)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | `SERIAL PRIMARY KEY` | |
| `autor` | `VARCHAR(50) NOT NULL` | FK → `login(id)` |
| `motivo` | `TEXT NOT NULL` | Tipo de perigo (ex: "Ataque de animais") |
| `observacao` | `TEXT` | Observação opcional do agente |
| `latitude` | `DECIMAL(10,7)` | Coordenada |
| `longitude` | `DECIMAL(10,7)` | Coordenada |
| `estado` | `VARCHAR(2)` | `'pi'` ou `'ma'` |
| `created_at` | `TIMESTAMP DEFAULT NOW()` | |
| `resolvido` | `BOOLEAN DEFAULT FALSE` | Adicionado na migration 012 |
| `resolvido_por` | `VARCHAR(50)` | Login de quem resolveu |
| `resolvido_por_nome` | `TEXT` | Nome de quem resolveu |
| `resolvido_em` | `TIMESTAMP` | Data da resolução |
| `descricao_solucao` | `TEXT` | Descrição da solução |

**`security_report_evidencias`** (criada na migration 012)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | `SERIAL PRIMARY KEY` | |
| `report_id` | `INTEGER NOT NULL` | FK → `security_report(id)` ON DELETE CASCADE |
| `nome_arquivo` | `TEXT NOT NULL` | Nome original |
| `tipo` | `VARCHAR(50) NOT NULL` | `'imagem'` ou `'documento'` |
| `caminho` | `TEXT NOT NULL` | URL no MinIO |
| `created_at` | `TIMESTAMP DEFAULT NOW()` | |

Index: `idx_evidencias_report_id ON security_report_evidencias(report_id)`

**`security_check`** (criada na migration 005, alterada em 007)

| Coluna | Tipo |
|---|---|
| `id` | `SERIAL PRIMARY KEY` |
| `autor` | `VARCHAR(50) NOT NULL FK → login(id)` |
| `latitude` | `DECIMAL(10,7)` |
| `longitude` | `DECIMAL(10,7)` |
| `estado` | `VARCHAR(2) DEFAULT 'pi'` |
| `data_check` | `DATE DEFAULT CURRENT_DATE` |
| `created_at` | `TIMESTAMP DEFAULT NOW()` |
| `updated_at` | `TIMESTAMP DEFAULT NOW()` |

**`mapa_seguranca`** (tabela auxiliar, referenciada em `agentes.js`)

| Coluna | Descrição |
|---|---|
| `localidade` | Município |
| `etapa` | Número da etapa |
| `risco` | Descrição textual do risco |

**`security_report_configs`** (fonte dos tipos de perigo/acidente, mesma usada pelo agente via `GET /agent/v2/config`)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | `SERIAL PRIMARY KEY` | |
| `title` | `VARCHAR(255) NOT NULL` | |
| `config_type` | `VARCHAR(20) DEFAULT 'hazards'` | `hazards` ou `accidents` |
| `estado` | `VARCHAR(2)` | `NULL` = todos os estados |
| `data` | `JSONB NOT NULL DEFAULT '{}'` | `{ perigos: [{valor,cor,ordem}], tipos_acidente: [{valor,ordem}], filters: {cargo,regional,seccional} }` |
| `is_active` | `BOOLEAN DEFAULT true` | |
| `created_at` | `TIMESTAMP DEFAULT NOW()` | |
| `updated_at` | `TIMESTAMP DEFAULT NOW()` | |

**Admin — `GET /admin/security_reports/configs/merged?estado=&regional=&seccional=`**

Retorna `{ perigos, tipos_acidente }` mergeados (dedup por valor, ordenados por `ordem`) das configs ativas compatíveis com o escopo. Usado pelo modal de criação do admin em `/security-reports` (os tipos não são hardcoded no frontend). Módulos: `create_security_report` ou `create_security_accident`.

---

## 2. Schemas Zod

### `src/db/schemas/security.js`

```javascript
const securityReportCreateSchema = z.object({
  autor: z.string().min(1).max(50).transform(v => v.toLowerCase()),
  motivo: z.string().min(1),
  observacao: z.string().nullable().optional(),
  latitude: z.string().nullable().optional(),
  longitude: z.string().nullable().optional(),
  estado: z.enum(['pi', 'ma', 'PI', 'MA']).default('pi').transform(v => v.toLowerCase()),
});
```

### `src/db/schemas/securityValidation.js`

```javascript
const resolverSchema = z.object({
  descricao_solucao: z.string().min(1, 'Descricao da solucao e obrigatoria'),
});
```

---

## 3. Rotas

### 3.1. Admin CRUD — `routes/adminSecurityReports.js`

| Method | Path | Auth | Módulo |
|---|---|---|---|
| `GET` | `/admin/security_reports` | JWT | `security_reports` |
| `POST` | `/admin/security_reports` | JWT | `create_security_report` |
| `DELETE` | `/admin/security_reports/:id` | JWT | `delete_security_report` |

**GET /** — Lista paginada com filtros: `estado`, `search`, `page`, `limit`. Faz JOIN com dados do agente. Escopo: últimos 3 meses.

### 3.2. Admin Validação — `routes/adminSecurityReportsValidation.js`

| Method | Path | Auth | Módulo |
|---|---|---|---|
| `GET` | `/admin/security_reports/dashboard` | JWT | `security_reports` |
| `POST` | `/admin/security_reports/:id/resolver` | JWT | `resolve_security_report` |
| `POST` | `/admin/security_reports/:id/reabrir` | JWT | `resolve_security_report` |
| `GET` | `/admin/security_reports/:id/evidencias` | JWT | `security_reports` |
| `POST` | `/admin/security_reports/:id/evidencias` | JWT | `resolve_security_report` |

**POST /:id/resolver** — Validações:
- `descricao_solucao` obrigatória
- Se `motivo != "Sem Risco"`, `evidencias` deve ser array não-vazio
- Cada evidência: `{ nome_arquivo, tipo, caminho }`

### 3.3. Agente — `routes/agente.js`

| Method | Path | Auth |
|---|---|---|
| `GET` | `/agent/security_report` | Telegram |
| `POST` | `/agent/v2/security_report` | Telegram |
| `POST` | `/agent/v2/accident` | Telegram |
| `POST` | `/agent/v2/annotation` | Telegram |
| `POST` | `/agent/security_check` | Telegram |
| `GET` | `/agent/security_check` | Telegram |
| `GET` | `/agent/security_check/check_today` | Telegram |

**GET /agent/security_report** — Retorna `{ risks_list: string[], points: SecurityRiskPoint[] }`. Os riscos são filtrados por estado do agente e localidades associadas às leituras pendentes. Inclui apenas anotações **não expiradas** (`expires_at IS NULL OR expires_at > NOW()`).

### 3.4. Anotações de Serviço (admin) — `routes/adminServiceAnnotations.js`

| Method | Path | Auth | Módulo |
|---|---|---|---|
| `GET` | `/admin/service_annotations` | JWT | `service_annotations` |
| `POST` | `/admin/service_annotations` | JWT | `create_service_annotation` |
| `POST` | `/admin/service_annotations/import` | JWT | `create_service_annotation` |
| `GET` | `/admin/service_annotations/:id` | JWT | `service_annotations` |
| `POST` | `/admin/service_annotations/:id/resolve` | JWT | `resolve_service_annotation` |
| `POST` | `/admin/service_annotations/:id/reopen` | JWT | `resolve_service_annotation` |
| `POST` | `/admin/service_annotations/:id/archive` | JWT | `delete_service_annotation` |
| `POST` | `/admin/service_annotations/:id/unarchive` | JWT | `delete_service_annotation` |
| `DELETE` | `/admin/service_annotations/:id` | JWT | `delete_service_annotation` |

**Expiração (`expires_at`):** anotações criadas por agentes são sempre ilimitadas (`NULL`). Só admins podem definir `expires_at`. `get_service_annotations_for_agent_state` exclui anotações com `expires_at <= NOW()` — agentes não veem anotações expiradas em `GET /agent/security_report`, mas o admin continua vendo na listagem.

**Arquivamento (`arquivada`):** o admin pode arquivar/desarquivar anotações (`archive_service_annotation`/`unarchive_service_annotation`). `get_service_annotations_for_agent_state` também filtra `sa.arquivada = FALSE` — anotações arquivadas somem do app dos agentes (reversível). Na listagem admin, filtros `pendente`/`tratado` excluem arquivadas e o filtro `status=arquivada` lista apenas arquivadas.

**FK `login`:** ao criar/importar anotações como admin (usuário da tabela `users`, sem linha na tabela `login`), `create_service_annotation` faz upsert defensivo do autor em `login` (INSERT ... ON CONFLICT (id) DO NOTHING) para satisfazer a foreign key.

**Importação (XLSX):** `processServiceAnnotationImport` valida `TIPO` ∈ {Remanejamento, Anotação, Coordenada}, `ESTADO` ∈ {pi, ma}, `IDENTIFICACAO_TIPO` ∈ {Medidor, Instalação, Unidade Consumidora} e `EXPIRA_EM` (AAAA-MM-DD). Retorna `{ totalProcessed, successCount, errorCount, created, errors }`.

---

## 4. Database Functions

### `functions/database/adminSecurityReports.js`

| Função | Descrição |
|---|---|
| `get_security_reports_admin({ user, estado?, page, limit, search? })` | Lista paginada com join + filtros |
| `create_security_report_admin({ autor, motivo, observacao, latitude, longitude, estado })` | Cria relatório |
| `delete_security_report_admin(id, user)` | Deleta (com verificação de permissão por estado) |

### `functions/database/adminSecurityReportsValidation.js`

| Função | Descrição |
|---|---|
| `resolve_security_report({ id, user, descricao_solucao })` | Marca como resolvido |
| `reabrir_security_report({ id, user })` | Reabre (reseta campos de resolução) |
| `add_evidencia({ report_id, nome_arquivo, tipo, caminho })` | Adiciona evidência |
| `get_evidencias(report_id)` | Lista evidências |
| `get_dashboard_stats({ user, estado? })` | 5 queries paralelas: total, resolvidos, pendentes, por tipo, por agente, tendência mensal |

### `functions/database/agentes.js`

| Função | Descrição |
|---|---|
| `create_security_report(data)` | Cria relatório (agente) |
| `get_security_report_points({ user })` | Retorna pontos do estado do agente |
| `get_security_reports({ user })` | Monta `{ risks_list, points }` com join em `mapa_seguranca` |
| `save_security_check({ state, autor, latitude, longitude })` | Cria check diário (1x/dia) |

---

## 5. Permissões (Módulos)

Definidos em `functions/modules.js`:

| Module ID | Descrição |
|---|---|
| `security_reports` | Consultar Relatórios de Segurança |
| `create_security_report` | Criar Relatório de Segurança |
| `delete_security_report` | Deletar Relatório de Segurança |
| `resolve_security_report` | Resolver / Validar Relatório de Segurança |
| `service_annotations` | Consultar Anotações de Serviço |
| `create_service_annotation` | Criar Anotação de Serviço |
| `delete_service_annotation` | Deletar Anotação de Serviço |
| `resolve_service_annotation` | Resolver / Validar Anotação de Serviço |

---

## 6. Testes

### `tests/adminSecurityReports.test.js` (4 testes)

- Criar relatório (POST, 201)
- Listar relatórios (GET, 200)
- Filtrar por estado (GET?estado=pi, 200)
- Deletar relatório (DELETE, 200)

### `tests/adminSecurityReportsValidation.test.js` (6 testes)

- Dashboard stats (GET, 200)
- Resolver sem descrição (POST, 400)
- Resolver sem evidências (POST, 400)
- Resolver com sucesso (POST, 200)
- Reabrir relatório (POST, 200)
- Listar evidências (GET, 200)

### `tests/adminServiceAnnotationsImport.test.js` (4 testes)

- Import sem token (POST, 401)
- Import sem arquivo (POST, 400)
- Import com linhas válidas e inválidas (POST, 200 — 2 sucesso / 1 erro, `expires_at` persistido)
- Import com `EXPIRA_EM` inválido (POST, 200 — erro reportado)

### `tests/serviceAnnotationExpiry.test.js` (4 testes)

- Admin cria anotação com `expires_at` no futuro
- Admin cria anotação já expirada
- Admin cria anotação sem expiração (ilimitada, `NULL`)
- Agente não vê anotação expirada no `GET /agent/security_report`

### `tests/serviceAnnotationArchive.test.js` (7 testes)

- Arquiva sem token (POST, 401)
- Arquiva id inexistente (POST, 404)
- Admin cria anotação visível para o agente
- Admin arquiva anotação (`arquivada: true`)
- Agente não vê anotação arquivada no `GET /agent/security_report`
- Admin vê anotação arquivada na listagem
- Admin desarquiva anotação e agente volta a vê-la

---

*Documento atualizado em: 04/08/2026*
