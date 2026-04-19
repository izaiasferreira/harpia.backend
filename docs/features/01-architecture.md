# 01 — Arquitetura Geral & Estrutura de Pastas
---

## 1.1. Visão Geral

O cenos é estruturado como uma **API REST** express + postgres.

---

## 1.2. Estrutura do Root

```
cenos-api/
├── package.json                   # scripts
├── .env.example                   # Template de variáveis
├── .gitignore
├── docs/                          # Documentação
│   ├── README.md                  # Índice
│   └── features/                  # 1 arquivo por feature
└── src/
    ├── modules/           # Módulos da API
    ├── middleware/        # Middlewares
    ├── db/                # Schema + Migrations
    └── config/            # Configurações
```

---

## 1.3. Padrão de Módulo (Backend)

Cada feature é um **módulo auto-contido** 

Exemplo:
```
modules/<module-name>/
├── <module>.justify_pending.ts # Consuta, preenche justificativas de pendencias...
├── <module>.security_map.ts    # Consuta, preenche mapa de seguranca...
├── <module>.search_installations.ts # Consutar, instalacoes...
├── .... # E mais...
└── __tests__/
    └── <module>.test.ts        # Testes unitários
```

### Fluxo de uma Request

```
Request → Middleware → Route → Controller → Service → Database
                                          ↓
                                    Audit Logger
```

---

## 1.4. Stack de Middleware (Backend)

A ordem de execução dos middleware é crítica:

```
1. request-id          → Gera UUID único por request
2. helmet              → Headers de segurança
3. cors                → Cross-Origin
4. rate-limiter        → Rate limiting por IP/rota
5. authenticate        → Verifica JWT (se rota protegida)
6. module-guard       → Verifica se módulo está ativo
7. authorize           → Verifica role + permissions
8. [Controller]        → Executa a lógica
9. audit-logger       → Loga a ação
10. error-handler      → Trata erros não capturados
```

---

## 1.5. Variáveis de Ambiente

```env
# Server
PORT=3000
NODE_ENV=development
API_PREFIX=/api/v1

# Database (CenOs)
DATABASE_URL=postgresql://user:pass@host:port/cenos

DATABASE_PI_URL=postgresql://user:pass@host:port/leitura
DATABASE_MA_URL=postgresql://user:pass@host:port/maranhao
DATABASE_LOCATIONS_PI=postgresql://user:pass@host:port/localizacoes

# JWT
JWT_SECRET=<random-64-chars>
JWT_EXPIRES_IN=15m

# Security
BCRYPT_ROUNDS=12

# Cors
CORS_ORIGIN=http://localhost:5173
```

---

## 1.6. Scripts Disponíveis

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "db:migrate": "drizzle-kit migrate",
    "db:seed": "tsx src/db/seed.ts"
  }
}
```

---

## 1.7. Dependências

| Pacote                | Uso               |
|-----------------------|-------------------|
| `fastify`             | HTTP framework    |
| `@fastify/cors`       | CORS              |
| `@fastify/helmet`     | Security headers  |
| `@fastify/rate-limit` | Rate limiting     |
| `drizzle-orm`         | ORM               |
| `postgres`            | PostgreSQL driver |
| `zod`                 | Schema validation |
| `jsonwebtoken`        | JWT               |
| `argon2`              | Password hashing  |
| `nanoid`              | ID generation     |
