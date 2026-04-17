# App Agente

Aplicativo mobile React para agentes de campo, com Dashboard dinâmica (Server-Driven UI), gestão de serviços, calendário e mapa de localizações.

> **Nota de Contribuição**: Este documento deve ser atualizado sempre que houver alterações ou novas funcionalidades no projeto. Ao adicionar novas páginas, APIs ou features, atualize esta documentação para manter a equipe alinhada.

## Tech Stack

- **React 19** + TypeScript
- **Vite** (bundler)
- **Tailwind CSS 4** (estilização)
- **React Router DOM 7** (roteamento)
- **Recharts** (gráficos)
- **Leaflet + React-Leaflet** (mapas)
- **Lucide React** (ícones)
- **Axios** (requisições HTTP)

## Scripts

```bash
npm run dev     # Iniciar desenvolvimento
npm run build   # Build de produção
npm run lint    # Verificar código
npm run preview # Preview do build
npm run start   # Preview acessível na rede
```

## Estrutura do Projeto

```
src/
├── api/           # Requisições e mock de dados
├── components/    # Componentes reutilizáveis
│   ├── sdui/      # Widgets da Dashboard SDUI
│   ├── *.tsx      # Componentes de páginas
├── context/       # React Context (estado global)
├── layouts/       # Layouts (MainLayout)
├── pages/         # Páginas principais
└── types/         # TypeScript interfaces
```

## Páginas

| Rota | Página | Descrição |
| :--- | :--- | :--- |
| `/` | Dashboard | Grid dinâmico com widgets (StatCard, BannerCarousel, ChartCard, AlertCard) |
| `/services` | Leituras | Lista de serviços agendados |
| `/perdas` | Perdas | Gestão de perdas |
| `/calendar` | Agenda | Calendário quinzenal |
| `/inventory` | Inventário | Cadastro de equipamentos (PDA e impressora) |
| `/daily-report` | Relatório | Reporte diário do agente |
| `/search` | Busca | Busca de localização no mapa |
| `/links/:id` | WebFrame | iframe interno genérico |
| `/justify-pending` | Justificativas Pendentes | Lista de justificativas pendentes |
| `/justify-installation/:instalacao/:dataLeitPrev` | Justificar Instalação | Formulário de justificativa por instalação |

## Padrão de Páginas

Todas as páginas do app seguem o padrão modular usando `PageLayout`. Consulte o **DESIGN_SYSTEM.md** para detalhes completos.

### Criando Nova Página

1. Defina a rota em `App.tsx`
2. Use o componente `PageLayout` para estruturar a página
3. Adicione a configuração em `src/layouts/pageConfig.ts`
4. Adicione link no menu lateral (`LinksSidebar.tsx`) se necessário

Consulte a seção **17. Padrão de Layout de Página** no DESIGN_SYSTEM.md.

## API Endpoints

| Endpoint | Método | Descrição |
| :--- | :--- | :--- |
| `/agent_data` | GET | Dados do agente logado |
| `/agent_dashboard` | GET | Layout da dashboard SDUI |
| `/agent_services` | GET | Lista de serviços do agente |
| `/last_update_agent` | GET | Última atualização |
| `/calendar` | GET | Eventos do calendário |
| `/predicted` | GET | Serviços previstos |
| `/search_in` | POST | Busca de instalações |
| `/custom_links` | GET | Links personalizados |
| `/inventory` | GET/POST | Inventário de equipamentos |
| `/daily_report` | GET/POST | Reporte diário do agente |
| `/daily_report/check_today` | GET | Verifica se já reportou hoje |
| `/upload_agent` | POST | Upload de arquivo (foto) |
| `/feriados` | GET | Feriados do estado |

## Server-Driven UI

A Dashboard é renderizada dinamicamente via API. Veja `SDUI_SPEC.md` para a especificação técnica completa.

### Widgets Suportados

- `statCard` - Métricas com ícone
- `bannerCarousel` - Carrossel de imagens
- `chartCard` - Gráficos (bar, pie)
- `alertCard` - Alertas

### API

Endpoint: `GET /dashboard_layout`

Resposta esperada:
```json
{
  "layout": { "columns": 3, "gap": 12, "baseRowHeight": 140 },
  "widgets": [...]
}
```

## Executando

```bash
npm install
npm run dev
```