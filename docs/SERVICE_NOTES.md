# Notas de Serviço (Service Notes) e Grupos

Este documento descreve os endpoints operacionais e administrativos de Notas de Serviço e Grupos de Serviços.

---

## 1. Regras Gerais de Acesso

* **Autenticação do Técnico (PWA):** Header `X-Telegram-Init-Data` (autenticação de campo baseada em Telegram ou login PIN standalone).
* **Autenticação do Admin:** Bearer token (`/admin/service-notes/*`, `/admin/service-groups/*`) + módulo `service_notes`.

---

## 2. Gestão de Grupos de Serviços (Admin)

### `GET /admin/service-groups`
Retorna todos os grupos de serviços operacionais cadastrados no sistema.

**Headers:** `Authorization: Bearer <token>`
**Módulo Requerido:** `service_notes`

**Resposta 200:**
```json
[
  {
    "id": 1,
    "name": "Corte e Religação",
    "description": "Serviços comerciais de corte e religação de energia",
    "completion_config": {
      "formFields": [
        {
          "id": "foto_local",
          "type": "image",
          "label": "Foto do Medidor",
          "required": true
        }
      ]
    },
    "created_at": "2026-05-19T00:00:00.000Z"
  }
]
```

---

### `POST /admin/service-groups`
Cria um novo grupo de serviços e define seu formulário dinâmico, além do controle de acesso dos agentes.

**Headers:** `Authorization: Bearer <token>`
**Módulo Requerido:** `service_notes`

**Body:**
```json
{
  "name": "Inspeção de Fraudes",
  "description": "Grupo para vistorias de fraudes e desvios",
  "allow_all_agents": false,
  "allowed_agents": ["T60702", "T12345"],
  "completion_config": {
    "formFields": [
      {
        "id": "constatou_fraude",
        "type": "radio",
        "label": "Constatou fraude?",
        "options": ["Sim", "Não"],
        "required": true
      }
    ]
  }
}
```

* **`allow_all_agents`** (boolean, opcional, default `true`): Se definido como `true` (grupo público), qualquer agente de campo poderá visualizar e concluir as notas de serviço associadas. Se `false`, o grupo se torna privado/restrito.
* **`allowed_agents`** (array de strings, opcional, default `[]`): Contém a lista de IDs/Telegram dos agentes autorizados a visualizar e interagir com o grupo se `allow_all_agents` for `false`.

---

### `PUT /admin/service-groups/:id`
Atualiza os metadados, a configuração do formulário ou as permissões de acesso de um grupo de serviços.

**Headers:** `Authorization: Bearer <token>`
**Módulo Requerido:** `service_notes`

**Body:**
```json
{
  "name": "Inspeção de Fraudes e Perdas",
  "description": "Novo escopo expandido de monitoramento",
  "allow_all_agents": true,
  "allowed_agents": []
}
```

---

### `DELETE /admin/service-groups/:id`
Exclui um grupo e remove todas as notas de serviço vinculadas.

**Headers:** `Authorization: Bearer <token>`
**Módulo Requerido:** `service_notes`

---

## 3. Gestão de Notas de Serviço (Admin)

### `GET /admin/service-notes`
Lista e filtra notas de serviço do painel administrativo.

**Headers:** `Authorization: Bearer <token>`
**Módulo Requerido:** `service_notes`

**Query Params:**
| Campo | Tipo | Descrição |
|---|---|---|
| `groupId` | number | Filtra pelo ID do grupo de serviços |
| `status` | string | Filtra pelo status (`PENDENTE`, `CONCLUIDO`) |
| `assignedTo` | string | Filtra pela matrícula do agente atribuído |
| `unassigned` | boolean | Retorna apenas notas sem atribuição se `true` |
| `categoryId` | number | Filtra por categoria de pin cadastrada |
| `archived` | boolean | Se `true` ou `false`, filtra visibilidade de arquivo lógico |
| `createdFrom` / `createdTo` | string | Filtro de data de criação no formato ISO |
| `completedFrom` / `completedTo` | string | Filtro de data de conclusão no formato ISO |

**Resposta 200:**
```json
[
  {
    "id": 101,
    "group_id": 1,
    "title": "Vistoria UC 998877",
    "description": "Cliente sem luz",
    "address": "Av. Principal, 123",
    "coordinates": "-5.089,-42.801",
    "status": "PENDENTE",
    "assigned_to": null,
    "marker_category_id": 2,
    "category_name": "Urgente",
    "category_color": "#EF4444",
    "archived": false,
    "created_at": "2026-05-19T10:00:00.000Z"
  }
]
```

---

### `POST /admin/service-notes`
Cria uma nota de serviço manual.

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "group_id": 1,
  "title": "Instalação de Medidor Bifásico",
  "description": "Nova ligação comercial",
  "address": "Rua 10, Centro",
  "coordinates": "-5.0895,-42.8012",
  "marker_category_id": 1
}
```

---

### `PUT /admin/service-notes/:id`
Atualiza parcialmente uma nota de serviço. A partir da versão atual, os campos `group_id` e `archived` também são permitidos nessa operação, possibilitando mover individualmente uma nota para outro grupo ou alterar seu estado de arquivamento sem precisar usar as ações em lote.

**Headers:** `Authorization: Bearer <token>`
**Módulo Requerido:** `update_service_note`

**Campos editáveis:**
| Campo | Tipo | Descrição |
|---|---|---|
| `title` | string | Título da nota |
| `description` | string | Descrição (JSON ou texto) |
| `address` | string | Endereço textual |
| `coordinates` | string | Coordenadas `"lat,lng"` |
| `latitude` | number | Latitude numérica (derivada automaticamente de `coordinates` se omitida) |
| `longitude` | number | Longitude numérica |
| `marker_category_id` | number | ID da categoria de marcador |
| `status` | string | Status `PENDENTE` ou `CONCLUIDO` |
| `group_id` | number | **Novo** — Move a nota para o grupo com este ID |
| `archived` | boolean | **Novo** — Arquiva (`true`) ou desarquiva (`false`) a nota |

**Body de Exemplo (mover de grupo):**
```json
{
  "group_id": 4
}
```

---

### `DELETE /admin/service-notes/:id`
Deleta uma nota de serviço permanentemente.

**Headers:** `Authorization: Bearer <token>`

---

### `PUT /admin/service-notes/:id/assign`
Atribui ou remove a atribuição de uma nota de serviço individual.

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{ "userId": "T60702" } // Ou null para desatribuir
```

---

### `PUT /admin/service-notes/:id/complete`
Força o encerramento manual (conclusão) da nota diretamente do painel administrativo.

**Headers:** `Authorization: Bearer <token>`

**Body:** Opcional `{ "completionData": { "motivo": "Resolvido via central" } }`

---

### `POST /admin/service-notes/:id/restore`
Restaura a conclusão de uma nota de serviço individual, retornando o seu status para `'PENDENTE'` e limpando todas as respostas do formulário, coordenadas de finalização e evidências fotográficas anexadas.

**Headers:** `Authorization: Bearer <token>`

---

## 4. Operações em Lote (Admin - Bulk Actions)

### `POST /admin/service-notes/bulk-assign`
Atribui ou desatribui múltiplos registros de notas de serviço de uma só vez para um agente.

**Body:**
```json
{
  "serviceIds": [101, 102, 103],
  "userId": "T60702" // Ou null para desatribuir
}
```

---

### `POST /admin/service-notes/bulk-restore`
Restaura a conclusão de múltiplos registros de notas de serviço em lote, revertendo-os para `'PENDENTE'` e apagando todos os seus dados e arquivos de conclusão.

**Body:**
```json
{
  "serviceIds": [101, 102, 103]
}
```

---

### `POST /admin/service-notes/bulk-category`
Modifica a categoria visual e cor dos pins de múltiplas notas ao mesmo tempo.

**Body:**
```json
{
  "serviceIds": [101, 102],
  "markerCategoryId": 5 // Ou null para limpar a tag
}
```

---

### `POST /admin/service-notes/bulk-move`
Move e reclassifica um conjunto de notas para outro grupo operacional.

**Body:**
```json
{
  "serviceIds": [101, 102],
  "targetGroupId": 3
}
```

---

### `POST /admin/service-notes/bulk-archive` / `/bulk-unarchive`
Arquiva ou restaura logicamente as notas de serviço (removendo-as do dia a dia dos técnicos sem exclusão física).

**Body:**
```json
{
  "serviceIds": [101, 102]
}
```

---

### `POST /admin/service-notes/bulk-delete`
Deleta fisicamente múltiplos registros no banco de dados.

**Body:**
```json
{
  "serviceIds": [101, 102]
}
```

---

## 5. Operações de Campo (Agente de Campo - PWA/Mini App)

### `GET /public/service-notes`
Retorna as notas de serviço ativas atribuídas ao agente requisitante (identificado pela sessão JWT/Telegram).

**Headers:** `X-Telegram-Init-Data: <token>`

**Resposta 200:** Array de notas atribuídas de status `PENDENTE` ou concluídas recentemente.

---

### `PUT /public/service-notes/:id/complete`
Técnico encerra uma nota de serviço de campo respondendo ao formulário dinâmico.

**Headers:** `X-Telegram-Init-Data: <token>`

**Body:**
```json
{
  "coordinates": "-5.0895,-42.8012",
  "completionData": {
    "constatou_fraude": "Não",
    "foto_local": "https://service-connect-media.s3.amazonaws.com/123.jpg"
  },
  "completedAt": "2026-05-19T10:45:00.000Z"
}
```

---

### `POST /public/groups/:groupId/service-notes` (Auto-registro de Campo)
Permite ao técnico criar e concluir um ponto novo diretamente no mapa de campo, sem a existência de uma nota pré-gerada pelo administrativo.

**Headers:** `X-Telegram-Init-Data: <token>`

**Body:**
```json
{
  "completionCoordinates": "-5.0895,-42.8012",
  "completionData": {
    "tipo_acao": "Limpeza preventiva",
    "observacao": "Ponto de risco removido"
  },
  "completedAt": "2026-05-19T10:45:00.000Z"
}
```

**Resposta 201:** Retorna a nota gerada e auto-concluída.
