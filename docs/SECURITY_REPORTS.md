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
| `POST` | `/agent/security_report` | Telegram |
| `GET` | `/agent/security_report` | Telegram |
| `POST` | `/agent/security_check` | Telegram |
| `GET` | `/agent/security_check` | Telegram |
| `GET` | `/agent/security_check/check_today` | Telegram |

**GET /agent/security_report** — Retorna `{ risks_list: string[], points: SecurityRiskPoint[] }`. Os riscos são filtrados por estado do agente e localidades associadas às leituras pendentes.

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

---

*Documento atualizado em: 11/06/2026*
