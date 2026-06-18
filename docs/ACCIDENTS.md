# Acidentes (Accidents) — Backend

Documentação do módulo de registro de acidentes reportados pelo agente via FAB longo-press.

---

## 1. Banco de Dados

### 1.1. `accidents` (migration 024)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | `SERIAL PRIMARY KEY` | |
| `autor` | `VARCHAR(50) NOT NULL` | FK → `login(id)` ON DELETE CASCADE |
| `tipo` | `VARCHAR(100) NOT NULL` | Ex: "Acidente de moto", "Mordida de animal" |
| `descricao` | `TEXT` | Descrição livre do agente |
| `latitude` | `DECIMAL(10,7)` | Coordenada |
| `longitude` | `DECIMAL(10,7)` | Coordenada |
| `estado` | `VARCHAR(2) DEFAULT 'pi'` | |
| `resolvido` | `BOOLEAN DEFAULT FALSE` | |
| `resolvido_por` | `VARCHAR(50)` | Login de quem resolveu |
| `resolvido_por_nome` | `TEXT` | Nome de quem resolveu |
| `resolvido_em` | `TIMESTAMP` | Data da resolução |
| `descricao_solucao` | `TEXT` | Descrição da solução |
| `created_at` | `TIMESTAMP DEFAULT NOW()` | |

### 1.2. `accident_evidencias` (migration 024)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | `SERIAL PRIMARY KEY` | |
| `accident_id` | `INTEGER NOT NULL` | FK → `accidents(id)` ON DELETE CASCADE |
| `nome_arquivo` | `TEXT NOT NULL` | Nome original |
| `tipo` | `VARCHAR(50) NOT NULL` | `'imagem'` |
| `caminho` | `TEXT NOT NULL` | URL no MinIO |
| `created_at` | `TIMESTAMP DEFAULT NOW()` | |

Índices: `idx_accidents_autor`, `idx_accidents_status`, `idx_accidents_evidencias`

---

## 2. Endpoints do Agente

Prefixo: `/agent/*` — Autenticação: `telegramAuth` → `req.colaborador`

### `POST /agent/accident`

Registra um novo acidente.

**Body:**
```json
{
  "tipo": "Acidente de moto",
  "descricao": "Bati de frente com um carro na BR-316",
  "latitude": "-5.1234567",
  "longitude": "-42.1234567"
}
```

**Response 201:**
```json
{
  "id": 1,
  "autor": "T60702",
  "tipo": "Acidente de moto",
  "descricao": "Bati de frente com um carro na BR-316",
  "latitude": "-5.1234567",
  "longitude": "-42.1234567",
  "estado": "pi",
  "resolvido": false,
  "created_at": "2025-06-18T16:50:00.000Z"
}
```

### `GET /agent/accident`

Lista acidentes do agente autenticado.

**Response 200:**
```json
[
  { "id": 1, "autor": "T60702", "tipo": "...", ... }
]
```

---

## 3. Endpoints Admin

### Rotas Legado — Prefixo: `/admin/tracking/*` (módulo `tracking`)

| Método | Path | Descrição |
|---|---|---|
| `GET` | `/admin/tracking/accidents` | Lista paginada com filtros |
| `GET` | `/admin/tracking/accidents/:id` | Detalhe + evidências |
| `POST` | `/admin/tracking/accidents/:id/resolve` | Marcar como tratado |
| `POST` | `/admin/tracking/accidents/:id/reopen` | Reabrir |

**Query params (GET list):** `estado`, `status` (`pendente`|`tratado`), `search`, `page`, `limit`

**POST /admin/tracking/accidents/:id/resolve — Body:**
```json
{
  "descricao_solucao": "Agente levado ao hospital, sem gravidade.",
  "evidencias": [{ "nome_arquivo": "foto.jpg", "tipo": "imagem", "caminho": "https://minio.cenos.com.br/..." }]
}
```

### Rotas Novas — Prefixo: `/admin/security_reports/accidents/*` (módulo `security_reports`)

Arquivo: `back/src/routes/adminSecurityAccidents.js`

| Método | Path | Descrição |
|---|---|---|
| `GET` | `/admin/security_reports/accidents` | Lista paginada com filtros |
| `GET` | `/admin/security_reports/accidents/:id` | Detalhe + evidências |
| `POST` | `/admin/security_reports/accidents/:id/resolve` | Marcar como tratado |
| `POST` | `/admin/security_reports/accidents/:id/reopen` | Reabrir |

**Query params (GET list)**: `estado`, `status`, `search`, `page`, `limit`

**POST /admin/security_reports/accidents/:id/resolve — Body:**
```json
{
  "descricao_solucao": "Agente levado ao hospital, sem gravidade.",
  "evidencias": [{ "nome_arquivo": "foto.jpg", "tipo": "imagem", "caminho": "https://minio.cenos.com.br/..." }]
}
```

**Response 200** (ambas): Accident object com `evidencias` array.

> Nota: As rotas novas compartilham as mesmas funções de banco (`resolve_accident`, `reopen_accident`, etc.) — são apenas uma re-exposição sob o módulo `security_reports` para uso no SecurityReportsAdmin unificado.
