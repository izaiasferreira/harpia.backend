# Notas de Serviço (Service Notes) e Grupos

Este documento descreve os endpoints operacionais e administrativos de Notas de Serviço e Grupos de Serviços, incluindo arquitetura offline-first, sincronização em tempo real e resolução de conflitos.

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
| `group_id` | number | Move a nota para o grupo com este ID |
| `archived` | boolean | Arquiva (`true`) ou desarquiva (`false`) a nota |

**Body de Exemplo (mover de grupo):**
```json
{
  "group_id": 4
}
```

**Socket:** Se `archived` for alterado, emite `live_notification { type: 'service_notes_updated' }` para o agente atribuído à nota.

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

**Socket:** Antes de arquivar/restaurar, emite `live_notification { type: 'service_notes_updated' }` para cada agente atribuído às notas afetadas. Isso faz o frontend do agente recarregar os serviços imediatamente.

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

### `GET /agent/service-notes`
Retorna as notas de serviço ativas (não arquivadas) atribuídas ao agente.

**Query SQL:** `WHERE sn.archived = false AND sn.assigned_to = $1`

**Headers:** `X-Telegram-Init-Data: <token>`

**Resposta 200:** Array de notas atribuídas com status PENDENTE ou CONCLUIDO, ordenadas por status ASC, created_at DESC.

---

### `GET /agent/service-notes/groups/visible-with-counts`
Lista grupos visíveis ao agente com contagens totais e concluídas.

**Headers:** `X-Telegram-Init-Data: <token>`

**Query SQL:** LEFT JOIN com `sn.archived = false` no JOIN, agrupando por `sg.id`. Inclui grupos públicos (`allow_all_agents = true`) e grupos com o agente na lista `allowed_agents`.

**Resposta 200:**
```json
[
  {
    "id": 1,
    "name": "Corte e Religação",
    "total_notes": 15,
    "done_notes": 10
  }
]
```

---

### `GET /agent/service-notes/groups/:groupId/notes`
Retorna todas as notas de um grupo específico.

**Headers:** `X-Telegram-Init-Data: <token>`

**Regras de visibilidade:**
- **Grupo público** (`allow_all_agents = true`): Retorna TODAS as notas do grupo com `archived = false`.
- **Grupo restrito**: Retorna apenas notas atribuídas ao agente.

---

### `PUT /agent/service-notes/:id/complete`
Técnico conclui uma nota de serviço respondendo ao formulário dinâmico.

**Headers:** `X-Telegram-Init-Data: <token>`

**Resolução de Conflitos (first-to-sync-wins):**
A query SQL inclui `AND status = 'PENDENTE'` — apenas notas pendentes podem ser concluídas. Se outro agente ou admin já concluiu a nota, o backend retorna `200 { alreadyCompleted: true }` em vez de erro, para que a fila de sincronização não retente.

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

### `POST /agent/service-notes/self-register`
Auto-registro de campo (Registro Rápido). Cria e conclui uma nota nova sem necessidade de nota pré-existente.

**Headers:** `X-Telegram-Init-Data: <token>`
**Requisição:** Grupo deve ter `allow_agent_creation = true`.

**Body:**
```json
{
  "groupId": 1,
  "coordinates": "-5.0895,-42.8012",
  "completionData": {
    "tipo_acao": "Limpeza preventiva",
    "observacao": "Ponto de risco removido"
  },
  "completedAt": "2026-05-19T10:45:00.000Z"
}
```

---

### `GET /agent/service-notes/groups/creatable`
Lista grupos onde o agente pode criar novos registros (`allow_agent_creation = true`).

---

### `GET /agent/service-notes/groups/:groupId/categories`
Lista as categorias de marcadores disponíveis para um grupo específico.

---

## 6. Arquitetura de Sincronização e Offline-First

### Cache no IndexedDB
Todas as queries do agente passam por `cachedGet()` que:
1. Tenta ler do IndexedDB (cache)
2. Se cache válido (< TTL de 5 min) e sem `forceRefresh`, retorna cache
3. Se online, busca do backend e atualiza cache
4. Se offline, retorna cache (mesmo que stale)

### Fila de Sincronização (Sync Queue)
Operações offline (conclusão, auto-registro) são enfileiradas no IndexedDB:
- **`service_note_complete`**: Conclusão de nota
- **`service_note_self_register`**: Auto-registro de campo
- **`service_note_create`**: Criação de nota pelo agente

**Processamento:**
1. Disparado automaticamente ao ficar online (`window.addEventListener('online')`)
2. Retry a cada 5 minutos (`setInterval`)
3. No boot do app se estiver online
4. Ao clicar em refresh na página de Service Notes

**Ciclo de vida do item na fila:**
| Status | Descrição |
|---|---|
| `pending` | Aguardando processamento |
| `syncing` | Em processamento no momento |
| `synced` | Processado com sucesso — removido no próximo `clearSynced()` |
| `failed` | Falhou após 5 tentativas — NUNCA é removido automaticamente |

Itens `synced` só são removidos após chamada explícita a `clearSynced()`, garantindo que nenhum dado seja perdido antes da confirmação.

### Sincronização Automática (Socket + Eventos)

**Ao ficar online:**
```
online event → syncManager.onReconnect()
  → photoQueue.uploadPending()     (fotos pendentes)
  → syncQueue.process()            (envia conclusões)
  → syncQueue.clearSynced()         (limpa apenas sucessos)
```

**Ao clicar em Refresh:**
```
loadNotes(true)
  → getAssignedServiceNotes(true)   (força fetch, fallback offline)
  → getVisibleGroups(true)
  → getCreatableGroups(true)
  → getGroupAllNotes(true)          (se dentro de grupo público)
  → syncQueue.process()
  → syncQueue.clearSynced()
```

**Admin arquiva/restaura nota:**
```
bulk-archive → notifyAssignedAgents(serviceIds)
  → global.sendLiveNotification(agentId, { type: 'service_notes_updated' })
  → frontend recebe 'live_notification' → loadNotes(true)
```

### Resolução de Conflitos (First-to-Sync-Wins)

Quando dois agentes concluem a mesma nota simultaneamente:

```sql
UPDATE service_notes SET status = 'CONCLUIDO', ...
WHERE id = $5 AND status = 'PENDENTE' AND (assigned_to = $1 OR assigned_to IS NULL)
```

1. **Agente A** sincroniza primeiro → SQL executa, status vira `CONCLUIDO`
2. **Agente B** sincroniza depois → SQL não afeta linhas (status já é CONCLUIDO), retorna `null`
3. Backend identifica que a nota já está concluída → retorna `200 { alreadyCompleted: true }`
4. Frontend marca como `synced` (não retenta), dado preservado até `clearSynced()`

### Prefetch no Boot (AgentContext.tsx)
Ao iniciar o app, em background:
- Dashboard, Predicted, Security Report, Calendar, Holidays
- **Service Notes**: `getAssignedServiceNotes()` + `getServiceNoteDetail()` para cada nota (cache dos formulários)
- `getVisibleGroups()` — cache dos grupos visíveis
- `getCreatableGroups()` — cache dos grupos com permissão de criação

Isso garante que o agente tenha todos os dados disponíveis offline logo ao abrir o app.

### Grupos Públicos vs Restritos

| Característica | Público (`allow_all_agents=true`) | Restrito |
|---|---|---|
| Visível na lista? | Sempre | Só se tem notas atribuídas |
| Notas ao entrar | Todas do grupo (archived=false) | Só as atribuídas ao agente |
| Contagens | LEFT JOIN COUNT com todas as notas | Só notas atribuídas |

### Campos do Banco

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | SERIAL | PK |
| `group_id` | INTEGER | FK para service_groups |
| `title` | VARCHAR | Título |
| `description` | TEXT | Descrição ou JSON de campos |
| `coordinates` | VARCHAR | "lat,lng" |
| `latitude` | DOUBLE | Latitude |
| `longitude` | DOUBLE | Longitude |
| `address` | TEXT | Endereço |
| `status` | VARCHAR | PENDENTE ou CONCLUIDO |
| `assigned_to` | VARCHAR | Matrícula do agente |
| `completed_by` | VARCHAR | Quem concluiu |
| `completed_at` | TIMESTAMP | Data de conclusão |
| `completion_coordinates` | VARCHAR | Coordenadas da conclusão |
| `completion_data` | JSONB | Respostas do formulário |
| `marker_category_id` | INTEGER | Categoria do marcador |
| `self_registered` | BOOLEAN | Criado pelo próprio agente |
| `archived` | BOOLEAN | Arquivo lógico (default false) |
| `created_at` | TIMESTAMP | Criação |
| `updated_at` | TIMESTAMP | Atualização |

---

## 7. Assistente de IA Administrativa (Service Notes Chat Agent)

O Control Center conta com um assistente virtual baseado em LLM (Gemini) integrado diretamente ao módulo de Notas de Serviço. Ele permite que o gestor comande em linguagem natural as ações do grupo de serviços ativo, além de suportar anexos de arquivos (áudio, imagens, PDFs, planilhas) para auxiliar nas tarefas administrativas.

### 7.1. Fluxo de Proposta e Aprovação (Human-in-the-Loop)
Para garantir a integridade dos dados e o controle absoluto do gestor, a IA **não executa modificações diretamente no banco de dados**. O fluxo opera da seguinte forma:
1. O gestor envia uma mensagem ou anexo (ex: *"Importe estes novos serviços a partir desta foto"*).
2. A IA utiliza ferramentas de **apenas leitura** (`listar_agentes`, `listar_servicos`, `listar_categorias_marcadores`) para consultar o estado atual do sistema.
3. Se a instrução exigir uma alteração (criação, edição, atribuição, restauração, arquivamento ou mudança no formulário de conclusão), a IA monta um array estruturado no corpo de sua resposta em formato JSON (`proposedActions`).
4. O frontend do chat intercepta esse JSON, oculta-o da janela de chat e renderiza um **Banner de Ações Propostas** com uma lista legível de alterações e um botão **"Aplicar"**.
5. Ao clicar em **"Aplicar"**, o frontend envia as ações estruturadas para o endpoint `/chat/apply`, executando-as em lote no backend de forma transparente.

### 7.2. Ferramentas de Leitura Disponíveis à IA
* **`listar_agentes`**: Lista os colaboradores ativos com seus respectivos IDs e nomes para atribuição por nome próprio.
* **`listar_servicos`**: Lista os serviços do grupo ativo filtrados por status ou arquivamento.
* **`listar_categorias_marcadores`**: Lista as tags e categorias visuais de pins disponíveis no grupo ativo.

### 7.3. Formatos JSON de Ações Propostas (`proposedActions`)

#### A. Criar Serviço (`criar_servico`)
```json
{
  "type": "criar_servico",
  "params": {
    "title": "Ajustar Medidor A1685229",
    "description": "etapa: 03 | medidor: A1685229 | nome: FRANCISCA DAS CHAGAS",
    "address": "R. GARJAO 3820 SANTO ANTONIO",
    "latitude": -5.1595097,
    "longitude": -42.7635119,
    "markerCategoryId": 1
  }
}
```

#### B. Editar Serviço (`editar_servico`)
```json
{
  "type": "editar_servico",
  "params": {
    "serviceId": 123,
    "updates": {
      "title": "Novo Título",
      "description": "Nova Descrição",
      "status": "PENDENTE",
      "archived": false
    }
  }
}
```

#### C. Atribuir Serviços (`atribuir_servicos`)
```json
{
  "type": "atribuir_servicos",
  "params": {
    "serviceIds": [123, 124],
    "agentId": "T60702"
  }
}
```
*Nota: Para remover a atribuição de um serviço, o campo `agentId` deve ser enviado como `null`.*

#### D. Restaurar Serviços Concluídos (`restaurar_servicos`)
```json
{
  "type": "restaurar_servicos",
  "params": {
    "serviceIds": [123, 124]
  }
}
```

#### E. Arquivar Serviços (`arquivar_servicos`)
```json
{
  "type": "arquivar_servicos",
  "params": {
    "serviceIds": [123, 124]
  }
}
```

#### F. Criar/Editar Formulário de Conclusão (`criar_editar_formulario_conclusao`)
```json
{
  "type": "criar_editar_formulario_conclusao",
  "params": {
    "campos": [
      { "id": "tipo_defeitos", "label": "Defeitos Encontrados", "type": "radio", "options": ["Vazamento", "Outro"], "required": true },
      { "id": "foto_fachada", "label": "Foto da Fachada", "type": "image", "required": false }
    ]
  }
}
```

### 7.4. Mecanismo de Cura Sequencial do Histórico (`tool_call_id`)
A API da OpenAI/Gemini exige que toda mensagem com o papel (`role`) `'tool'` contenha um `tool_call_id` correspondente à chamada feita anteriormente pelo assistente. Em conversas legadas ou históricas migradas sem este ID, requisições falhariam com erro 400.
Para mitigar isso de forma resiliente, o backend implementa um **pareador e curador dinâmico sequencial** no arquivo `back/src/functions/database/serviceNotesChat.js`:
1. Durante a reconstrução do histórico para enviar ao LLM, o sistema detecta mensagens do tipo `'tool'` sem `tool_call_id`.
2. O pareador sequencial busca a correspondência com a chamada pendente do assistente logo anterior no histórico de mensagens.
3. Ao encontrar o ID correspondente, o backend atualiza a mensagem no banco de dados (`UPDATE service_notes_chat_messages`) para persistir a cura.
4. Caso o ID não possa ser curado, a mensagem órfã é descartada da pilha enviada ao LLM para prevenir erros de validação na API.

