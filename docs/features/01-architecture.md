# 01 — Arquitetura Geral & Estrutura de Pastas

> **Módulo**: Core  
> **Dependências**: Nenhuma  
> **Desativável**: ❌ (Core do sistema)

---

## 1.1. Visão Geral

O cenos é estruturado como um **monorepo** usando npm workspaces com 3 pacotes:

| Pacote | Caminho | Descrição |
|--------|---------|-----------|
| `@cenos/shared` | `packages/shared` | Types, enums, validators compartilhados |
| `@cenos/backend` | `packages/backend` | API Fastify + PostgreSQL |
| `@cenos/frontend` | `packages/frontend` | React + Vite + TailwindCSS |

### Justificativa do Monorepo

- **Type Safety end-to-end**: Types de request/response compartilhados entre front e back
- **Consistência**: Validators Zod reutilizados em ambos os lados
- **DX**: Um único `npm install`, scripts unificados no root

---

## 1.2. Estrutura do Root

```
cenos/
├── package.json                    # workspaces: ["packages/*"]
├── tsconfig.base.json              # compilerOptions compartilhadas
├── docker-compose.yml              # PostgreSQL 16 + Redis 7
├── .env.example                    # Template de variáveis
├── .gitignore
├── .eslintrc.json                  # ESLint config compartilhada
├── .prettierrc                     # Prettier config
├── docs/                           # Documentação
│   ├── README.md                   # Este arquivo (index)
│   └── features/                   # 1 arquivo por feature
└── packages/
    ├── shared/
    ├── backend/
    └── frontend/
```

---

## 1.3. Padrão de Módulo (Backend)

Cada feature do backend é um **módulo auto-contido** que segue a estrutura:

```
modules/<module-name>/
├── <module>.routes.ts          # Definição de rotas Fastify
├── <module>.controller.ts      # Handlers HTTP (req/res)
├── <module>.service.ts         # Lógica de negócio
├── <module>.schema.ts          # Validação Zod + JSON Schema
└── __tests__/
    ├── <module>.service.test.ts    # Testes unitários
    └── <module>.e2e.test.ts        # Testes de integração
```

### Fluxo de uma Request

```
Request → Middleware Stack → Route → Controller → Service → Database
                                         ↓
                                   Audit Logger
```

### Registro de Módulos

Os módulos são registrados dinamicamente via um **Module Registry**:

```typescript
// plugins/module-registry.ts
interface ModuleDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  routes: (app: FastifyInstance) => void;
  isCore: boolean;  // Core modules cannot be disabled
}

// Cada módulo exporta sua definição
export const authModule: ModuleDefinition = {
  id: 'auth',
  name: 'Autenticação',
  description: 'Login, logout, refresh token, reset password',
  version: '1.0.0',
  routes: registerAuthRoutes,
  isCore: true,
};
```

O registry verifica no banco se o módulo está **ativo para o tenant atual** antes de processar a request (via `module-guard` middleware).

---

## 1.4. Padrão de Módulo (Frontend)

Cada feature do frontend é carregada via **lazy loading**:

```
modules/<module-name>/
├── pages/                      # Páginas do módulo
│   ├── <page>-page.tsx
│   └── ...
├── components/                 # Componentes específicos do módulo
│   ├── <component>.tsx
│   └── ...
└── services/                   # Chamadas API do módulo
    └── <module>-service.ts
```

### Lazy Loading

```typescript
// config/routes.ts
const UsersListPage = lazy(() => import('../modules/users/pages/users-list-page'));
const UserDetailPage = lazy(() => import('../modules/users/pages/user-detail-page'));
```

### Module Guard (Frontend)

```tsx
// components/guards/module-guard.tsx
<ModuleGuard moduleId="users">
  <UsersListPage />
</ModuleGuard>
// Se o módulo estiver desativado, mostra tela de "módulo indisponível"
```

---

## 1.5. Stack de Middleware (Backend)

A ordem de execução dos middleware é crítica:

```
1. request-id          → Gera UUID único por request
2. helmet              → Headers de segurança
3. cors                → Cross-Origin
4. rate-limiter        → Rate limiting por IP/rota
5. authenticate        → Verifica JWT (se rota protegida)
6. tenant-context      → Injeta company_id/branch_ids no contexto
7. module-guard        → Verifica se módulo está ativo
8. authorize           → Verifica role + permissions
9. [Controller]        → Executa a lógica
10. audit-logger       → Loga a ação (after response)
11. error-handler      → Trata erros não capturados
```

---

## 1.6. Variáveis de Ambiente

```env
# Server
PORT=3000
NODE_ENV=development
API_PREFIX=/api/v1

# Database
DATABASE_URL=postgresql://cenos:cenos@localhost:5432/cenos
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_ACCESS_SECRET=<random-64-chars>
JWT_REFRESH_SECRET=<random-64-chars>
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Security
BCRYPT_ROUNDS=12
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=60000

# Cors
CORS_ORIGIN=http://localhost:5173

# Logging
LOG_LEVEL=info
```

---

## 1.7. Scripts Simplificados

### Root (`package.json`)

```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\"",
    "dev:backend": "npm run dev -w packages/backend",
    "dev:frontend": "npm run dev -w packages/frontend",
    "build": "npm run build -w packages/shared && npm run build -w packages/backend && npm run build -w packages/frontend",
    "start": "npm run start -w packages/backend",
    "test": "npm run test -w packages/backend && npm run test -w packages/frontend",
    "test:e2e": "npm run test:e2e -w packages/backend && npm run test:e2e -w packages/frontend",
    "db:migrate": "npm run db:migrate -w packages/backend",
    "db:seed": "npm run db:seed -w packages/backend",
    "lint": "eslint packages/*/src --ext .ts,.tsx",
    "docker:up": "docker-compose up -d",
    "docker:down": "docker-compose down"
  }
}
```

### Backend (`packages/backend/package.json`)

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "start:cluster": "pm2 start ecosystem.config.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "vitest run --config vitest.e2e.config.ts",
    "test:coverage": "vitest run --coverage",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:seed": "tsx src/db/seed.ts",
    "db:studio": "drizzle-kit studio"
  }
}
```

### Frontend (`packages/frontend/package.json`)

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "lint": "eslint src --ext .ts,.tsx"
  }
}
```

---

## 1.8. Docker Compose (Desenvolvimento)

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: cenos
      POSTGRES_PASSWORD: cenos
      POSTGRES_DB: cenos
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U cenos"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
  redisdata:
```

---

## 1.9. Dependências Planejadas

### Backend
| Pacote | Versão | Uso |
|--------|--------|-----|
| `fastify` | ^5.x | HTTP framework |
| `@fastify/cors` | ^10.x | CORS |
| `@fastify/helmet` | ^13.x | Security headers |
| `@fastify/rate-limit` | ^10.x | Rate limiting |
| `@fastify/cookie` | ^11.x | Cookie handling (refresh token) |
| `@fastify/swagger` | ^9.x | OpenAPI docs |
| `drizzle-orm` | ^0.35.x | ORM |
| `drizzle-kit` | ^0.28.x | Migrations |
| `postgres` | ^3.4.x | PostgreSQL driver |
| `ioredis` | ^5.x | Redis client |
| `zod` | ^3.23.x | Schema validation |
| `jsonwebtoken` | ^9.x | JWT |
| `argon2` | ^0.40.x | Password hashing |
| `pino` | ^9.x | Logging (built into Fastify) |
| `nanoid` | ^5.x | ID generation |
| `dayjs` | ^1.11.x | Date handling |

### Frontend
| Pacote | Versão | Uso |
|--------|--------|-----|
| `react` | ^19.x | UI library |
| `react-dom` | ^19.x | DOM rendering |
| `react-router-dom` | ^7.x | Routing |
| `tailwindcss` | ^4.x | CSS framework |
| `lucide-react` | ^0.460.x | Icons |
| `axios` | ^1.7.x | HTTP client |
| `zustand` | ^5.x | State management (lightweight) |
| `react-hook-form` | ^7.x | Form handling |
| `zod` | ^3.23.x | Validation (shared) |
| `@hookform/resolvers` | ^3.x | Zod + React Hook Form |
| `sonner` | ^1.x | Toast notifications |
| `date-fns` | ^4.x | Date formatting |

### Dev Dependencies
| Pacote | Uso |
|--------|-----|
| `vitest` | Unit/integration tests |
| `@playwright/test` | E2E tests (frontend) |
| `supertest` | HTTP tests (backend) |
| `typescript` | Type checking |
| `tsx` | TypeScript execution (dev) |
| `concurrently` | Run multiple scripts |
| `eslint` | Linting |
| `prettier` | Formatting |
