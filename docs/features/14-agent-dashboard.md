# Feature: Dashboard de Agente de Campo

## Overview

Dashboard dinâmico para agentes de campo (COMPANY_ADMIN e USER) que exibe estatísticas de leituras, pendências, perdas, CNL e C12 em formato Server-Driven UI (SDUI).

## Estrutura do Usuário

### Perfis com acesso
- **COMPANY_ADMIN**: Acesso completo às estatísticas da empresa
- **USER**: Acesso às estatísticas das filiais atribuídas

### Estados suportados
- `PI` - Piauí (usa `DATABASE_PI_URL`)
- `MA` - Maranhão (usa `DATABASE_MA_URL`)

---

## Endpoints

### `GET /api/v1/dashboard/agent-stats`

Retorna estatísticas do agente logado para o dia atual.

**Autenticação:** Bearer Token (JWT)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Query Params:**
| Param | Tipo | Padrão | Descrição |
|-------|------|---------|-----------|
| `date` | string | hoje | Data no formato `YYYY-MM-DD` ou `DD.MM.YYYY` |

**Resposta:**
```json
{
  "success": true,
  "data": {
    "layout": {
      "columns": 3,
      "gap": 12,
      "baseRowHeight": 140
    },
    "widgets": [
      {
        "id": "stat_leituras",
        "type": "statCard",
        "size": { "colSpan": 1, "rowSpan": 1 },
        "data": {
          "title": "Leituras",
          "value": "150",
          "icon": "BookCheck",
          "color": "text-emerald-500 bg-emerald-50/10"
        },
        "action": { "type": "link", "url": "/services?filter=all" }
      }
      // ... mais widgets
    ]
  }
}
```

---

## Widgets Disponíveis

### 1. Alert Card (`alertCard`)
Alertas exibidos no topo do dashboard.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | string | Identificador único |
| `type` | `alertCard` | Tipo do widget |
| `size` | object | colSpan (1-3), rowSpan (1-3) |
| `data.title` | string | Título do alerta |
| `data.message` | string | Mensagem do alerta |
| `data.severity` | string | `info`, `warning`, `error`, `success` |

### 2. Banner Carousel (`bannerCarousel`)
Carrossel de imagens promotionais.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `data.autoSlideInterval` | number | Intervalo em ms (padrão: 5000) |
| `data.banners[].imageUrl` | string | URL da imagem |
| `data.banners[].action` | object | Ação ao clicar |

### 3. Stat Card (`statCard`)
Kart de métrica com valor e ícone.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `data.title` | string | Título da métrica |
| `data.value` | string | Valor formatado |
| `data.subtitle` | string | Subtítulo (opcional) |
| `data.icon` | string | Nome do ícone Lucide |
| `data.color` | string | Classes Tailwind de cor |

### 4. Chart Card (`chartCard`)
Gráfico de barras.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `data.chartType` | `bar` | Tipo do gráfico |
| `data.title` | string | Título do gráfico |
| `data.dataset` | array | Dados `{ label, value }` |

---

## Estatísticas Retornadas

### Leituras
| Métrica | Descrição |
|---------|-----------|
| `quant_leituras` | Total de leituras realizadas no dia |
| `total_time_fmt` | Tempo total de trabalho (HH:MM:SS) |
| `pause_time_fmt` | Tempo em pausa (HH:MM:SS) |
| `work_time_fmt` | Tempo efetivo de trabalho (HH:MM:SS) |
| `hourly_dataset` | Leituras por hora do dia |

### CNL (Código Não Lido)
| Métrica | Descrição |
|---------|-----------|
| `cnl` | Quantidade de CNL |
| `percent_cnl` | Percentual de CNL |
| `weekly_cnl_stats` | CNL por dia da semana |

### C12 (Ligação Nova)
| Métrica | Descrição |
|---------|-----------|
| `quant_c12` | Total de C12 |
| `quant_c12_out_hour` | C12 fora de horário (antes das 8h PI / 7h MA) |
| `licacao_nova_c12` | C12 em ligação nova |
| `fast_c12` | C12 executados em < 60 segundos |
| `first_c12` | C12 entrantes (após CNL) |

### Perdas
| Métrica | Descrição |
|---------|-----------|
| `perdas` | Total de perdas em kWh |
| `pending` | Lista de pendências |

---

## Regras de Negócio

### Tempo de Trabalho
- Primeiro serviço do dia = 60 segundos
- Serviços com intervalo > 20 minutos = pausa
- Tempo efetivo = Tempo total - Tempo em pausa

### CNL
- Código Não Lido = não inicia com 'A' E não é B09/B10/B15
- Percentual = (CNL / Total Leituras) * 100

### C12
- C12 fora de horário: antes das 08:00 (PI) ou 07:00 (MA)
- C12 rápido: executado em < 60 segundos (suspeito de fraude)
- C12 entrante: após dois CNL consecutivos

---

## Queries Utilizadas

| Query | Descrição | Tabela |
|-------|-----------|--------|
| `getAgentDailyStats` | Estatísticas do dia | `matriz` |
| `getAgentCNLStats` | Estatísticas CNL | `matriz` |
| `getAgentC12Stats` | Estatísticas C12 | `matriz` |
| `getAgentHourlyStats` | Leituras por hora | `matriz` |
| `getAgentPending` | Lista de pendências | `matriz` |
| `getWeeklyCNLStats` | CNL da semana | `matriz` |

---

## Variáveis de Ambiente

```env
DATABASE_PI_URL=postgresql://user:pass@host:port/leitura
DATABASE_MA_URL=postgresql://user:pass@host:port/maranhao
```

---

## Exemplo de Layout

```
┌─────────────────────────────────────────┐
│  ⚠️ Alerta (se houver)                  │
├─────────────────────────────────────────┤
│  ┌─────────────────────────────────┐    │
│  │     [Banner Carousel]            │    │
│  └─────────────────────────────────┘    │
├─────────────────────────────────────────┤
│  ┌───────┐ ┌───────┐ ┌───────┐          │
│  │Leituras│ │Pend.  │ │Perdas │          │
│  │  150   │ │  10   │ │ 250kWh│          │
│  └───────┘ └───────┘ └───────┘          │
├─────────────────────────────────────────┤
│  ┌─────────────────────────────────┐    │
│  │     Leituras por Hora           │    │
│  │     [Gráfico de Barras]         │    │
│  └─────────────────────────────────┘    │
├─────────────────────────────────────────┤
│  ┌───────┐ ┌───────┐ ┌───────┐          │
│  │Tempo  │ │Pausa  │ │Efetivo│          │
│  │ 08:30 │ │ 01:15 │ │ 07:15 │          │
│  └───────┘ └───────┘ └───────┘          │
└─────────────────────────────────────────┘
```
