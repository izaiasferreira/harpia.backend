# 13 — Scripts & DevOps

> **Módulo**: Core  
> **Foco**: Simplicidade de uso (npm run dev, start, build)

---

## 13.1. Scripts Simplificados

### Desenvolvimento Diário

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Inicia backend + frontend simultaneamente |
| `npm run dev:backend` | Apenas backend (hot reload) |
| `npm run dev:frontend` | Apenas frontend (Vite HMR) |
| `npm run docker:up` | Sobe PostgreSQL + Redis via Docker |
| `npm run docker:down` | Para serviços Docker |

### Banco de Dados

| Comando | Descrição |
|---------|-----------|
| `npm run db:generate` | Gera migrations a partir das alterações no schema |
| `npm run db:migrate` | Executa migrations pendentes |
| `npm run db:seed` | Popula banco com dados iniciais |
| `npm run db:studio` | Abre Drizzle Studio (GUI do banco) |

### Testes

| Comando | Descrição |
|---------|-----------|
| `npm run test` | Roda testes unitários + integração (back + front) |
| `npm run test:e2e` | Roda testes E2E (back + front) |
| `npm run test:coverage` | Gera relatório de cobertura |

### Build & Produção

| Comando | Descrição |
|---------|-----------|
| `npm run build` | Build do shared → backend → frontend |
| `npm run start` | Inicia backend em produção (single instance) |
| `npm run start:cluster` | Inicia backend em cluster (PM2) |
| `npm run lint` | Roda ESLint em todo o projeto |

---

## 13.2. Setup Inicial (Passo a Passo)

```bash
# 1. Clone o repositório
git clone <repo-url> cenos
cd cenos

# 2. Instale as dependências (todas de uma vez via workspaces)
npm install

# 3. Configure as variáveis de ambiente
cp .env.example .env
# Edite o .env com suas configurações

# 4. Suba os serviços de infraestrutura
npm run docker:up

# 5. Execute as migrations
npm run db:migrate

# 6. Popule com dados iniciais
npm run db:seed

# 7. Inicie o ambiente de desenvolvimento
npm run dev

# Backend: http://localhost:3000
# Frontend: http://localhost:5173
# Drizzle Studio: npm run db:studio
```

---

## 13.3. Deploy em Produção

### Build

```bash
npm run build
# Output:
# - packages/backend/dist/    → Código compilado do backend
# - packages/frontend/dist/   → SPA estática do frontend
```

### Start com PM2 (Cluster Mode)

```bash
cd packages/backend
pm2 start ecosystem.config.js
pm2 save
pm2 startup    # Configura auto-start no boot
```

### Monitoramento PM2

```bash
pm2 monit       # Dashboard em tempo real
pm2 logs        # Ver logs
pm2 status      # Status das instâncias
pm2 reload all  # Zero-downtime reload
```

### Nginx

```bash
# Copiar config
sudo cp packages/backend/nginx.conf /etc/nginx/sites-available/cenos
sudo ln -s /etc/nginx/sites-available/cenos /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 13.4. Variáveis de Ambiente por Ambiente

### `.env.example`

```env
# === Server ===
PORT=3000
NODE_ENV=development          # development | production | test
API_PREFIX=/api/v1

# === Database ===
DATABASE_URL=postgresql://cenos:cenos@localhost:5432/cenos
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10

# === Redis ===
REDIS_URL=redis://localhost:6379

# === JWT ===
JWT_ACCESS_SECRET=             # Gerar: openssl rand -hex 32
JWT_REFRESH_SECRET=            # Gerar: openssl rand -hex 32
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# === Security ===
ARGON2_MEMORY_COST=65536
ARGON2_TIME_COST=3
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=60000

# === CORS ===
CORS_ORIGIN=http://localhost:5173

# === Logging ===
LOG_LEVEL=info                 # trace | debug | info | warn | error

# === Test (only for test environment) ===
TEST_DATABASE_URL=postgresql://cenos:cenos@localhost:5432/cenos_test
```

### Validação de Env com Zod

```typescript
// config/env.ts
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PREFIX: z.string().default('/api/v1'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  CORS_ORIGIN: z.string().url(),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW: z.coerce.number().default(60000),
});

export const env = envSchema.parse(process.env);
// Falha rápido no startup se faltar variável obrigatória
```

---

## 13.5. Estrutura de Logs (Produção)

```
logs/
├── out.log          # Stdout (PM2)
├── error.log        # Stderr (PM2)
└── access.log       # Nginx access log
```

Log format (Pino JSON):
```json
{
  "level": 30,
  "time": 1705401600000,
  "pid": 12345,
  "hostname": "prod-server-1",
  "reqId": "req_abc123",
  "req": { "method": "POST", "url": "/api/v1/users" },
  "res": { "statusCode": 201 },
  "responseTime": 45,
  "msg": "request completed"
}
```

---

## 13.6. Convenções de Código

### ESLint Config

```json
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "prettier"
  ],
  "rules": {
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/no-explicit-any": "error",
    "no-console": ["warn", { "allow": ["warn", "error"] }]
  }
}
```

### Prettier Config

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

### Naming Conventions

| Tipo | Padrão | Exemplo |
|------|--------|---------|
| Componentes React | PascalCase | `UserCard.tsx` |
| Arquivos | kebab-case | `user-card.tsx` |
| Types/Interfaces | PascalCase | `UserProfile` |
| Funções API | camelCase | `fetchUsers()` |
| Constantes | UPPER_SNAKE_CASE | `MAX_PAGE_SIZE` |
| DB tables | snake_case | `user_permissions` |
| API routes | kebab-case | `/api/v1/forgot-password` |
| Env vars | UPPER_SNAKE_CASE | `DATABASE_URL` |

### Git Commit Convention

```
feat: add user permission assignment
fix: correct tenant isolation in branches query
docs: update auth module documentation
test: add e2e tests for permissions
refactor: extract pagination utility
chore: update dependencies
```

---

## 13.7. Estrutura Final do Monorepo

```
cenos/
├── package.json
├── tsconfig.base.json
├── docker-compose.yml
├── .env.example
├── .gitignore
├── .eslintrc.json
├── .prettierrc
├── docs/
│   ├── README.md              ← Documento mestre (links para todos)
│   └── features/
│       ├── 01-architecture.md
│       ├── 02-database.md
│       ├── 03-authentication.md
│       ├── 04-users.md
│       ├── 05-companies.md
│       ├── 06-branches.md
│       ├── 07-permissions.md
│       ├── 08-modules.md
│       ├── 09-audit-logging.md
│       ├── 10-infrastructure.md
│       ├── 11-frontend.md
│       ├── 12-testing.md
│       └── 13-devops.md       ← Este arquivo
├── packages/
│   ├── shared/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── types/
│   │       ├── enums/
│   │       ├── validators/
│   │       └── index.ts
│   ├── backend/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── drizzle.config.ts
│   │   ├── ecosystem.config.js
│   │   ├── nginx.conf
│   │   ├── vitest.config.ts
│   │   ├── vitest.e2e.config.ts
│   │   └── src/
│   │       ├── index.ts
│   │       ├── app.ts
│   │       ├── config/
│   │       ├── db/
│   │       ├── modules/
│   │       ├── middleware/
│   │       ├── plugins/
│   │       └── utils/
│   └── frontend/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── tailwind.config.ts
│       ├── playwright.config.ts
│       ├── index.html
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── index.css
│           ├── config/
│           ├── hooks/
│           ├── stores/
│           ├── components/
│           ├── modules/
│           └── __tests__/
```
