# 09 — Audit Logging

> **Módulo**: `audit`  
> **Tipo**: Core (não desativável)  
> **Prefixo de rota**: `/api/v1/audit`

---

## 9.1. Visão Geral

**Todas** as ações de mutação no sistema são registradas automaticamente via middleware. Cada log contém:
- **Quem**: user_id, role, nome
- **Quando**: timestamp com timezone
- **De onde**: IP address, user_agent
- **O que**: action, entity_type, entity_id, módulo
- **Como**: request method, path, body (sanitizado), status_code
- **Duração**: duration_ms

### Ações Rastreadas

| Ação | Descrição |
|------|-----------|
| `LOGIN` | Login bem-sucedido |
| `LOGIN_FAILED` | Tentativa falha |
| `LOGOUT` | Logout |
| `CREATE` | Criação de recurso |
| `UPDATE` | Atualização |
| `DELETE` | Soft delete |
| `ASSIGN` | Atribuição (permissão/filial) |
| `UNASSIGN` | Remoção de atribuição |
| `EXPORT` | Exportação de dados |
| `PASSWORD_RESET` | Reset de senha |

### Middleware `audit-logger`

Intercepta **todas as respostas** de rotas protegidas e registra assincronamente (não bloqueia response):

```typescript
async function auditLogger(request: FastifyRequest, reply: FastifyReply) {
  // Só logar mutations (POST, PUT, DELETE) ou erros em GET
  if (request.method === 'GET' && reply.statusCode < 400) return;
  
  const logEntry = {
    userId: request.user?.sub || null,
    companyId: request.tenant?.companyId || null,
    branchId: extractBranchId(request),
    moduleId: extractModuleId(request.url),
    action: resolveAction(request.method, request.url),
    entityType: extractEntityType(request.url),
    entityId: extractEntityId(request),
    ipAddress: extractClientIp(request),
    userAgent: request.headers['user-agent'] || 'unknown',
    requestMethod: request.method,
    requestPath: request.url,
    requestBody: sanitizeBody(request.body), // Remove passwords, tokens
    statusCode: reply.statusCode,
    durationMs: Date.now() - request.startTime,
  };
  
  // Insert assíncrono
  setImmediate(() => {
    db.insert(auditLogs).values(logEntry).catch(logger.error);
  });
}
```

### Sanitização de Dados Sensíveis

Campos `password`, `passwordHash`, `token`, `secret` são substituídos por `***REDACTED***`.

### Extração de IP (com Load Balancer)

```typescript
function extractClientIp(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = typeof forwarded === 'string' ? forwarded.split(',') : forwarded;
    return ips[0].trim();
  }
  return request.headers['x-real-ip'] as string || request.ip || 'unknown';
}
```

---

## 9.2. Rotas

### `GET /api/v1/audit`

**Permissão**: `SUPER_ADMIN`, `SUPPORT`

**Query Parameters**:

| Param | Tipo | Default | Descrição |
|-------|------|---------|-----------|
| `page` | number | 1 | Página |
| `limit` | number | 50 | Itens (max: 200) |
| `userId` | uuid | - | Filtrar por usuário |
| `companyId` | uuid | - | Filtrar por empresa |
| `moduleId` | string | - | Filtrar por módulo |
| `action` | string | - | Filtrar por ação |
| `entityType` | string | - | Filtrar por tipo |
| `ipAddress` | string | - | Filtrar por IP |
| `statusCode` | number | - | Filtrar por status |
| `startDate` | ISO date | - | Data início |
| `endDate` | ISO date | - | Data fim |

**Response 200**:
```json
{
  "success": true,
  "data": [
    {
      "id": "01905abc-...",
      "user": { "id": "...", "name": "João", "email": "joao@emp.com", "role": "COMPANY_ADMIN" },
      "company": { "id": "...", "name": "Empresa X" },
      "moduleId": "users",
      "action": "CREATE",
      "entityType": "user",
      "entityId": "01903xyz-...",
      "ipAddress": "189.45.32.10",
      "requestMethod": "POST",
      "requestPath": "/api/v1/users",
      "requestBody": { "name": "Maria", "password": "***REDACTED***" },
      "statusCode": 201,
      "durationMs": 45,
      "createdAt": "2024-01-16T10:30:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 3421, "totalPages": 69 }
}
```

### `GET /api/v1/audit/company/:companyId`

**Permissão**: `SUPER_ADMIN`, `SUPPORT`, `COMPANY_ADMIN` (própria)

Mesmos filtros. COMPANY_ADMIN só vê logs da própria empresa.

### `GET /api/v1/audit/user/:userId`

**Permissão**: `SUPER_ADMIN`, `SUPPORT`

Logs de um usuário específico.

### `GET /api/v1/audit/export`

**Permissão**: `SUPER_ADMIN`

| Param | Tipo | Default |
|-------|------|---------|
| `format` | string | `json` | `csv` ou `json` |

- Máximo 100.000 registros por exportação
- Streaming response
- Rate limited: 5 exportações/hora
- A exportação é registrada no audit log

---

## 9.3. Retenção

| Plano | Período |
|-------|---------|
| Default | 90 dias |
| Extended | 1 ano |

Cron job diário às 03:00 deleta logs antigos.

---

## 9.4. Testes E2E

```typescript
describe('Audit Module E2E', () => {
  describe('GET /api/v1/audit', () => {
    it('should list logs with pagination for SUPER_ADMIN');
    it('should return 403 for COMPANY_ADMIN');
    it('should filter by userId, companyId, moduleId, action');
    it('should filter by date range');
    it('should filter by ipAddress and statusCode');
    it('should sanitize sensitive data');
    it('should include user and company details');
  });

  describe('GET /api/v1/audit/company/:companyId', () => {
    it('should list company-scoped logs for COMPANY_ADMIN');
    it('should return 403 for other company');
  });

  describe('GET /api/v1/audit/user/:userId', () => {
    it('should list user-specific logs');
    it('should return 403 for non-SUPER_ADMIN');
  });

  describe('GET /api/v1/audit/export', () => {
    it('should export as CSV');
    it('should export as JSON');
    it('should limit to 100000 records');
    it('should return 429 after rate limit');
    it('should log the export action itself');
  });

  describe('Automatic Audit Logging', () => {
    it('should log user creation');
    it('should log login with IP');
    it('should log failed login');
    it('should log permission assignment');
    it('should log permission assignment');
    it('should sanitize passwords');
    it('should record duration');
    it('should not block response');
  });
});
```
