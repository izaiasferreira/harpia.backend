# 12 — Testes E2E & Estratégia de Testes

> **Ferramentas**: Vitest (unit + integration) | Playwright (E2E frontend) | Supertest (E2E backend)  
> **Cobertura mínima**: 80% lines, 100% das rotas

---

## 12.1. Visão Geral da Estratégia

```mermaid
pyramid
    title Pirâmide de Testes
    "E2E (Frontend)" : 15
    "E2E (Backend API)" : 30
    "Integration" : 25
    "Unit" : 30
```

| Tipo | Ferramenta | Escopo | Quantidade estimada |
|------|-----------|--------|-------------------|
| **Unit** | Vitest | Services, utils, validators | ~60 testes |
| **Integration** | Vitest + DB test container | Service + DB | ~40 testes |
| **E2E Backend** | Vitest + Supertest | Rotas HTTP completas | ~120 testes |
| **E2E Frontend** | Playwright | Fluxos de UI completos | ~50 testes |

**Total estimado: ~270 testes**

---

## 12.2. Setup do Test Environment

### Backend Test Database

```typescript
// test/setup.ts
import { beforeAll, afterAll, beforeEach } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

let testDb: PostgresJsDatabase;

beforeAll(async () => {
  // Usa database de teste separado
  testDb = drizzle(postgres(process.env.TEST_DATABASE_URL));
  await migrate(testDb, { migrationsFolder: './src/db/migrations' });
});

beforeEach(async () => {
  // Limpa todas as tabelas entre testes (order matters due to FK)
  await testDb.delete(auditLogs);
  await testDb.delete(userPermissions);
  await testDb.delete(userBranches);
  await testDb.delete(permissionModules);
  await testDb.delete(companyModules);
  await testDb.delete(sessions);
  await testDb.delete(permissions);
  await testDb.delete(users);
  await testDb.delete(branches);
  await testDb.delete(companies);
  await testDb.delete(modules);
});

afterAll(async () => {
  await testDb.$client.end();
});
```

### Test Factories

```typescript
// test/factories.ts
export const createTestCompany = async (overrides?: Partial<Company>) => {
  return db.insert(companies).values({
    name: 'Test Company',
    slug: `test-${nanoid(6)}`,
    isActive: true,
    ...overrides,
  }).returning();
};

export const createTestUser = async (
  companyId: string,
  role: UserRole = 'USER',
  overrides?: Partial<User>,
) => {
  return db.insert(users).values({
    name: 'Test User',
    email: `test-${nanoid(6)}@test.com`,
    passwordHash: await hashPassword('TestP@ss123'),
    role,
    companyId,
    isActive: true,
    ...overrides,
  }).returning();
};

export const createTestBranch = async (companyId: string, overrides?: Partial<Branch>) => {
  return db.insert(branches).values({
    companyId,
    name: 'Test Branch',
    code: `TB${nanoid(4).toUpperCase()}`,
    isActive: true,
    ...overrides,
  }).returning();
};

export const loginAs = async (app: FastifyInstance, email: string, password = 'TestP@ss123') => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password },
  });
  return JSON.parse(response.payload).data.accessToken;
};
```

---

## 12.3. Testes Unitários (Backend)

### Por Service

```typescript
// modules/auth/auth.service.test.ts
describe('AuthService', () => {
  describe('validateCredentials', () => {
    it('should return user for valid email/password');
    it('should throw for invalid email');
    it('should throw for invalid password');
    it('should throw for inactive user');
  });

  describe('generateTokens', () => {
    it('should generate access token with correct payload');
    it('should generate refresh token');
    it('should create session in database');
  });

  describe('rotateRefreshToken', () => {
    it('should invalidate old token and generate new');
    it('should detect replay attack and invalidate all sessions');
  });
});

// modules/users/users.service.test.ts
describe('UsersService', () => {
  describe('create', () => {
    it('should hash password before storing');
    it('should throw for duplicate email');
    it('should validate role-company relationship');
  });

  describe('assignBranches', () => {
    it('should replace all branch assignments');
    it('should validate branches belong to same company');
  });

  describe('assignPermissions', () => {
    it('should replace all permission assignments');
    it('should invalidate permission cache');
  });
});

// modules/permissions/permissions.service.test.ts
describe('PermissionsService', () => {
  describe('checkUserPermission', () => {
    it('should return true for matching module+action');
    it('should return false for missing module');
    it('should return false for missing action');
    it('should use cache when available');
    it('should query DB when cache miss');
  });
});
```

### Utils

```typescript
describe('Utils', () => {
  describe('password', () => {
    it('should hash password with argon2id');
    it('should verify correct password');
    it('should reject incorrect password');
  });

  describe('jwt', () => {
    it('should sign and verify access token');
    it('should reject expired token');
    it('should reject malformed token');
  });

  describe('ip', () => {
    it('should extract IP from x-forwarded-for');
    it('should extract IP from x-real-ip');
    it('should fallback to request.ip');
  });

  describe('pagination', () => {
    it('should calculate offset from page and limit');
    it('should cap limit at max value');
    it('should calculate totalPages');
  });
});
```

---

## 12.4. Testes E2E Backend (API)

Cada módulo tem seu arquivo de testes E2E. Veja os arquivos individuais:

| Arquivo | Testes | Referência |
|---------|--------|-----------|
| `auth.e2e.test.ts` | ~20 | [03-authentication.md](./03-authentication.md) §3.5 |
| `users.e2e.test.ts` | ~25 | [04-users.md](./04-users.md) §4.3 |
| `companies.e2e.test.ts` | ~20 | [05-companies.md](./05-companies.md) §5.3 |
| `branches.e2e.test.ts` | ~18 | [06-branches.md](./06-branches.md) §6.3 |
| `permissions.e2e.test.ts` | ~22 | [07-permissions.md](./07-permissions.md) §7.4 |
| `modules.e2e.test.ts` | ~20 | [08-modules.md](./08-modules.md) §8.4 |
| `audit.e2e.test.ts` | ~15 | [09-audit-logging.md](./09-audit-logging.md) §9.4 |
| `infrastructure.test.ts` | ~12 | [10-infrastructure.md](./10-infrastructure.md) §10.8 |

### Padrão de Teste E2E

```typescript
// Exemplo: users.e2e.test.ts
describe('Users E2E', () => {
  let app: FastifyInstance;
  let superAdminToken: string;
  let companyAdminToken: string;
  let testCompany: Company;

  beforeAll(async () => {
    app = await buildApp();
    // Setup: criar empresa, users, obter tokens
    testCompany = await createTestCompany();
    const superAdmin = await createTestUser(null, 'SUPER_ADMIN');
    const companyAdmin = await createTestUser(testCompany.id, 'COMPANY_ADMIN');
    superAdminToken = await loginAs(app, superAdmin.email);
    companyAdminToken = await loginAs(app, companyAdmin.email);
  });

  it('should create user', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${companyAdminToken}` },
      payload: {
        name: 'New User',
        email: 'new@test.com',
        password: 'SecureP@ss123',
        role: 'USER',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('New User');
    expect(body.data.role).toBe('USER');
  });
});
```

---

## 12.5. Testes E2E Frontend (Playwright)

### Setup

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './src/__tests__',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
```

### Cenários E2E Frontend

```typescript
// auth.e2e.test.ts
test.describe('Authentication Flow', () => {
  test('should show login page', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('#login-form')).toBeVisible();
  });

  test('should login successfully', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email-input', 'admin@cenos.app');
    await page.fill('#password-input', 'cenos@2024!');
    await page.click('#login-button');
    await expect(page).toHaveURL('/');
    await expect(page.locator('#dashboard-title')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email-input', 'wrong@test.com');
    await page.fill('#password-input', 'wrongpass');
    await page.click('#login-button');
    await expect(page.locator('#login-error')).toBeVisible();
  });

  test('should redirect unauthenticated user to login', async ({ page }) => {
    await page.goto('/users');
    await expect(page).toHaveURL('/login');
  });

  test('should logout successfully', async ({ page }) => {
    // Login first, then logout
    await loginViaUI(page);
    await page.click('#user-menu-button');
    await page.click('#logout-button');
    await expect(page).toHaveURL('/login');
  });
});

// users.e2e.test.ts
test.describe('Users Management', () => {
  test('should list users', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/users');
    await expect(page.locator('#users-table')).toBeVisible();
  });

  test('should create new user', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/users/new');
    await page.fill('#user-name-input', 'New User');
    await page.fill('#user-email-input', 'new@test.com');
    await page.fill('#user-password-input', 'SecureP@ss123');
    await page.click('#submit-user-button');
    await expect(page.locator('#success-toast')).toBeVisible();
  });

  test('should assign branches to user', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/users/USER_ID');
    await page.click('#manage-branches-button');
    await page.click('#branch-checkbox-1');
    await page.click('#save-branches-button');
    await expect(page.locator('#success-toast')).toBeVisible();
  });

  test('should hide create button for users without permission', async ({ page }) => {
    await loginAsNormalUser(page);
    await page.goto('/users');
    await expect(page.locator('#create-user-button')).not.toBeVisible();
  });
});

// permissions.e2e.test.ts
test.describe('Permissions Management', () => {
  test('should create permission with module selection', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/permissions/new');
    await page.fill('#permission-name-input', 'Auditor');
    await page.click('#module-toggle-audit');
    await page.click('#action-read-audit');
    await page.click('#action-export-audit');
    await page.click('#submit-permission-button');
    await expect(page.locator('#success-toast')).toBeVisible();
  });
});

// dark-mode.e2e.test.ts
test.describe('Dark Mode', () => {
  test('should toggle dark mode', async ({ page }) => {
    await loginAsAdmin(page);
    await page.click('#theme-toggle');
    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  test('should persist theme preference', async ({ page }) => {
    // Set dark mode, reload, verify
  });
});
```

---

## 12.6. Configuração Vitest

```typescript
// vitest.config.ts (unit + integration)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.e2e.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
    setupFiles: ['./test/setup.ts'],
  },
});

// vitest.e2e.config.ts (E2E backend)
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.e2e.test.ts'],
    testTimeout: 30000,
    setupFiles: ['./test/setup-e2e.ts'],
    poolOptions: {
      threads: { singleThread: true }, // Sequential for E2E
    },
  },
});
```

---

## 12.7. CI Pipeline (Sugestão)

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: cenos_test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        ports: ['5432:5432']
      redis:
        image: redis:7-alpine
        ports: ['6379:6379']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run db:migrate
      - run: npm run test
      - run: npm run test:e2e
      - run: npx playwright install --with-deps
      - run: npm run test:e2e -w packages/frontend
```
