# Especificação técnica: Server-Driven UI (SDUI)

Este documento descreve como o Backend deve fornecer dados para a Dashboard dinâmica do aplicativo,控制ando o layout, componentes e comportamentos de navegação.

> **Nota de Contribuição**: Este documento deve ser atualizado sempre que houver alterações no contrato da API ou novos tipos de widgets suportados.

## 1. Contrato da API
**Endpoint Sugerido:** `GET /dashboard_layout`

### Estrutura Base (Payload)
A resposta deve ser um objeto contendo o `layout` global e uma lista de `widgets`.

```json
{
  "layout": {
    "columns": 3,
    "gap": 12,
    "baseRowHeight": 140
  },
  "widgets": [ ... ]
}
```
* **columns**: Quantidade de colunas do grid (Padrão: 3).
* **baseRowHeight**: Altura base para um componente com `rowSpan: 1`.

---

## 2. Estrutura do Widget
Cada objeto na lista de `widgets` deve seguir este padrão:

| Atributo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | `string` | Identificador único do widget. |
| `type` | `string` | Tipo do componente (`statCard`, `bannerCarousel`, `chartCard`). |
| `size` | `object` | Objeto com `colSpan` (1-3) e `rowSpan` (1-3). |
| `data` | `object` | Payload de dados específico para o tipo escolhido. |
| `action` | `object` | (Opcional) Ação de clique. |

### Exemplo de Action
```json
"action": {
  "type": "link",
  "url": "/services" // Se iniciar com '/', abre internamente. Caso contrário, abre em Iframe.
}
```

---

## 3. Tipos de Widgets e Dados (`data`)

### A. Alert Card (`alertCard`)
Usado para alertas e notificações importantes.
```json
"data": {
  "title": "Atenção",
  "message": "Verifique os agendamentos de hoje",
  "severity": "warning" // "info" | "warning" | "error" | "success"
}
```

### B. Stat Card (`statCard`)
Usado para métricas de valor único.
```json
"data": {
  "title": "Leituras",
  "value": "1.240",
  "subtitle": "Meta atingida!",
  "icon": "Smartphone", // Smartphone, MessageSquare, Zap, TrendingUp
  "color": "text-blue-500 bg-blue-50" // Classes Tailwind para destaque
}
```

### C. Banner Carousel (`bannerCarousel`)
Usado para imagens e promoções. Permite múltiplos slides.
```json
"data": {
  "autoSlideInterval": 5000, 
  "banners": [
    {
      "imageUrl": "https://...",
      "action": { "type": "link", "url": "https://..." }
    }
  ]
}
```

### C. Chart Card (`chartCard`)
Usado para visualização de dados. Atualmente suporta o formato de Barras (barra de 5 itens).
```json
"data": {
  "chartType": "bar", // bar
  "title": "Desempenho",
  "dataset": [
    { "label": "SEG", "value": 400 },
    { "label": "TER", "value": 500 }
  ]
}
```

---

## 4. Regras de Layout
O grid é baseado em **3 colunas**.
* **3 Colunas**: O widget ocupa a largura total da tela.
* **2 Colunas**: O widget ocupa 2/3 da tela.
* **1 Coluna**: O widget ocupa 1/3 da tela.
* **rowSpan**: Define a altura múltipla da base (ex: `rowSpan: 2` com `baseRowHeight: 140` = 280px).

> [!TIP]
> No mobile, as proporções são respeitadas. Para uma leitura melhor de textos longos, evite usar `colSpan: 1` se o título for muito extenso.

---

## 5. Convenção de Ícones
O sistema agora suporta **qualquer ícone** da biblioteca [Lucide](https://lucide.dev/icons).
* **Formato**: Envie o nome do ícone em *CamelCase* (ex: `MessageSquare`) ou *kebab-case* (ex: `message-square`).
* **Sugestões**: `Activity`, `Shield`, `Users`, `HardDrive`, `Smartphone`, `Zap`, `TrendingUp`, `Bell`, `CreditCard`, `Home`.
* **Fallback**: Se o nome não for reconhecido, será exibido um círculo pulsante de carregamento ou reserva.
