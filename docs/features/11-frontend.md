# 11 — Frontend — Design System & Componentes

> **Stack**: React 19 + TypeScript + Vite + TailwindCSS v4 + Lucide React  
> **State**: Zustand (leve, sem boilerplate)  
> **Forms**: React Hook Form + Zod  
> **Toasts**: Sonner

---

## Sistema de Design — Paleta de Cores

O cenos utiliza **duas cores principais** do design system:

| Token | Hex | Uso |
|-------|-----|-----|
| **Primary (Azul)** | `#0031cc` | CTAs, botões primários, links, ícones ativos |
| **Secondary (Vermelho)** | `#ed1c24` | Acentos, badges importantes, alertas |

### Cores Auxiliares

| Token | Hex | Uso |
|-------|-----|-----|
| Success | `#10b981` | Status OK, confirmações |
| Error | `#ef4444` | Erros, exclusão |
| Warning | `#f59e0b` | Avisos |

### Paleta de Cores CSS

```css
/* Light mode */
:root {
  --primary: #0031cc;
  --secondary: #ed1c24;
  --chart-primary: #0031cc;
  --chart-secondary: #ed1c24;
  --chart-tertiary: #10b981;
  --chart-axis: #9ca3af;
  --chart-grid: #e5e7eb;
  --tooltip-bg: #ffffff;
}

/* Dark mode */
.dark {
  --chart-axis: #6b7280;
  --chart-grid: #374151;
  --tooltip-bg: #1f2937;
}
```

---

## Layout Architecture

### Ambientes

O frontend possui **dois ambientes distintos** com layouts específicos:

| Ambiente | Layout | Roles | Páginas |
|----------|--------|-------|----------|
| **Master** | `MasterLayout.tsx` | SUPER_ADMIN, SUPPORT | Dashboard, Companies, Users, Audit, Settings |
| **Cliente** | `ClientLayout.tsx` | COMPANY_ADMIN, USER | Dashboard, Branches, Users, Permissions, Audit, Settings |

### MasterLayout

```
┌──────────────────────────────────────────────────────────┐
│ [Logo]                                      [🌙 Toggle] │
├────────────┬─────────────────────────────────────────────┤
│            │                                             │
│ Dashboard  │                                             │
│ Empresas   │         <Outlet />                          │
│ Usuários  │                                             │
│ Auditoria  │                                             │
│ Config.   │                                             │
│            │                                             │
├────────────┤─────────────────────────────────────────────┤
│ [Avatar]   │                                             │
│ Nome       │                                             │
│ [Sair]     │                                             │
└────────────┴─────────────────────────────────────────────┘
```

### ClientLayout

```
┌──────────────────────────────────────────────────────────┐
│ [Logo]                                      [🌙 Toggle] │
├────────────┬─────────────────────────────────────────────┤
│            │                                             │
│ Dashboard  │                                             │
│ Filiais   │         <Outlet />                          │
│ Usuários  │                                             │
│ Permissões│                                             │
│ Auditoria  │                                             │
│ Config.   │                                             │
│            │                                             │
├────────────┤─────────────────────────────────────────────┤
│ [Avatar]   │                                             │
│ Nome       │                                             │
│ [Sair]     │                                             │
└────────────┴─────────────────────────────────────────────┘
```

---

## Estrutura de Diretórios

```
packages/frontend/src/
├── layouts/
│   ├── MasterLayout.tsx      # Layout ambiente Master
│   └── ClientLayout.tsx     # Layout ambiente Cliente
├── pages/
│   ├── Login.tsx            # Página de login (tema adaptativo)
│   ├── master/
│   │   ├── Dashboard.tsx    # Dashboard com métricas globais
│   │   ├── Companies.tsx    # CRUD de empresas
│   │   ├── Users.tsx        # CRUD de usuários globais
│   │   ├── Audit.tsx        # Logs de auditoria
│   │   └── Settings.tsx      # Perfil e senha
│   └── client/
│       ├── Dashboard.tsx    # Dashboard da empresa
│       ├── Branches.tsx     # CRUD de filiais
│       ├── Users.tsx         # CRUD de usuários empresa
│       ├── Permissions.tsx   # Gerenciamento de permissões
│       ├── Audit.tsx         # Logs de auditoria
│       └── Settings.tsx      # Perfil, senha e configurações
├── stores/
│   ├── authStore.ts         # Autenticação (Zustand)
│   └── themeStore.ts        # Tema dark/light (Zustand)
├── components/
│   └── Skeleton.tsx         # Loading placeholders
├── config/
│   └── api.ts               # Axios instance
├── App.tsx                  # Rotas
├── main.tsx                 # Entry point
└── index.css                # Estilos + variáveis CSS
```

---

## Stores (Zustand)

### authStore

```typescript
interface AuthStore {
  user: User | null;
  accessToken: string | null;
  setAuth: (user: User, token: string) => void;
  clearAuth: () => void;
  updateUser: (updates: Partial<User>) => void;
}
```

### themeStore

```typescript
interface ThemeStore {
  theme: 'light' | 'dark';
  initialized: boolean;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  initTheme: () => void;
}
```

**Persistência:** localStorage (`cenos-theme`)

---

## Tema Dark/Light

### Implementação

1. **Script inline no HTML** - Aplica tema ANTES do React carregar (previne flash)
2. **ThemeStore** - Gerencia estado e persiste no localStorage
3. **Classe `dark`** - Adicionada/removida no `<html>`

### index.html

```html
<script>
  (function() {
    try {
      var theme = localStorage.getItem('cenos-theme');
      if (theme) {
        var parsed = JSON.parse(theme);
        if (parsed.state && parsed.state.theme === 'dark') {
          document.documentElement.classList.add('dark');
        }
      }
    } catch (e) {}
  })();
</script>
```

### Uso nos Componentes

```tsx
// Padrão: classes dark: do Tailwind
<div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white">

// Alternativa: variável de tema
const isDark = theme === 'dark';
<div className={isDark ? 'bg-gray-900' : 'bg-white'}>
```

---

## Componentes UI

### Skeleton Components

| Componente | Uso |
|------------|-----|
| `Skeleton` | Elemento individual de loading |
| `TableSkeleton` | Tabela com linhas e colunas configuráveis |
| `CardSkeleton` | Card com estatística |
| `StatCardSkeleton` | Card de estatística para dashboard |
| `ChartSkeleton` | Área de gráfico com placeholder |
| `FormSkeleton` | Formulário com campos |

### Layouts

| Componente | Descrição |
|------------|-----------|
| `MasterLayout` | Sidebar fixa, header com toggle, tema adaptativo |
| `ClientLayout` | Sidebar fixa, header com toggle, tema adaptativo |

---

## Rotas do Frontend

```typescript
// App.tsx

/                     → Redirect para /master ou /client
/login                → Login

// Master (SUPER_ADMIN, SUPPORT)
/master               → Dashboard
/master/companies     → Empresas
/master/users         → Usuários globais
/master/audit         → Auditoria
/master/settings      → Configurações

// Cliente (COMPANY_ADMIN, USER)
/client               → Dashboard
/client/branches      → Filiais
/client/users         → Usuários
/client/permissions   → Permissões
/client/audit         → Auditoria
/client/settings      → Configurações
```

### Redirecionamento por Role

| Role | Redireciona para |
|------|-------------------|
| SUPER_ADMIN | `/master` |
| SUPPORT | `/master` |
| COMPANY_ADMIN | `/client` |
| USER | `/client` |

---

## Páginas Implementadas

### Master

| Página | Arquivo | Funcionalidades |
|--------|---------|-----------------|
| Dashboard | `pages/master/Dashboard.tsx` | Stats globais, gráficos de atividade |
| Companies | `pages/master/Companies.tsx` | CRUD completo, buscar, excluir |
| Users | `pages/master/Users.tsx` | CRUD, reset senha, ativar/desativar |
| Audit | `pages/master/Audit.tsx` | Logs, filtros, paginação, exportar |
| Settings | `pages/master/Settings.tsx` | Perfil, alteração de senha |

### Cliente

| Página | Arquivo | Funcionalidades |
|--------|---------|-----------------|
| Dashboard | `pages/client/Dashboard.tsx` | Stats da empresa, gráficos |
| Branches | `pages/client/Branches.tsx` | CRUD completo, status |
| Users | `pages/client/Users.tsx` | CRUD, reset senha, roles |
| Permissions | `pages/client/Permissions.tsx` | CRUD, TreeView, atribuir |
| Audit | `pages/client/Audit.tsx` | Logs, filtros, exportar |
| Settings | `pages/client/Settings.tsx` | Perfil, senha, empresa |

### Login

| Página | Arquivo | Funcionalidades |
|--------|---------|-----------------|
| Login | `pages/Login.tsx` | Autenticação, validação, tema adaptativo |

---

## API Client (Axios)

```typescript
// config/api.ts
const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// Request interceptor: attach access token
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Proxy configured in vite.config.ts for /api → http://localhost:3000
```

---

## Vite Config

```typescript
// vite.config.ts
export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: 'localhost',
      },
    },
  },
});
```

---

## Responsividade

- **Mobile first**: Classes Tailwind sem prefix = mobile
- Breakpoints: `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px)
- Sidebar: Fixa em desktop, recomendado overlay em mobile
- DataTable: Horizontal scroll on mobile
- Forms: Stack vertical on mobile

---

## Logs de Auditoria

Cada página de Audit exibe logs com:
- Data/hora
- Ação (CREATE, UPDATE, DELETE, LOGIN, etc.)
- Usuário
- Entidade
- IP
- Status HTTP

**Filtros disponíveis:**
- Ação
- Entidade
- Data início/fim

**Exportação:**
- CSV
- JSON

---

## Melhorias Futuras

- [ ] Testes E2E para frontend (Playwright)
- [ ] Documentação da API (Swagger/OpenAPI)
- [ ] Sistema de notificações em tempo real
- [ ] Upload de arquivos/avatares
- [ ] Dashboard customizável (drag & drop widgets)
- [ ] Two-factor authentication (2FA)
- [ ] Sessões múltiplas / device management
