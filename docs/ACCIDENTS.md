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

Prefixo: `/admin/tracking/*` — Autenticação: JWT + módulo `tracking`

### `GET /admin/tracking/accidents`

Lista acidentes com paginação e filtros.

**Query params:** `estado`, `status` (`pendente`|`tratado`), `search`, `page`, `limit`

**Response 200:**
```json
{
  "accidents": [ { "id": 1, ..., "agent_nome": "João" } ],
  "total": 1,
  "page": 1,
  "limit": 50
}
```

### `GET /admin/tracking/accidents/:id`

Obtém um acidente com evidências.

**Response 200:**
```json
{
  "id": 1,
  "tipo": "...",
  "evidencias": [ { "id": 1, "nome_arquivo": "foto.jpg", "caminho": "..." } ]
}
```

### `POST /admin/tracking/accidents/:id/resolve`

Marca acidente como tratado. Requer descrição + ao menos 1 evidência.

**Body:**
```json
{
  "descricao_solucao": "Agente levado ao hospital, sem gravidade.",
  "evidencias": [
    { "nome_arquivo": "foto.jpg", "tipo": "imagem", "caminho": "https://minio.cenos.com.br/..." }
  ]
}
```

**Response 200:** Accident object com `evidencias` array.

### `POST /admin/tracking/accidents/:id/reopen`

Reabre um acidente tratado.

**Response 200:** Accident object atualizado.
