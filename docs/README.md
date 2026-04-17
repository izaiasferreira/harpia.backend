# cenos — Documentação Completa

> **Sistema SaaS Multi-Tenant** para gerenciamento empresarial com arquitetura modular.

---

## Status de Implementação

| Feature | Status | Progresso |
|---------|--------|-----------|
| [01-architecture.md](./features/01-architecture.md) | ✅ OK | 100% |
| [02-database.md](./features/02-database.md) | ✅ OK | 100% |
| [03-authentication.md](./features/03-authentication.md) | ✅ OK | 100% |
| [04-users.md](./features/04-users.md) | ✅ OK | 100% |
| [05-companies.md](./features/05-companies.md) | ✅ OK | 100% |
| [06-branches.md](./features/06-branches.md) | ✅ OK | 100% |
| [07-permissions.md](./features/07-permissions.md) | ✅ OK | 100% |
| [08-modules.md](./features/08-modules.md) | ✅ OK | 100% |
| [09-audit-logging.md](./features/09-audit-logging.md) | ✅ OK | 100% |
| [10-infrastructure.md](./features/10-infrastructure.md) | ✅ OK | 100% |
| [11-frontend.md](./features/11-frontend.md) | ✅ OK | ~95% |
| [12-testing.md](./features/12-testing.md) | ✅ OK | 100% |
| [13-devops.md](./features/13-devops.md) | ⚠️ PARCIAL | ~60% |
| [14-agent-dashboard.md](./features/14-agent-dashboard.md) | ✅ OK | 100% |
| [15-installation-search.md](./features/15-installation-search.md) | ✅ OK | 100% |

---

## Sistema de Design

### Paleta de Cores

O cenos utiliza **duas cores principais** do design system:

| Cor | Hex | Uso |
|-----|-----|-----|
| **Azul** | `#0031cc` | Cor primária (botões, links, destaques) |
| **Vermelho** | `#ed1c24` | Cor secundária/acento (alertas, badges importantes) |

> ⚠️ **Importante:** Não utilizar roxo (`#9333ea`) ou outras cores para elementos principais.

### Cores Auxiliares

| Cor | Hex | Uso |
|-----|-----|-----|
| Verde | `#10b981` | Sucesso, status ativo |
| Amarelo | `#f59e0b` | Avisos |
| Vermelho | `#ef4444` | Erros, exclusão |

---

## Arquitetura de Ambientes

O cenos possui **dois ambientes distintos**:

| Ambiente | URL Base | Roles | Descrição |
|----------|----------|-------|-----------|
| **Master** | `/master` | SUPER_ADMIN, SUPPORT | Administração global da plataforma |
| **Cliente** | `/client` | COMPANY_ADMIN, USER | Gestão da empresa específica |

### Master (SUPER_ADMIN, SUPPORT)
- Dashboard com métricas globais
- Gerenciamento de empresas
- Criação de usuários (SUPPORT e COMPANY_ADMIN)
- Auditoria global
- Configurações

### Cliente (COMPANY_ADMIN)
- Dashboard da empresa
- Gerenciamento de filiais
- Gerenciamento de usuários da empresa (USER)
- Gerenciamento de permissões
- Configurações

### Cliente (USER)
- Dashboard da empresa
- Configurações (perfil e senha)

---

## Hierarquia de Usuários

| Role | Escopo | Pode criar |
|------|--------|-----------|
| 🔴 **SUPER_ADMIN** | Sistema inteiro | SUPPORT, COMPANY_ADMIN |
| 🟠 **SUPPORT** | Sistema (read-heavy) | COMPANY_ADMIN |
| 🔵 **COMPANY_ADMIN** | Empresa + filiais | USER |
| 🟢 **USER** | Filiais atribuídas | Ninguém |

---

## Regras de Criação de Usuários

| Criador | Pode criar | Onde |
|---------|------------|------|
| SUPER_ADMIN | SUPPORT, COMPANY_ADMIN | /master/users |
| SUPPORT | COMPANY_ADMIN | /master/users |
| COMPANY_ADMIN | USER | /client/users |

---

## Permissões Detalhadas

### SUPER_ADMIN — Administrador Master

| Ação | Permissão |
|------|-----------|
| Empresas | CRUD completo |
| Usuários Master | Criar/editar/excluir/resetar SUPPORT |
| Usuários Empresa | Criar/editar/excluir/resetar COMPANY_ADMIN |
| Ver usuários | Todos (exceto outros SUPER_ADMIN na lista) |
| Permissões | CRUD completo |
| Auditoria | Ver + Exportar |

### SUPPORT — Equipe de Suporte

| Ação | Permissão | Notas |
|------|-----------|-------|
| Ver usuários | COMPANY_ADMIN e USER de todas empresas | Não vê SUPER_ADMIN nem SUPPORT |
| Criar empresa | ✅ | Apenas criar |
| Criar usuário | COMPANY_ADMIN | Com empresa obrigatória |
| Editar usuário | COMPANY_ADMIN | |
| Excluir usuário | COMPANY_ADMIN | |
| Resetar senha | COMPANY_ADMIN | |
| Ver logs | ✅ | Apenas leitura |

### COMPANY_ADMIN — Administrador da Empresa

| Ação | Permissão |
|------|-----------|
| Ver usuários | Apenas usuários da própria empresa |
| Empresa | Editar dados próprios |
| Filiais | CRUD completo |
| Usuários | Apenas USER (criar, editar, excluir, resetar senha) |
| Permissões | CRUD completo |
| Auditoria | Ver da própria empresa |

### USER — Usuário Comum

| Ação | Permissão |
|------|-----------|
| Perfil | Ver + Editar |
| Senha | Alterar |
| Ver usuários | ❌ **NÃO pode ver usuários** |
| Permissões | Ver as atribuídas |

---

## Quick Start

```bash
npm install             # Instala tudo (workspaces)
npm run docker:up       # Sobe PostgreSQL + Redis
npm run db:migrate      # Executa migrations
npm run db:seed         # Dados iniciais
npm run dev             # Backend + Frontend
```

| Serviço | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:3000/api/v1 |
| Drizzle Studio | `npm run db:studio` |

---

## Documentação por Feature

| # | Feature | Documento | Conteúdo |
|---|---------|-----------|----------|
| 1 | **Arquitetura Geral** | [01-architecture.md](./features/01-architecture.md) | Estrutura de pastas, padrão de módulo, middleware stack, variáveis de ambiente, scripts, dependências |
| 2 | **Banco de Dados** | [02-database.md](./features/02-database.md) | ER diagram, schemas Drizzle, índices, seed data, JSONB types |
| 3 | **Autenticação** | [03-authentication.md](./features/03-authentication.md) | JWT flow, todas as rotas (login, refresh, logout, forgot/reset), segurança de senhas, testes E2E |
| 4 | **Usuários** | [04-users.md](./features/04-users.md) | 4 tipos de usuário, matriz de capacidades, CRUD completo, atribuição de filiais/permissões, testes E2E |
| 5 | **Empresas (Tenants)** | [05-companies.md](./features/05-companies.md) | Tenant isolation, CRUD, criação com admin user, stats, testes E2E |
| 6 | **Filiais** | [06-branches.md](./features/06-branches.md) | Hierarquia empresa→filial→usuário, CRUD, isolamento de acesso, testes E2E |
| 7 | **Permissões (RBAC)** | [07-permissions.md](./features/07-permissions.md) | Sistema RBAC, fluxo de autorização, CRUD, cache Redis, middleware authorize, testes E2E |
| 8 | **Sistema de Módulos** | [08-modules.md](./features/08-modules.md) | Feature flags, toggle global/empresa, module guard, registry, testes E2E |
| 9 | **Audit Logging** | [09-audit-logging.md](./features/09-audit-logging.md) | Auto-logging de mutations, sanitização, extração de IP, exportação, retenção, testes E2E |
| 10 | **Infraestrutura** | [10-infrastructure.md](./features/10-infrastructure.md) | PM2 cluster, Nginx reverse proxy, DDoS protection, rate limiting, health check, graceful shutdown |
| 11 | **Frontend** | [11-frontend.md](./features/11-frontend.md) | Design system, componentes UI, pages, guards, Zustand stores, dark mode, responsividade |
| 12 | **Testes** | [12-testing.md](./features/12-testing.md) | Estratégia, setup, factories, testes unitários, E2E backend (Supertest), E2E frontend (Playwright), CI |
| 13 | **DevOps & Scripts** | [13-devops.md](./features/13-devops.md) | Scripts simplificados, setup inicial, deploy, env config, convenções de código, git |

---

## Endpoints Principais

### Auth (`/api/v1/auth`)
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/login` | Login com email/senha |
| POST | `/logout` | Logout (invalida sessão) |
| POST | `/refresh` | Refresh token |
| POST | `/forgot-password` | Esqueci a senha |
| POST | `/reset-password` | Resetar senha |

### Users (`/api/v1/users`)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/` | Lista usuários |
| GET | `/:id` | Detalhes de usuário |
| POST | `/` | Cria novo usuário |
| PUT | `/:id` | Atualiza usuário |
| DELETE | `/:id` | Exclui usuário |
| POST | `/:id/reset-password` | Reseta senha |

### Companies (`/api/v1/companies`)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/` | Lista empresas |
| GET | `/:id` | Detalhes empresa |
| POST | `/` | Cria empresa |
| PUT | `/:id` | Atualiza empresa |
| DELETE | `/:id` | Exclui empresa |

### Branches (`/api/v1/branches`)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/` | Lista filiais |
| POST | `/` | Cria filial |
| PUT | `/:id` | Atualiza filial |
| DELETE | `/:id` | Exclui filial |

### Permissions (`/api/v1/permissions`)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/` | Lista permissões |
| POST | `/` | Cria permissão |
| PUT | `/:id` | Atualiza permissão |
| DELETE | `/:id` | Exclui permissão |

### Audit (`/api/v1/audit`)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/` | Lista logs |
| GET | `/export` | Exporta logs |

### Installations (`/api/v1/installations`)
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/search` | Busca instalações |
| GET | `/history/:instalacao` | Histórico de leituras |
| GET | `/matrix/:instalacao` | Detalhes na matriz |

---

## Scripts Disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Inicia backend + frontend |
| `npm run build` | Build completo para produção |
| `npm run start` | Inicia backend em produção |
| `npm run test` | Testes unitários (usa banco separado `cenos_test`) |
| `npm run db:migrate` | Executa migrations |
| `npm run db:seed` | Dados iniciais |
| `npm run docker:up` | Sobe infraestrutura |
| `npm run lint` | Verifica código |

---

## Estrutura de Diretórios

```
packages/
├── frontend/src/
│   ├── layouts/
│   │   ├── MasterLayout.tsx      # Layout ambiente Master
│   │   └── ClientLayout.tsx     # Layout ambiente Cliente
│   ├── pages/
│   │   ├── Login.tsx            # Página de login
│   │   ├── master/
│   │   │   ├── Dashboard.tsx     # Dashboard Master
│   │   │   ├── Companies.tsx    # Gerenciamento de empresas
│   │   │   ├── Users.tsx        # Criar SUPPORT/COMPANY_ADMIN
│   │   │   ├── Audit.tsx        # Logs de auditoria Master
│   │   │   └── Settings.tsx     # Configurações Master
│   │   └── client/
│   │       ├── Dashboard.tsx     # Dashboard Cliente
│   │       ├── Branches.tsx      # Gerenciamento de filiais
│   │       ├── Users.tsx        # Criar USER da empresa
│   │       ├── Permissions.tsx   # Gerenciamento de permissões
│   │       ├── Installations.tsx  # Busca de instalações (mapa)
│   │       └── Settings.tsx      # Configurações Cliente
│   ├── stores/
│   │   ├── authStore.ts         # Store de autenticação
│   │   └── themeStore.ts        # Store de tema (dark/light)
│   └── config/
│       └── api.ts               # Configuração Axios
│
├── backend/src/
│   ├── modules/
│   │   ├── auth/               # Módulo de autenticação
│   │   ├── users/              # Módulo de usuários
│   │   ├── companies/          # Módulo de empresas
│   │   ├── branches/           # Módulo de filiais
│   │   ├── permissions/         # Módulo de permissões
│   │   ├── modules/            # Módulo de módulos
│   │   └── audit/              # Módulo de auditoria
│   └── db/
│       ├── schema.ts            # Schema Drizzle
│       └── seed.ts              # Dados iniciais
```

---

## Filiais e Estados

### Campo `state` nas Filiais

Cada filial pode pertencer a um estado específico:

| Estado | Descrição | Banco de Dados |
|--------|-----------|----------------|
| `PI` | Piauí | `DATABASE_PI_URL` |
| `MA` | Maranhão | `DATABASE_MA_URL` |

### Múltiplas Filiais por Usuário

Um usuário pode pertencer a **várias filiais simultaneamente** através da tabela `user_branches`. Isso permite:

- Um agente pode atuar em múltiplas filiais do mesmo estado
- Um supervisor pode gerenciar agentes de diferentes filiais
- As permissões são herdadas de todas as filiais atribuídas

### Acesso a Dados por Estado

Quando um agente consulta dados (ex: leituras), o sistema utiliza:
1. As filiais atribuídas ao usuário (`user_branches`)
2. O `state` de cada filial para selecionar o banco de dados correto (PI ou MA)

### Resposta do `/me`

```json
{
  "id": "...",
  "name": "João Silva",
  "role": "USER",
  "branches": [
    { "id": "...", "name": "Filial Teresina", "code": "TER", "state": "PI" },
    { "id": "...", "name": "Filial São Luís", "code": "SLZ", "state": "MA" }
  ],
  "states": ["PI", "MA"],
  "permissions": [...]
}
```

O campo `states` é um array único dos estados das filiais do usuário.

---

## Banco de Dados de Testes

⚠️ **IMPORTANTE**: Os testes usam um banco SEPARADO (`cenos_test`) para evitar perda de dados.

- `.env` → Banco de desenvolvimento (`cenos`)
- `.env.test` → Banco de testes (`cenos_test`)

---

## Licença

Proprietário — cenos © 2026
