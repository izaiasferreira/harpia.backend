# Gamificação e Plataforma de Treinamentos (CenEduc & Interativos)

Este documento detalha o funcionamento da arquitetura de Gamificação e Treinamentos do ecossistema Cenos, cobrindo o Construtor de Treinamentos Administrativo, o player de execução e a entrega de Badges (emblemas) aos técnicos de campo.

---

## 1. Visão Geral da Gamificação

A gamificação visa engajar os técnicos de campo (agentes) através do cumprimento de metas e realização de cursos de capacitação técnica.
* **Componentes Principais:**
  * **Badges (Emblemas):** Títulos representativos que concedem reputação (ex: "Roteirizador Master", "Caçador de Fraude").
  * **Atribuição Automática:** Ao completar uma trilha CenEduc ou um Treinamento Interativo, o backend processa automaticamente e concede as badges correspondentes para o perfil do agente.

---

## 2. Plataforma de Treinamento CenEduc (Agent-Facing)

O **CenEduc** é a central de aprendizagem integrada no aplicativo móvel do agente.

### `GET /agent/ceneduc`
Retorna as trilhas, cursos recomendados e banners em destaque do CenEduc.

* **Autenticação:** Telegram Auth / PIN Token.
* **Filtros Geográficos:** O endpoint filtra dinamicamente os cursos retornados com base no estado federativo (`state`) cadastrado na matrícula do agente requisitante.
* **Resolução de Placeholders:** URLs de links que contêm o termo `{id}` são automaticamente substituídas em runtime pela matrícula do agente logado (ex: `/f/2?id={id}` vira `/f/2?id=T60702`), permitindo rastreio individual.

---

## 2.1 Admin CenEduc (CRUD de Cards)

Gerencia os cards da plataforma de aprendizado exibidos no app do agente.

**Prefixo:** `/admin/ceneduc/*`

**Autenticação:** JWT Admin (Bearer)

| Módulo | Descrição |
|--------|-----------|
| `ceneduc` | Leitura de cards |
| `create_ceneduc` | Criar card |
| `update_ceneduc` | Atualizar card |
| `delete_ceneduc` | Remover card |

### `GET /admin/ceneduc`
Lista todos os cards (ativos e inativos).

**Módulo Requerido:** `ceneduc`

**Query Params:**
| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `state` | string | Filtrar por estado (`pi` ou `ma`) |

**Resposta 200:** Array de cards.

---

### `GET /admin/ceneduc/:id`
Detalhes de um card específico.

**Módulo Requerido:** `ceneduc`

**Resposta 200:** Objeto do card com dados completos.

**Resposta 404:** `{ "error": "Card não encontrado" }`

---

### `POST /admin/ceneduc`
Cria um novo card.

**Módulo Requerido:** `create_ceneduc`

**Body (JSON):**
```json
{
  "card_type": "cover",
  "section": "slider",
  "group_title": "Trilha de Leitura",
  "state": "pi",
  "sort_order": 1,
  "badge_id": null,
  "data": {
    "title": "Curso de Leitura Eficiente",
    "image": "https://...",
    "description": "Aprenda técnicas...",
    "link": "https://...",
    "resource_type": "training",
    "resource_id": 1
  }
}
```

**Tipos válidos:** `card_type` deve ser `cover` ou `train_item`. Para `train_item`, `section` deve ser `slider` ou `banner` e `group_title` é obrigatório.

**Resposta 201:** Objeto do card criado.

---

### `PUT /admin/ceneduc/:id`
Atualiza parcialmente um card.

**Módulo Requerido:** `update_ceneduc`

**Campos adicionais no body:** `active` (boolean) — ativa/desativa o card.

**Resposta 200:** Objeto do card atualizado.

---

### `DELETE /admin/ceneduc/:id`
Remove um card.

**Módulo Requerido:** `delete_ceneduc`

**Resposta 200:** `{ "success": true, "deleted": { ... } }`

---

## 3. Construtor de Treinamentos Interativos (Admin)

Permite criar trilhas de capacitação visualmente utilizando grafos de decisão (nós e arestas no frontend).

**Prefixo:** `/admin/training/*`

**Autenticação:** JWT Admin (Bearer)

| Módulo | Descrição |
|--------|-----------|
| `trainings` | Listar/visualizar projetos |
| `create_training` | Criar projeto |
| `update_training` | Atualizar projeto, fluxo e conclusão manual |
| `delete_training` | Remover projeto |

---

### `GET /admin/training`
Lista os projetos de treinamento com paginação.

**Módulo Requerido:** `trainings`

**Query Params:**
| Parâmetro | Tipo | Default | Descrição |
|-----------|------|---------|-----------|
| `page` | number | 1 | Número da página |
| `limit` | number | 20 | Itens por página |

**Resposta 200:**
```json
{
  "data": [
    {
      "id": 1,
      "user_id": 1,
      "name": "Roteirização Eficiente",
      "description": "Treinamento sobre rotas otimizadas",
      "badge_id": 3,
      "flow_data": { "nodes": [], "edges": [] },
      "created_at": "2026-05-01T10:00:00.000Z",
      "updated_at": "2026-05-01T10:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "pages": 1
}
```

---

### `GET /admin/training/:id`
Retorna detalhes completos de um projeto, incluindo o campo `flow_data` que armazena os nós (`nodes`) e conexões (`edges`) do canvas visual.

**Módulo Requerido:** `trainings`

**Resposta 200:** Objeto do projeto de treinamento.

**Resposta 404:** `{ "error": "Projeto não encontrado" }`

---

### `POST /admin/training`
Cria um novo projeto de capacitação associando-o opcionalmente a um `badge_id`.

**Módulo Requerido:** `create_training`

**Body (JSON):**
```json
{
    "name": "Nova Roteirização Eficiente",
    "description": "Capacitação sobre cumprimento ideal de trajetos",
    "badge_id": 3
}
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `name` | string | **sim** | Nome do treinamento |
| `description` | string | não | Descrição |
| `badge_id` | number | não | ID da badge concedida ao concluir |

**Resposta 201:** Objeto do projeto criado.

---

### `PUT /admin/training/:id`
Atualiza dados básicos do treinamento.

**Módulo Requerido:** `update_training`

**Body:**
```json
{
    "name": "Nova Roteirização Eficiente",
    "description": "Capacitação sobre cumprimento ideal de trajetos",
    "badge_id": 3
}
```

**Resposta 200:** Objeto do projeto atualizado.

**Resposta 404:** `{ "error": "Projeto não encontrado" }`

---

### `DELETE /admin/training/:id`
Remove um projeto de treinamento.

**Módulo Requerido:** `delete_training`

**Resposta 200:** `{ "success": true, "deleted": { ... } }`

**Resposta 404:** `{ "error": "Projeto não encontrado" }`

---

### `PUT /admin/training/:id/flow`
Salva as modificações do grafo interativo no banco de dados (estruturas do React Flow contendo posições de caixas de diálogo, imagens de apoio e opções de escolha).

**Módulo Requerido:** `update_training`

**Body:**
```json
{
    "flow_data": {
        "nodes": [
            { "id": "node_1", "type": "slide", "data": { "text": "Bem-vindo ao curso..." } }
        ],
        "edges": [
            { "id": "e1-2", "source": "node_1", "target": "node_2" }
        ]
    }
}
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `flow_data` | object | **sim** | Grafo completo com nodes e edges |

**Resposta 200:** Objeto do projeto com flow_data atualizado.

**Resposta 404:** `{ "error": "Projeto não encontrado" }`

---

### `POST /admin/training/:id/complete`
Marca a conclusão manual do treinamento de um agente a partir do painel do administrador, concedendo a ele as insígnias atreladas.

**Módulo Requerido:** `update_training`

**Body:**
```json
{
    "agent_id": "T60702"
}
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `agent_id` | string | **sim** | Matrícula do agente |

**Resposta 200:**
```json
{
  "success": true,
  "agentId": "T60702",
  "trainingId": 1,
  "badgeId": 3,
  "badges": [1, 2, 3]
}
```

**Resposta 400:** `{ "error": "Treinamento não encontrado/não possui badge" }`

---

## 4. Player de Visualização Pública e Conclusão (Agente)

### `GET /public/training/:id`
Rota pública sem autenticação para renderização das telas do player (Slides responsivos com suporte a Container Queries) nos aparelhos dos técnicos.

---

### `POST /agent/training/:id/complete`
Invocado pelo player do celular ao alcançar o final da árvore de decisão do treinamento. Marca a conclusão e concede a insígnia.

**Headers:** `X-Telegram-Init-Data`

**Resposta 200 (sucesso):**
```json
{
    "success": true,
    "agentId": "T60702",
    "trainingId": 12,
    "badgeId": 3,
    "badges": [1, 2, 3] // Lista atualizada de IDs de badges possuídos pelo agente
}
```

---

## 5. CRUD de Emblemas (Badges - Admin)

Permite aos administradores gerenciar o catálogo global de insígnias visuais da plataforma.

* **Módulo Requerido (Leitura):** `badges`
* **Módulo Requerido (Escrita):** `create_badge`, `update_badge`, `delete_badge`

### `GET /admin/badge`
Lista todas as badges cadastradas no sistema.

---

### `POST /admin/badge`
Cria um novo emblema global.

**Body:**
```json
{
  "title": "Super Agente",
  "description": "Leitura de mais de 500 rotas sem erros",
  "image_url": "https://api.izi.tec.br/files/assets/emblema_super.png"
}
```

---

### `PUT /admin/badge/:id`
Atualiza parcialmente os metadados de uma insígnia.

---

### `DELETE /admin/badge/:id`
Remove permanentemente um emblema.

---

## 6. Associação de Emblemas a Perfis (User Badges - Admin)

Permite conceder ou revogar insígnias manualmente para colaboradores específicos do sistema de campo.

### `GET /admin/user-badges/:id`
Consulta a lista de insígnias associadas ao colaborador requisitado.

**Módulo Requerido:** `badges`

**Resposta 200:**
```json
{
  "id": "T60702",
  "nome": "João Silva",
  "badges": [1, 3, 5]
}
```

---

### `POST /admin/user-badges/:id/add`
Atribui manualmente um emblema ao perfil do colaborador de campo.

**Módulo Requerido:** `update_user`

**Body:**
```json
{
  "badgeId": 5
}
```

**Resposta 200:** `{ "success": true, "badges": [1, 3, 5] }`

---

### `POST /admin/user-badges/:id/remove`
Revoga manualmente um emblema do perfil do colaborador.

**Módulo Requerido:** `update_user`

**Body:**
```json
{
  "badgeId": 5
}
```

**Resposta 200:** `{ "success": true, "badges": [1, 3] }`
