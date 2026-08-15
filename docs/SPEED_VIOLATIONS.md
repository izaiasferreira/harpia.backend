# Solução de Infrações de Velocidade (Speed Violations) — Backend

Documentação do módulo de **resolução de infrações de velocidade** do agente. Uma resolução cobre **todas** as infrações de um agente em uma determinada data (1 foto de evidência + 1 veredito + 1 descrição).

> **Importante**: A resolução é apenas **anotativa** — os dados brutos de `tracking_session_points` nunca são alterados. O ponto continua visível no mapa (agora verde) com badge de status.

> **Filtro de dados**: pontos com `speed > 120 km/h` são **excluídos** de todas as consultas deste módulo (`/all`, `/resolutions` não, `/stats`) por serem valores fisicamente improváveis (possivelmente ruído de GPS).

---

## 1. Banco de Dados

### 1.1. `speed_violation_resolutions` (migration 068)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | |
| `agent_id` | `VARCHAR(50) NOT NULL` | FK → `login(id)` ON DELETE CASCADE |
| `resolved_date` | `DATE NOT NULL` | Data coberta pela resolução |
| `is_valid` | `BOOLEAN NOT NULL` | `true` = procedente, `false` = não procedente |
| `description` | `TEXT NOT NULL` | O que foi feito |
| `photo_url` | `TEXT NOT NULL` | Evidência (URL MinIO) |
| `violation_ids` | `INTEGER[] NOT NULL DEFAULT '{}'` | IDs dos pontos `tracking_session_points` solucionados |
| `resolved_by` | `INTEGER` | FK → `users(id)` de quem resolveu |
| `resolved_by_nome` | `TEXT` | Nome de quem resolveu |
| `created_at` | `TIMESTAMP DEFAULT NOW()` | |
| `updated_by` | `INTEGER` | FK → `users(id)` de quem editou |
| `updated_at` | `TIMESTAMP` | |

Índices: `idx_speed_resolutions_agent_date` (**UNIQUE** em `agent_id + resolved_date`), `idx_speed_resolutions_date`.

### 1.2. Módulos de permissão

| Módulo | Ação |
|---|---|
| `tracking_speed` | Visualizar violações e resoluções |
| `resolve_speed_violation` | Criar resolução (POST resolve) |
| `update_speed_violation_resolution` | Editar resolução (PUT) |
| `delete_speed_violation_resolution` | Excluir resolução (DELETE) |

---

## 2. Endpoints Admin

Prefixo: `/admin/tracking/*` — Autenticação: `verifyToken()` (JWT Admin) + `verifyModule(...)`.

### 2.1. `GET /admin/tracking/speed_violations/all`

Todas as violações de um intervalo (**sem limite de 500**) com status de resolução embutido (LEFT JOIN por `agente + data`).

**Query params:** `agent_id?`, `from?`, `to?` (ex: `from=2026-01-15 00:00:00`)

**Módulo:** `tracking_speed`

**Response 200:**
```json
[
  {
    "id": 1234,
    "agent_id": "TSPD01",
    "latitude": -5.09,
    "longitude": -42.80,
    "speed": 92.5,
    "speed_limit_applied": 60,
    "recorded_at": "2026-01-15T14:30:00.000Z",
    "is_speed_violation": true,
    "agent_estado": "PI",
    "nome": "JOÃO DA SILVA",
    "regional": "TERESINA",
    "seccional": "CENOP",
    "gestor": "MARIA",
    "resolution_id": "b1f3...",
    "resolution_is_valid": true,
    "resolution_description": "Orientação realizada",
    "resolution_photo_url": "https://minio...",
    "resolution_violation_ids": [1234, 1235],
    "resolution_resolved_by_nome": "Admin",
    "resolution_created_at": "2026-01-16T10:00:00.000Z",
    "resolution_updated_at": null
  }
]
```

### 2.2. `GET /admin/tracking/speed_violations/resolutions`

Histórico de resoluções.

**Query params:** `agent_id?`, `from?`, `to?`

**Módulo:** `tracking_speed`

**Response 200:**
```json
[
  {
    "id": "b1f3...",
    "agent_id": "TSPD01",
    "resolved_date": "2026-01-15",
    "is_valid": true,
    "description": "Orientação realizada",
    "photo_url": "https://minio...",
    "violation_ids": [1234, 1235],
    "resolved_by": 7,
    "resolved_by_nome": "Admin",
    "created_at": "2026-01-16T10:00:00.000Z",
    "updated_by": null,
    "updated_at": null,
    "nome": "JOÃO DA SILVA",
    "agent_estado": "PI"
  }
]
```

### 2.3. `POST /admin/tracking/speed_violations/resolve`

Cria a resolução de **todas** as infrações de um agente em uma data.

**Módulo:** `resolve_speed_violation`

**Body:**
| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `agent_id` | string | sim | Matrícula do agente |
| `date` | string | sim | Data da resolução (YYYY-MM-DD) |
| `is_valid` | boolean | sim | Veredito (`true` = procedente) |
| `description` | string | sim | O que foi feito |
| `photo_url` | string | sim | URL da evidência (MinIO) |
| `violation_ids` | number[] | sim | IDs dos pontos solucionados (não vazio) |

**Response 201:**
```json
{
  "id": "b1f3...",
  "agent_id": "TSPD01",
  "resolved_date": "2026-01-15",
  "is_valid": true,
  "description": "Orientação realizada",
  "photo_url": "https://minio...",
  "violation_ids": [1234, 1235],
  "resolved_by": 7,
  "resolved_by_nome": "Admin",
  "created_at": "2026-01-16T10:00:00.000Z",
  "updated_by": null,
  "updated_at": null
}
```

**Erros comuns:**
- `400` — campo obrigatório ausente / `violation_ids` vazio ou inválido
- `409` — `{ "error": "Já existe resolução para este agente nesta data" }` (constraint UNIQUE)

### 2.4. `PUT /admin/tracking/speed_violations/resolutions/:id`

Edita uma resolução existente e grava `updated_by`/`updated_at`.

**Módulo:** `update_speed_violation_resolution`

**Body:**
| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `is_valid` | boolean | sim | Veredito |
| `description` | string | sim | O que foi feito |
| `photo_url` | string | sim | URL da evidência |
| `violation_ids` | number[] | não | Se enviado, substitui a lista de pontos |

**Response 200:** mesmo modelo do resolve. `404` se não existir.

### 2.5. `DELETE /admin/tracking/speed_violations/resolutions/:id`

Exclui a resolução — as infrações voltam para **pendentes**.

**Módulo:** `delete_speed_violation_resolution`

**Response 200:**
```json
{ "success": true, "id": "b1f3..." }
```

`404` se não existir.

### 2.6. `GET /admin/tracking/speed_violations/stats`

Estatísticas mensais de infrações de velocidade para o **dashboard** (aba Velocidade).

> **Definição:** "1 infração" = **1 par `[agente + data]`**. Os pontos brutos de velocidade são agrupados por agente e dia; o status de resolução vem do LEFT JOIN com `speed_violation_resolutions`. O total de pontos brutos aparece apenas em `topAgents[].points`.

**Query params:** `month` (obrigatório, formato `YYYY-MM`)

**Módulo:** `tracking_speed`

**Response 200:**
```json
{
  "month": "2026-01",
  "summary": {
    "total": 42,
    "resolved": 30,
    "pending": 12,
    "resolutionRate": 71.4
  },
  "perDay": [
    { "day": "2026-01-05", "total": 4, "resolved": 2, "pending": 2 }
  ],
  "perRegional": [
    { "name": "TERESINA", "total": 10, "resolved": 8, "pending": 2 }
  ],
  "perState": [
    { "name": "PI", "total": 30, "resolved": 22, "pending": 8 }
  ],
  "perSeccional": [
    { "name": "CENOP", "total": 6, "resolved": 5, "pending": 1 }
  ],
  "topAgents": [
    { "agent_id": "TSPD01", "nome": "JOÃO DA SILVA", "total": 3, "resolved": 2, "pending": 1, "points": 8 }
  ],
  "daysTracked": 14,
  "avgPerDay": 3.0
}
```

**Erros:** `400` se `month` ausente ou não seguir `YYYY-MM`. Filtra por estado conforme a permissão do admin (mesma lógica dos demais endpoints).

---

## 3. Arquivos

| Arquivo | Descrição |
|---|---|
| `db/migrations/068_speed_violation_resolutions.sql` | Criação da tabela + índices |
| `functions/database/trackingResolutions.js` | Funções de banco (`ensureTable`, `resolveSpeedViolation`, `updateSpeedViolationResolution`, `deleteSpeedViolationResolution`, `listSpeedViolationResolutions`, `getSpeedViolationsResolvable`, `getSpeedViolationMonthlyStats`) |
| `routes/adminTrackingResolutions.js` | Rotas do módulo |
| `tests/trackingSpeedResolutions.test.js` | Testes de integração (resoluções) |
| `tests/trackingSpeedStats.test.js` | Testes de integração (estatísticas mensais) |

## 4. Nota sobre timezone

O JOIN de resolução usa `r.resolved_date = tsp.recorded_at::date`. Como `recorded_at` é UTC, pontos registrados na madrugada (horário local BRT) podem cair no dia anterior ao resolver — verificar se necessário em futuros ajustes.
