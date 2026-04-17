# Design System - App Agente

Documentação detalhada das convenções, padrões e estilos visuais do aplicativo.

> **Nota de Contribuição**: Este documento deve ser atualizado sempre que houver alterações ou novas funcionalidades no projeto. Ao adicionar novos componentes, páginas ou padrões, atualize esta documentação para manter a equipe alinhada.

---

## 1. Visão Geral

O app é um **PWA mobile-first** para agentes de campo, desenvolvido com:
- **React 19** + TypeScript
- **Tailwind CSS 4** para estilização
- **React Router DOM 7** para roteamento
- Suporte a tema claro/escuro

---

## 2. Cores

### Paleta Principal

| Token | Valor (Light) | Valor (Dark) | Uso |
| :--- | :--- | :--- | :--- |
| `blue-500` | `#3b82f6` | `#3b82f6` | Cor primária, ícones ativos, CTAs |
| `blue-600` | `#2563eb` | `#2563eb` | Hover de elementos azuis |
| `blue-50` | `#eff6ff` | `blue-900/20` | Background de badges ativos |
| `gray-900` | `#111827` | `#f9fafb` | Texto principal |
| `gray-500` | `#6b7280` | `#6b7280` | Texto secundário, placeholders |
| `gray-400` | `#9ca3af` | `#9ca3af` | Texto desabilitado |
| `gray-100` | `#f3f4f6` | `#1f2937` | Bordas, backgrounds secs |
| `white` | `#ffffff` | `#111827` | Background principal (dark mode) |
| `gray-950` | `#030712` | `#030712` | Background base dark |

### Cores Semânticas

| Sentido | Cores | Uso |
| :--- | :--- | :--- |
| **Sucesso** | `emerald-500` (#10b981), `bg-emerald-50`, `text-emerald-600` | Leituras concluídas, alertas sucesso |
| **Erro** | `red-400` (#f87171), `bg-red-50`, `text-red-600` | Perdas, erros, alertas |
| **Aviso** | `amber-500` (#f59e0b), `bg-amber-50`, `text-amber-600` | Estados offline, warnings |

---

## 3. Tipografia

### Família
- **Headings**: `font-black` (React + Tailwind usa font do sistema)
- **Body**: `font-medium` (500) para textos importantes, `font-normal` (400) para texto corrido

### Tamanhos

| Tamanho | Classe | Uso |
| :--- | :--- | :--- |
| `text-4xl` | 36px | Títulos muito grandes (only in specific pages) |
| `text-2xl` | 24px | Títulos de página principais |
| `text-xl` | 20px | Subtítulos de seção |
| `text-lg` | 18px | Cards com destaque |
| `text-sm` | 14px | Corpo de texto, descrições |
| `text-xs` | 12px | Labels, badges, metadata |
| `text-[10px]` | 10px | Labels pequenos, tracking largo |

### Estilos de Texto

| Classe | Uso |
| :--- | :--- |
| `font-black tracking-tight` | Títulos de página |
| `font-bold tracking-widest uppercase` | Badge de agente, labels |
| `text-gray-500 dark:text-gray-400` | Subtítulos, descrições |
| `line-clamp-1` | Limitar texto a 1 linha com ellipsis |

---

## 4. Espaçamento

### Container
- **Max width**: `max-w-7xl` (80rem / 1280px)
- **Padding interno**: `px-4 sm:px-6 lg:px-8` ( responsivo )
- **Padding de páginas**: `py-8` (padrão) para não ficar sob header fixo

### gaps
| Classe | Valor | Uso |
| :--- | :--- | :--- |
| `gap-2` | 8px | Elementos inline pequenos |
| `gap-3` | 12px | Elementos em grupo |
| `gap-4` | 16px | Entre itens de lista |
| `gap-5` | 20px | Separação de seções |
| `gap-6` | 24px | Entre seções grandes |

### Border Radius

| Classe | Valor | Uso |
| :--- | :--- | :--- |
| `rounded-lg` | 8px | Inputs, botões pequenos |
| `rounded-xl` | 12px | Botões, cards pequenos |
| `rounded-2xl` | 16px | Cards principais |
| `rounded-full` | 9999px | Badges circulares, avatares |

---

## 5. Layout

### Header Fixo

```tsx
// Estrutura padrão
<header className="fixed top-0 left-0 right-0 h-16 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 z-[100]">
  <div className="mx-auto flex h-full max-w-7xl items-center px-4 sm:px-6 lg:px-8 relative justify-between">
    {/* Left: Menu/Back */}
    <div className="flex items-center">...</div>
    {/* Center: Logo */}
    <div className="flex items-center gap-2">...</div>
    {/* Right: Actions */}
    <div className="flex items-center justify-end w-11">...</div>
  </div>
</header>
```

**Regras:**
- Altura fixa: `h-16` (64px)
- Background: `bg-white/90 dark:bg-gray-900/90` com `backdrop-blur-md`
- Z-index: `z-[100]`
- Para páginas com header: adicionar `pt-16` no container principal
- Para páginas sem header (iframes): não adicionar padding

### Bottom Navigation

```tsx
<nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-lg border-t border-gray-200 dark:bg-gray-900/90 dark:border-gray-800 h-20 pb-safe">
  <div className="flex h-full max-w-lg mx-auto items-center justify-around px-2">
    {/* NavLinks */}
  </div>
</nav>
```

**Regras:**
- Altura: `h-20` (80px)
- Incluir `pb-safe` para notch em iPhones
- Max width: `max-w-lg` (32rem / 512px)
- Z-index: `z-[50]`
- Margem inferior: `pb-20` no main content

### Sidebar (Menu Lateral)

```tsx
<aside className="fixed top-0 left-0 bottom-0 z-[70] w-80 max-w-[85vw] bg-white dark:bg-gray-900 shadow-2xl">
  {/* Header */}
  <div className="flex items-center justify-between px-6 h-16 border-b">...</div>
  {/* Content */}
  <div className="flex-1 overflow-y-auto px-4 py-6 space-y-2">...</div>
</aside>
```

**Regras:**
- Largura: `w-80` (320px) com max de `max-w-[85vw]`
- Z-index: `z-[70]`
- Backdrop overlay: `fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm`

### Páginas com Header

São páginas que mostram header fixo e bottom navigation:
- `/`, `/services`, `/perdas`, `/calendar`, `/inventory`

Determinado em `MainLayout.tsx`:
```ts
const rootRoutes = ['/', '/services', '/perdas', '/calendar', '/inventory'];
const isRootPage = rootRoutes.includes(location.pathname);
```

---

## 6. Componentes

### Card Padrão

```tsx
<div className="flex flex-col gap-3 overflow-hidden rounded-2xl bg-white p-5 shadow-sm border border-gray-100 dark:bg-gray-800/40 dark:border-gray-700/50 transition-all hover:-translate-y-0.5 hover:shadow-md hover:bg-gray-50 dark:hover:bg-gray-800/60 cursor-pointer active:scale-[0.98]">
  {/* Content */}
</div>
```

**Características:**
- Border radius: `rounded-2xl`
- Padding: `p-5`
- Border: `border-gray-100 dark:border-gray-700/50`
- Shadow: `shadow-sm` (hover: `shadow-md`)
- Hover: `-translate-y-0.5` com `hover:shadow-md`
- Active: `active:scale-[0.98]`
- Linha de destaque no rodapé (opcional): `absolute bottom-0 left-0 h-1 w-full`

### Badge/Tag

```tsx
<div className="px-3 py-1.5 rounded-lg border text-[10px] font-black tracking-widest uppercase text-green-500 bg-green-500/10 border-green-500/20">
  {/* Label */}
</div>
```

### Input

```tsx
<input
  type="text"
  className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:text-white transition-colors"
  placeholder="..."
/>
```

**Características:**
- Padding: `px-3 py-2.5` (input grande)
- Background: `bg-gray-50 dark:bg-gray-800`
- Border: `border-gray-200 dark:border-gray-700`
- Focus: `focus:ring-2 focus:ring-blue-500`
- Border radius: `rounded-lg`

### Botão Primário

```tsx
<button className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors">
  {/* Content */}
</button>
```

### Botão Secundário

```tsx
<button className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-white shadow-sm border border-gray-200/60 dark:bg-gray-900 dark:border-gray-800 text-gray-700 dark:text-gray-200 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow transition-all active:scale-[0.98] disabled:opacity-50">
  {/* Content */}
</button>
```

### Seção/Card com Header

```tsx
<div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
  <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2">
    <Icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
    <h2 className="text-sm font-bold text-gray-900 dark:text-white">Título</h2>
  </div>
  <div className="p-4">
    {/* Content */}
  </div>
</div>
```

---

## 7. Estrutura de Página

### Página com Header Fixo + Bottom Nav

```tsx
export const PageName: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors pb-8">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-5">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">
                Título
              </h1>
              {/* Badge opcional */}
              <span className="px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 text-[10px] font-black tracking-widest text-blue-600 dark:text-blue-400 uppercase shadow-sm">
                Badge
              </span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Descrição
            </p>
          </div>
          {/* Actions opcionais (date pickers, etc) */}
        </div>

        {/* Content */}
        <div className="...">
          {/* ... */}
        </div>
      </div>
    </div>
  );
};
```

### Página de Loading

```tsx
<div className="flex items-center justify-center min-h-[60vh]">
  <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
</div>
```

### Página de Erro/Vazio

```tsx
<div className="flex flex-col items-center justify-center py-20 gap-4">
  <Icon className="h-12 w-12 text-gray-300 dark:text-gray-700" />
  <p className="text-sm text-gray-500 dark:text-gray-400">Mensagem</p>
</div>
```

---

## 8. Ícones

### Biblioteca
- **Lucide React** - [lucide.dev](https://lucide.dev/icons)

### Uso com DynamicIcon (ítens externos)

```tsx
import { DynamicIcon } from './components/sdui/DynamicIcon';

<DynamicIcon name="Smartphone" className="h-6 w-6" />
```

O componente `DynamicIcon` permite carregar ícones dinamicamente a partir do nome (CamelCase ou kebab-case).

### Tamanhos de Ícones

| Classe | Tamanho | Uso |
| :--- | :--- | :--- |
| `h-3 w-3` | 12px | Metadata, timestamps |
| `h-4 w-4` | 16px | Headers de cards, badges |
| `h-5 w-5` | 20px | Botões, ações |
| `h-6 w-6` | 24px | Navigation, títulos |
| `h-8 w-8` | 32px | Loading states |
| `h-12 w-12` | 48px | Estados vazios |

---

## 9. Estados

### Hover

```tsx
// Botões/Cards
hover:-translate-y-0.5 hover:shadow-md

// Links
hover:text-blue-500

// Inputs
hover:border-gray-300 dark:hover:border-gray-600
```

### Active/Pressed

```tsx
// Botões
active:scale-[0.98] // ou active:scale-95
```

### Disabled

```tsx
disabled:opacity-50 disabled:cursor-not-allowed
```

### Focus

```tsx
focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500
```

---

## 10. Dark Mode

### Support

O app suporta dark mode via classe `dark` no elemento `html`.

### Padrões

| Tema | Background | Border | Text |
| :--- | :--- | :--- | :--- |
| Light | `bg-gray-50` | `border-gray-200` | `text-gray-900` |
| Dark | `bg-gray-950` | `border-gray-800` | `text-white` |

### Elementos com Suporte Dark

- Backgrounds: `gray-50` → `dark:bg-gray-950` / `dark:bg-gray-900`
- Cards: `white` → `dark:bg-gray-900`
- Input bg: `bg-gray-50` → `dark:bg-gray-800`
- Borders: `border-gray-100` → `dark:border-gray-700/50` ou `dark:border-gray-800`
- Text: `text-gray-500` → `dark:text-gray-400`
- Hover: `hover:bg-gray-50` → `dark:hover:bg-gray-800`

### Exemplo de Classe Responsiva

```tsx
className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white"
```

---

## 11. Convenções de Código

### Nomenclatura

- **Componentes**: PascalCase (ex: `ServiceCard`)
- **Arquivos**: kebab-case (ex: `service-card.tsx`)
- **Types/Interfaces**: PascalCase (ex: `AgentService`)
- **Funções de API**: camelCase com prefix (ex: `fetchAgentServices`)

### Estrutura de Página

```tsx
// Imports
import React, { useState, useEffect } from 'react';
import { Icon } from 'lucide-react';
import { apiFunction } from '../api/api';
import { useContext } from '../context/Context';

// Interface de Props (se necessário)
interface PageNameProps { }

// Component
export const PageName: React.FC<PageNameProps> = () => {
  // State
  const [state, setState] = useState<Type>(initialValue);

  // Effects
  useEffect(() => { ... }, [...]);

  // Handlers
  const handleAction = () => { ... };

  // Render
  return ( ... );
};
```

### Classes CSS

Sempre usar classes Tailwind existentes. Evitar styled-components ou CSS modules.

### Autocomplete Off

```tsx
<input autoComplete="off" ... />
```

---

## 12. Roteamento

### Estrutura de Routes (App.tsx)

```tsx
<Routes>
  {/* Standalone (sem layout) */}
  <Route path="/standalone" element={<StandalonePage />} />
  
  {/* Com MainLayout */}
  <Route path="/" element={<MainLayout />}>
    <Route index element={<Dashboard />} />
    <Route path="page" element={<Page />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Route>
</Routes>
```

### Links

```tsx
import { Link, NavLink } from 'react-router-dom';

// Link normal
<Link to="/path">Texto</Link>

// NavLink ativo (para navigation)
<NavLink to="/path" className={({ isActive }) => isActive ? 'text-blue-600' : 'text-gray-500'}>
  Texto
</NavLink>
```

---

## 13. Acesso à API

### Autenticação

O app usa autenticação via Telegram WebApp. Os headers são automáticos via interceptor:

```ts
// headers adicionados automaticamente
config.headers['X-Telegram-Init-Data'] = initData;
```

### Fazendo Requisições

```ts
import { api } from './api/api';

export const fetchData = async (params?: object): Promise<DataType> => {
  const response = await api.get('/endpoint', { params });
  return response.data;
};
```

### Vite Proxy

Endpoints precisam ser configurados em `vite.config.ts`:

```ts
server: {
  proxy: {
    '/endpoint': {
      target: apiTarget,
      changeOrigin: true,
      secure: false,
    },
  }
}
```

---

## 14. Snippets Úteis

### Loading State
```tsx
<Loader2 className="h-8 w-8 animate-spin text-blue-600" />
```

### Estado Vazio
```tsx
<div className="flex flex-col items-center justify-center py-20 gap-4 opacity-40">
  <Package className="h-12 w-12" />
  <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum item encontrado</p>
</div>
```

### Alert/Toast
```tsx
<div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
  <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0" />
  <p className="text-sm text-red-700 dark:text-red-300">Mensagem</p>
</div>
```

### Skeleton Loading
```tsx
<div className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded-xl h-32" />
```

### Grid Responsivo
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* Items */}
</div>
```

### Data Badge (Agente)
```tsx
<span className="px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 text-[10px] font-black tracking-widest text-blue-600 dark:text-blue-400 uppercase shadow-sm">
  AGENTE-ID
</span>
```

---

## 15. Arquivos de Referência

| Arquivo | Descrição |
| :--- | :--- |
| `src/layouts/MainLayout.tsx` | Layout principal com header fixo |
| `src/components/BottomNav.tsx` | Navigation inferior |
| `src/components/LinksSidebar.tsx` | Menu lateral |
| `src/components/ServiceCard.tsx` | Card de serviço |
| `src/pages/Search.tsx` | Página de busca (exemplo completo) |
| `src/pages/Inventory.tsx` | Página com formulários |
| `src/api/api.ts` | Configuração de API |
| `src/context/*` | Contextos globais |

---

## 16. Regras de Responsividade

- **Mobile first**: começar com estilos mobile
- Breakpoints: `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px)
- Containers: `max-w-7xl` com padding `px-4 sm:px-6 lg:px-8`
- Bottom nav: `max-w-lg` (não expandir em telas grandes)

---

## 17. Padrão de Layout de Página

Todas as páginas do app devem seguir um padrão modular utilizando o componente `PageLayout`.

### PageLayout Component

```tsx
import { PageLayout } from '../components/PageLayout';

<PageLayout
  title="Título da Página"
  description="Descrição opcional"
  showAgentBadge={true} // padrão
  actions={<div>Botões de ação</div>} // opcional
>
  {/* Conteúdo da página */}
</PageLayout>
```

### Estrutura de Arquivos

```
src/
├── components/
│   └── PageLayout.tsx       // Componente reutilizável de layout
├── layouts/
│   ├── MainLayout.tsx       // Layout principal (header + nav)
│   └── pageConfig.ts        // Configurações de todas as páginas
├── pages/
│   ├── Inventory.tsx        // Exemplo de uso do PageLayout
│   ├── DailyReport.tsx      // Exemplo de uso do PageLayout
│   └── Search.tsx           // Exemplo de uso do PageLayout
```

### Como Criar Uma Nova Página

1. **Definir a configuração em `pageConfig.ts`**:

```ts
// src/layouts/pageConfig.ts
export const PAGE_CONFIGS: PageConfig[] = [
  {
    path: '/minha-pagina',
    title: 'Minha Página',
    description: 'Descrição opcional',
    showHeader: true,    // mostra header fixo
    showBottomNav: false, // não mostra bottom nav
    isRootPage: false     // opcional, true para páginas principais
  },
];
```

2. **Criar a página usando PageLayout**:

```tsx
// src/pages/MinhaPagina.tsx
import { PageLayout } from '../components/PageLayout';

export const MinhaPagina: React.FC = () => {
  return (
    <PageLayout
      title="Minha Página"
      description="Descrição da página"
      actions={<button> Ação </button>}
    >
      {/* Seu conteúdo aqui */}
    </PageLayout>
  );
};
```

3. **Adicionar a rota em `App.tsx`**:

```tsx
<Route path="/minha-pagina" element={<MinhaPagina />} />
```

4. **Adicionar link no menu lateral (se necessário)** em `LinksSidebar.tsx`.

### Tipos de Página

| Tipo | Header | Bottom Nav | Exemplo |
|------|--------|------------|---------|
| **Root** | Menu | Sim | `/`, `/services`, `/perdas`, `/calendar` |
| **Interna** | Voltar | Não | `/inventory`, `/daily-report`, `/search` |
| **Iframe** | Voltar | Não | `/links/:id` |

### Variáveis de Configuração

```ts
interface PageConfig {
  path: string;           // Rota da página
  title: string;          // Título exibido no PageLayout
  description?: string;   // Descrição opcional
  showHeader: boolean;    // Se exibe header fixo
  showBottomNav: boolean; // Se exibe navigation inferior
  showAgentBadge?: boolean; // Se exibe badge do agente (padrão: true)
  isRootPage?: boolean;   // Se é página root (com menu e bottom nav)
}
```

### Menu Lateral (LinksSidebar)

O menu lateral exibe links que são **fornecidos dinamicamente pelo backend** através da API `/custom_links`. **Nunca adicione links estáticos manualmente no código**.

A estrutura atual exibe:
- **Preferências**: Theme toggle (único item fixo)
- **Menu**: Lista de links dinâmica vinda da API

Para que uma nova página apareça no menu lateral, ela deve ser adicionada no backend via endpoint de links personalizados.

### Padrão de Paginação

Para listas que podem ter muitos itens, utilize paginação infinita com "carregar mais":

```tsx
const PAGE_SIZE = 10;

const [data, setData] = useState<Item[]>([]);
const [page, setPage] = useState(1);
const [hasMore, setHasMore] = useState(true);
const [loadingMore, setLoadingMore] = useState(false);

const loadData = async (reset = false) => {
  const currentPage = reset ? 1 : page;
  const result = await fetchAPI(status, currentPage, PAGE_SIZE);
  
  if (reset) {
    setData(result.data);
  } else {
    setData(prev => [...prev, ...result.data]);
  }
  
  setHasMore(result.data.length === PAGE_SIZE);
  if (!reset) setPage(prev => prev + 1);
};

<button onClick={() => loadData(false)} disabled={loadingMore}>
  {loadingMore ? <Loader /> : 'Carregar mais'}
</button>
```

**API deve retornar:**
```json
{
  "data": [...],
  "total": 50,
  "page": 1,
  "limit": 10,
  "totalPages": 5
}
```

**Quando usar:**
- Listas de justificativas respondidas
- Histórico de reportes
- Qualquer listagem que possa crescer significativamente

---

## 18. Testes de Acessibilidade

- Todos os botões devem ter `aria-label` ou texto visível
- Inputs devem ter labels visíveis
- Cores não devem ser唯一 meio de indicar estado
- Elementos interativos devem ter `:focus` visível