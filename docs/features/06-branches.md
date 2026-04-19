# 06 — Filiais (Branches)

> **Prefixo de rota**: `/api/v1/branches`

---

## 6.1. Visão Geral

Filiais são subdivisões de uma empresa. Cada filial:
- Pertence a exatamente uma empresa
- Possui um código único dentro da empresa (ex: `FC01`, `FS01`)
- Pode ter múltiplos usuários atribuídos
- Usuários normais só acessam dados das filiais que participam

### Hierarquia

```
Empresa X
├── Filial Centro (FC01)
│   ├── Usuário A ✓
│   ├── Usuário B ✓
│   └── Usuário C ✓
├── Filial Sul (FS01)
│   ├── Usuário A ✓  (participa de 2 filiais)
│   └── Usuário D ✓
└── Filial Norte (FN01)
    └── Usuário E ✓
```

**Usuário A** consegue ver dados de FC01 e FS01, mas **não** de FN01.

---

## 6.2. Rotas

### `GET /api/v1/branches`

**Descrição**: Listar filiais.

**Query Parameters**:
| Param | Tipo | Default | Descrição |
|-------|------|---------|-----------|
| `page` | number | 1 | Página |
| `limit` | number | 20 | Itens por página |
| `search` | string | - | Busca por nome ou código |
| `companyId` | uuid | - | Filtrar por empresa (SUPER_ADMIN/SUPPORT) |
| `isActive` | boolean | - | Filtrar por status |
| `sortBy` | string | `name` | Ordenação |
| `sortOrder` | string | `asc` | Direção |

**Regras de Escopo**:
- `SUPER_ADMIN`/`SUPPORT`: vê todas as filiais (opcionalmente filtrado por empresa)
- `COMPANY_ADMIN`: vê apenas filiais da sua empresa
- `USER`: vê apenas filiais que está atribuído

**Response 200**:
```json
{
  "success": true,
  "data": [
    {
      "id": "01902ghi-...",
      "companyId": "01902def-...",
      "name": "Filial Centro",
      "code": "FC01",
      "state": "pi",
      "isActive": true,
      "userCount": 8,
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 3, "totalPages": 1 }
}
```

---

### `GET /api/v1/branches/:id`

**Descrição**: Detalhe completo da filial.

**Permissão**: `COMPANY_ADMIN` (mesma empresa), `USER` (se atribuído), `SUPER_ADMIN`, `SUPPORT`

**Response 200**:
```json
{
  "success": true,
  "data": {
    "id": "01902ghi-...",
    "company": {
      "id": "01902def-...",
      "name": "Empresa X"
    },
    "name": "Filial Centro",
    "code": "FC01",
    "state": "pi",
    "settings": {},
    "isActive": true,
    "userCount": 8,
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-10T00:00:00Z"
  }
}
```

---

### `POST /api/v1/branches`

**Descrição**: Criar nova filial.

**Permissão**: `SUPER_ADMIN`, `COMPANY_ADMIN` (na própria empresa)

**Request Body**:
```json
{
  "companyId": "01902def-...",
  "name": "Filial Leste",
  "code": "FL01",
  "state": "pi",
  "settings": {}
}
```

**Validação**:
```typescript
const createBranchSchema = z.object({
  companyId: z.string().uuid(),     // COMPANY_ADMIN: auto-fill from tenant context
  name: z.string().min(2).max(255),
  code: z.string().min(2).max(50).regex(/^[A-Z0-9]+$/, 'Código deve ser maiúsculas e números'),
  state: z.string().length(2).optional(),
  settings: z.record(z.unknown()).optional(),
});
```

**Regras de Negócio**:
- `COMPANY_ADMIN`: `companyId` é auto-preenchido pelo tenant context
- Código (`code`) deve ser único dentro da empresa
- Verificar limite de filiais (`settings.maxBranches`)
- Audit log registrado

**Response 201**:
```json
{
  "success": true,
  "data": {
    "id": "01903xyz-...",
    "name": "Filial Leste",
    "code": "FL01",
    "companyId": "01902def-...",
    "isActive": true,
    "createdAt": "2024-01-16T00:00:00Z"
  }
}
```

---

### `PUT /api/v1/branches/:id`

**Descrição**: Atualizar filial.

**Permissão**: `SUPER_ADMIN`, `SUPPORT`, `COMPANY_ADMIN` (própria empresa)

**Request Body** (campos opcionais):
```json
{
  "name": "Filial Centro — Matriz",
  "state": "pi"
}
```

**Regras**:
- Não é possível alterar `code` (imutável após criação)
- Não é possível alterar `companyId`
- `COMPANY_ADMIN` não pode alterar filiais de outra empresa

---

### `DELETE /api/v1/branches/:id`

**Descrição**: Soft delete da filial.

**Permissão**: `SUPER_ADMIN`, `SUPPORT`, `COMPANY_ADMIN` (própria empresa)

**Regras de Negócio**:
- Soft delete: `is_active = false`, `deleted_at` preenchido
- **Remove atribuições** de todos os usuários desta filial (`user_branches`)
- Usuários que perdem a última filial ficam "sem filial" (devem receber nova atribuição)
- Audit log registrado

---

### `GET /api/v1/branches/:id/users`

**Descrição**: Listar usuários atribuídos a uma filial.

**Permissão**: `COMPANY_ADMIN` (própria empresa), `SUPER_ADMIN`, `SUPPORT`

**Response 200**:
```json
{
  "success": true,
  "data": [
    {
      "id": "01902abc-...",
      "name": "João Silva",
      "email": "joao@empresa.com",
      "role": "USER",
      "isActive": true,
      "assignedAt": "2024-01-05T00:00:00Z",
      "assignedBy": {
        "id": "...",
        "name": "Admin"
      }
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 8, "totalPages": 1 }
}
```

---

## 6.3. Testes E2E — Branches

```typescript
describe('Branches Module E2E', () => {
  // List
  describe('GET /api/v1/branches', () => {
    it('should list all branches for SUPER_ADMIN');
    it('should list company branches for COMPANY_ADMIN');
    it('should list only assigned branches for USER');
    it('should filter by search (name)');
    it('should filter by search (code)');
    it('should filter by isActive');
    it('should include userCount');
    it('should return 403 for SUPPORT listing companies (read-only via company detail)');
  });

  // Detail
  describe('GET /api/v1/branches/:id', () => {
    it('should return full branch detail');
    it('should return 404 for non-existent branch');
    it('should return 403 when USER tries to view unassigned branch');
    it('should return 403 when COMPANY_ADMIN views branch from another company');
  });

  // Create
  describe('POST /api/v1/branches', () => {
    it('should create branch as SUPER_ADMIN');
    it('should create branch as COMPANY_ADMIN (auto-fill companyId)');
    it('should return 409 for duplicate code within same company');
    it('should allow same code in different companies');
    it('should return 400 when exceeding maxBranches limit');
    it('should return 422 for invalid code format');
    it('should return 403 for USER and SUPPORT');
    it('should create audit log entry');
  });

  // Update
  describe('PUT /api/v1/branches/:id', () => {
    it('should update branch name and address');
    it('should not allow changing code');
    it('should not allow changing companyId');
    it('should return 403 for other company');
    it('should create audit log with old/new values');
  });

  // Delete
  describe('DELETE /api/v1/branches/:id', () => {
    it('should soft delete branch');
    it('should remove user-branch assignments');
    it('should return 403 for other company');
    it('should create audit log entry');
  });

  // Users
  describe('GET /api/v1/branches/:id/users', () => {
    it('should list users assigned to branch');
    it('should include assignment metadata (assignedAt, assignedBy)');
    it('should return 403 for other company');
    it('should paginate results');
  });
});
```
