# cenos — Documentação da API

> **Sistema SaaS Multi-Tenant** para gerenciamento empresarial com arquitetura modular.

---

## Ambientes

| Ambiente    | Roles                | Descrição                 |
|-------------|----------------------|---------------------------|
| **Master**  | SUPER_ADMIN, SUPPORT | Administração global      |
| **Cliente** | COMPANY_ADMIN, USER  | Gestão empresa específica |

---

## Hierarquia de Usuários

| Role            | Escopo               | Pode criar                   |
|-----------------|----------------------|------------------------------|
| SUPER_ADMIN     | Sistema inteiro      | SUPPORT, COMPANY_ADMIN, USER |
| SUPPORT         | Sistema (read-heavy) | COMPANY_ADMIN, USER          |
| COMPANY_ADMIN   | Empresa + filiais    | USER                         |
| USER            | Filiais atribuídas   | -                            |

---

## Regras de Criação de Usuários

| Criador         | Pode criar                   |
|-----------------|------------------------------|
| SUPER_ADMIN     | SUPPORT, COMPANY_ADMIN, USER |
| SUPPORT         | COMPANY_ADMIN, USER          |
| COMPANY_ADMIN   | USER                         |
| USER            | -                            |

---

## Permissões Detalhadas

### SUPER_ADMIN
| Ação             | Permissão                                  |
|------------------|--------------------------------------------|
| Empresas         | CRUD completo                              |
| Usuários Master  | Criar/editar/excluir/resetar SUPPORT       |
| Usuários Empresa | Criar/editar/excluir/resetar COMPANY_ADMIN |
| Permissões       | CRUD completo                              |
| Auditoria        | Ver + Exportar                             |
| Ver logs         | TODOS                                      |

### SUPPORT
| Ação             | Permissão                                  |
|------------------|--------------------------------------------|
| Ver usuários     | COMPANY_ADMIN e USER de todas empresas     |
| Criar empresa    | ✅                                         |
| Criar usuário    | COMPANY_ADMIN                              |
| Editar usuário   | COMPANY_ADMIN                              |
| Excluir usuário  | COMPANY_ADMIN                              |
| Ver logs         | -                             |

### COMPANY_ADMIN
| Ação             | Permissão                                  |
|------------------|--------------------------------------------|
| Empresa          | Editar dados próprios                      |
| Filiais          | CRUD completo                              |
| Usuários         | Apenas USER                                |
| Permissões       | CRUD completo                              |

### USER
| Ação             | Permissão                                  |
|------------------|--------------------------------------------|
| Perfil           | Ver + Editar                               |
| Senha            | Alterar                                    |
| Permissões       | Ver as atribuídas                          |

---

## Endpoints da API

Base URL: `/api/v1`

### Auth (`/api/v1/auth`)
| Método | Rota               | Descrição               |
|--------|--------------------|-------------------------|
| POST   | `/login`           | Login com email/senha   |
| POST   | `/logout`          | Logout                  |
| POST   | `/reset-password`  | Resetar senha           |
| GET    | `/me`              | Dados do usuário logado |

### Users (`/api/v1/users`)
| Método | Rota                  | Descrição               |
|--------|-----------------------|-------------------------|
| GET    | `/`                   | Lista usuários          |
| GET    | `/:id`                | Detalhes de usuário     |
| POST   | `/`                   | Cria novo usuário       |
| PUT    | `/:id`                | Atualiza usuário        |
| DELETE | `/:id`                | Exclui usuário          |
| POST   | `/:id/reset-password` | Reseta senha            |
| PUT    | `/:id/branches`       | Atribui filiais         |
| PUT    | `/:id/permissions`    | Atribui permissões      |

### Companies (`/api/v1/companies`)
| Método | Rota   | Descrição        |
|--------|--------|------------------|
| GET    | `/`    | Lista empresas   |
| GET    | `/:id` | Detalhes empresa |
| POST   | `/`    | Cria empresa     |
| PUT    | `/:id` | Atualiza empresa |
| DELETE | `/:id` | Exclui empresa   |

### Branches (`/api/v1/branches`)
| Método | Rota   | Descrição       |
|--------|------  |-----------------|
| GET    | `/`    | Lista filiais   |
| GET    | `/:id` | Detalhes filial |
| POST   | `/`    | Cria filial     |
| PUT    | `/:id` | Atualiza filial |
| DELETE | `/:id` | Exclui filial   |

### Permissions (`/api/v1/permissions`)
| Método | Rota       | Descrição                 |
|--------|------------|---------------------------|
| GET    | `/`        | Lista permissões          |
| GET    | `/:id`     | Detalhes permissão        |
| GET    | `/modules` | Lista módulos disponíveis |
| POST   | `/`        | Cria permissão            |
| PUT    | `/:id`     | Atualiza permissão        |
| DELETE | `/:id`     | Exclui permissão          |

### Modules (`/api/v1/modules`)
| Método | Rota                  | Descrição                  |
|--------|-----------------------|----------------------------|
| GET    | `/`                   | Lista módulos              |
| PUT    | `/company/toggle`     | Habilita/desabilita módulo |

### Audit (`/api/v1/audit`)
| Método | Rota      | Descrição      |
|--------|-----------|----------------|
| GET    | `/`       | Lista logs     |
| GET    | `/export` | Exporta logs   |


---

## Filiais e Estados

### Campo `state` nas Filiais

| Estado | Descrição | Banco de Dados    |
|--------|-----------|-------------------|
| `pi`   | Piauí     | `PG_CONNECTION_PI` |
| `ma`   | Maranhão  | `PG_CONNECTION_MA` |

### Múltiplas Filiais por Usuário

Um usuário pode pertencer a **várias filiais simultaneamente**.

### Resposta do `/me`

```json
{
  "id": "...",
  "name": "João Silva",
  "role": "USER",
  "branches": [
    { "id": "...", "name": "METROPOLITANA", "code": "MET", "state": "pi" },
    { "id": "...", "name": "NORTE", "code": "NOR", "state": "ma" }
  ],
  "states": ["pi", "ma"],
  "permissions": [...]
}
```

---

## Variáveis de Ambiente

```env
DATABASE_URL=postgresql://...
PG_CONNECTION_PI=postgresql://...  # Banco Piauí
PG_CONNECTION_MA=postgresql://...  # Banco Maranhão
DATABASE_LOCATIONS_PI=postgresql://...  # Localizações Piauí
JWT_SECRET=your-secret
PORT=3000
```

---

## Scripts Disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Inicia em desenvolvimento |
| `npm run build` | Build para produção |
| `npm run start` | Inicia em produção |
| `npm run test` | Testes unitários |
| `npm run db:migrate` | Executa migrations |
| `npm run db:seed` | Dados iniciais |
| `npm run lint` | Verifica código |

---

## Documentação por Feature

| Feature | Documento |
|---------|------------|
| Arquitetura | [01-architecture.md](./features/01-architecture.md) |
| Banco de Dados | [02-database.md](./features/02-database.md) |
| Autenticação | [03-authentication.md](./features/03-authentication.md) |
| Usuários | [04-users.md](./features/04-users.md) |
| Empresas | [05-companies.md](./features/05-companies.md) |
| Filiais | [06-branches.md](./features/06-branches.md) |
| Permissões | [07-permissions.md](./features/07-permissions.md) |
| Módulos | [08-modules.md](./features/08-modules.md) |
| Auditoria | [09-audit-logging.md](./features/09-audit-logging.md) |
| Testes | [10-testing.md](./features/10-testing.md) |

---

## Licença

Proprietário — cenos © 2026
