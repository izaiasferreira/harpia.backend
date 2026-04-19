# 07 — Permissões

> **Módulo**: `permissions`  
> **Prefixo de rota**: `/api/v1/permissions`

---

## 7.1. Visão Geral

O sistema funciona assim:

1. **Módulo** = feature do código (imutável): `search_in`, `justify_pending`, `installations`, etc
2. **Permissão** = agrupamento de módulos criado pelo COMPANY_ADMIN
3. **Usuário** = recebe permissões

### Fluxo

```
COMPANY_ADMIN cria Permission:
├── "Leitor"     → modules: ["search_in", "justify_pending"]
├── "Supervisor"  → modules: ["search_in", "create_justify", "edit_justify"]
└── "Gestor"     → modules: ["search_in", "justify_pending", "installations", "audit"]

Usuário receives:
├── Permission: "Supervisor"
└── Permission: "Leitor"
    → Access to: search_in + create_justify + edit_justify + justify_pending
```

Um usuário pode receber **múltiplas permissões**.

---

## 7.2. Rotas

### `GET /api/v1/permissions`

**Descrição**: Listar permissões da empresa.

**Permissão**: `COMPANY_ADMIN` (própria), `SUPER_ADMIN`

**Query Parameters**:
| Param | Tipo | Default | Descrição |
|-------|------|---------|-----------|
| `page` | number | 1 | Página |
| `limit` | number | 20 | Itens por página |
| `search` | string | - | Busca por nome |

**Response 200**:
```json
{
  "success": true,
  "data": [
    {
      "id": "01902mno-...",
      "name": "Leitor",
      "slug": "leitor",
      "description": "Pode visualizar informações",
      "modules": ["search_in", "justify_pending"],
      "userCount": 5,
      "createdAt": "2024-01-05T00:00:00Z"
    },
    {
      "id": "01902pqr-...",
      "name": "Supervisor",
      "slug": "supervisor",
      "description": "Pode criar e editar justificativas",
      "modules": ["search_in", "create_justify", "edit_justify"],
      "userCount": 3,
      "createdAt": "2024-01-05T00:00:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 2, "totalPages": 1 }
}
```

---

### `GET /api/v1/permissions/:id`

**Descrição**: Detalhe da permissão com usuários atribuídos.

**Response 200**:
```json
{
  "success": true,
  "data": {
    "id": "01902mno-...",
    "name": "Supervisor",
    "slug": "supervisor",
    "description": "Pode criar e editar justificativas",
    "modules": ["search_in", "create_justify", "edit_justify"],
    "users": [
      {
        "id": "01902abc-...",
        "name": "João Silva",
        "email": "joao@empresa.com",
        "assignedAt": "2024-01-05T00:00:00Z"
      }
    ],
    "createdAt": "2024-01-05T00:00:00Z",
    "updatedAt": "2024-01-05T00:00:00Z"
  }
}
```

---

### `POST /api/v1/permissions`

**Descrição**: Criar permissão (agrupamento de módulos).

**Request Body**:
```json
{
  "name": "Auditor",
  "description": "Pode visualizar auditoria",
  "modules": ["audit", "installations"]
}
```

**Validação**:
```typescript
const createPermissionSchema = z.object({
  name: z.string().min(2).max(255),
  description: z.string().max(500).optional(),
  modules: z.array(z.string()).min(1),
});
```

**Regras de Negócio**:
- `slug` é gerado automaticamente
- `slug` deve ser único na empresa
- Audit log registrado

**Response 201**:
```json
{
  "success": true,
  "data": {
    "id": "01903xyz-...",
    "name": "Auditor",
    "slug": "auditor",
    "modules": ["audit", "installations"],
    "createdAt": "2024-01-16T00:00:00Z"
  }
}
```

---

### `PUT /api/v1/permissions/:id`

**Descrição**: Atualizar permissão.

**Request Body**:
```json
{
  "name": "Auditor Avançado",
  "modules": ["audit", "installations", "users"]
}
```

---

### `DELETE /api/v1/permissions/:id`

**Descrição**: Soft delete da permissão.

---

## 7.3. Atribuir Permissões a Usuário

### `PUT /api/v1/users/:id/permissions`

**Descrição**: Atribuir/remover permissões de um usuário.

**Request Body**:
```json
{
  "permissionIds": ["01902mno-...", "01902pqr-..."]
}
```

**Regras de Negócio**:
- Substitui Todas as permissões (full sync)
- Array vazio remove Todas
- COMPANY_ADMIN só pode atribuir permissões da própria empresa

---

## 7.4. Testes E2E

```typescript
describe('Permissions', () => {
  describe('GET /api/v1/permissions', () => {
    it('should list permissions for COMPANY_ADMIN');
  });

  describe('POST /api/v1/permissions', () => {
    it('should create permission with modules');
  });

  describe('PUT /api/v1/users/:id/permissions', () => {
    it('should assign permissions to user');
    it('should replace all permissions');
  });
});
```