# Check lists

## POST /admin/checklists/templates

Cria um novo template de checklist.

### Body

| Campo | Tipo | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|
| title | string | sim | - | Nome do template |
| description | string | não | - | Descrição opcional |
| estado | string | não | null | Sigla do estado (ex: SP, RJ). Se null, disponível para todos |

### Response 201
```json
{
  "id": "uuid",
  "title": "nome",
  "description": "desc",
  "is_active": true,
  "estado": "SP",
  "created_by": 1,
  "created_at": "...",
  "updated_at": "..."
}
```

---

## Dashboard de Checklists (Admin)

Endpoints administrativos montados em `/admin/dashboard/*` com autenticação JWT e módulo `checklists`.

### GET /admin/dashboard/filter-options

Retorna listas de valores únicos para os filtros do dashboard.

#### Response 200
```json
{
  "regionais": ["NORTE", "SUL", "LESTE"],
  "seccionais": ["UAC01", "UAC02"],
  "estados": ["PI", "MA"],
  "gestores": ["CARLOS SILVA", "MARIA SOUZA"]
}
```

---

### GET /admin/dashboard/stats

Retorna KPIs consolidados do dashboard.

#### Query Params
| Parâmetro | Tipo | Descrição |
|---|---|---|
| date_from | string | Data inicial (YYYY-MM-DD). Padrão: hoje |
| date_to | string | Data final (YYYY-MM-DD). Padrão: hoje |
| regional | string | Filtrar por regional |
| sectional | string | Filtrar por seccional |
| estado | string | Filtrar por estado |
| gestor | string | Filtrar por gestor |

#### Response 200
```json
{
  "active_agents": 150,
  "total_checklists": 120,
  "compliant": 90,
  "non_compliant": 30,
  "compliance_rate": 75,
  "regional_breakdown": [
    { "regional": "NORTE", "total_agents": 50, "submitted": 40, "pending": 10, "percentage": 20 }
  ],
  "pending_agents": [
    { "agent_id": "123", "nome": "João", "regional": "NORTE", "seccional": "UAC01", "estado": "PI", "cargo": "LEITURISTA A PÉ" }
  ]
}
```

---

### GET /admin/dashboard/non-compliant-items

Lista itens não conformes agregados (para gráfico de barras).

#### Query Params
Mesmos parâmetros de filtro do `/stats`.

#### Response 200
```json
[
  { "label": "Uso de EPIs", "count": 15 },
  { "label": "Sinalização", "count": 8 }
]
```

---

### GET /admin/dashboard/alerts

Lista itens críticos/alerta com severidade.

#### Query Params
Mesmos parâmetros de filtro do `/stats`.

#### Response 200
```json
[
  {
    "checklist_id": "uuid",
    "agent_id": "123",
    "agent_nome": "João",
    "question": "Ferramenta danificada",
    "severity": "critical",
    "date": "2026-06-24",
    "observation": "Martelo com cabo solto",
    "photo_url": "https://..."
  }
]
```

---

### GET /admin/dashboard/checklists

Lista paginada de checklists com dados enriquecidos do agente.

#### Query Params
| Parâmetro | Tipo | Descrição |
|---|---|---|
| page | integer | Página (padrão: 1) |
| limit | integer | Itens por página (padrão: 15) |
| agent_name | string | Filtrar por nome ou ID do agente |
| date_from | string | Data inicial |
| date_to | string | Data final |
| type | string | `official` ou `supplementary` |
| severity_alert | string | `true` para apenas críticos |
| status | string | Status do checklist |
| regional | string | Filtrar por regional |
| sectional | string | Filtrar por seccional |
| estado | string | Filtrar por estado |
| gestor | string | Filtrar por gestor |

#### Response 200
```json
{
  "data": [
    {
      "id": "uuid",
      "agent_id": "123",
      "agent_nome": "João Silva",
      "agent_cargo": "LEITURISTA A PÉ",
      "agent_regional": "NORTE",
      "agent_seccional": "UAC01",
      "agent_estado": "PI",
      "agent_gestor": "CARLOS SILVA",
      "type": "official",
      "date": "2026-06-24",
      "status": "submitted",
      "has_critical_non_compliant": false,
      "submitted_at": "2026-06-24T10:30:00Z",
      "template_title": "Checklist Diário",
      "compliant_count": 8,
      "non_compliant_count": 2,
      "total_count": 10
    }
  ],
  "total": 100,
  "page": 1,
  "limit": 15,
  "totalPages": 7
}
```

---

### GET /admin/dashboard/pending-agents

Lista paginada de agentes com cargo obrigatório que **não** enviaram checklist no período.

Regras:
- Apenas agentes com `situacao = 'active'`
- Apenas cargos obrigatórios: `LEITURISTA A PÉ`, `NEGOCIADOR MOTOCICLISTA`, `LEITURISTA MOTOCICLISTA`, `COBRADOR MOTOCICLISTA`
- Exclui agentes que já possuem checklist submetido na data do período

#### Query Params
| Parâmetro | Tipo | Descrição |
|---|---|---|
| page | integer | Página (padrão: 1) |
| limit | integer | Itens por página (padrão: 20) |
| agent_name | string | Filtrar por nome do agente (ILIKE) |
| date_from | string | Data inicial (padrão: hoje) |
| date_to | string | Data final (padrão: hoje) |
| regional | string | Filtrar por regional |
| sectional | string | Filtrar por seccional |
| estado | string | Filtrar por estado |
| gestor | string | Filtrar por gestor |

#### Response 200
```json
{
  "data": [
    {
      "agent_id": "456",
      "nome": "Maria Oliveira",
      "regional": "SUL",
      "seccional": "UAC03",
      "estado": "MA",
      "cargo": "COBRADOR MOTOCICLISTA",
      "gestor": "PEDRO SANTOS"
    }
  ],
  "total": 5,
  "page": 1,
  "limit": 20,
  "totalPages": 1
}
```

---
Atualiza um template existente.

### Body (todos opcionais)
| Campo | Tipo | Descrição |
|---|---|---|
| title | string | Nome do template |
| description | string | Descrição |
| is_active | boolean | Ativar/desativar |
| estado | string ou null | Sigla do estado. null = todos os estados |

---

## GET /agent/checklists/templates

Lista templates ativos para o agente, filtrados pelo estado do agente.

- Retorna templates com `estado = null` (todos os estados) **ou** `estado = estado_do_agente`
- Se o agente for de SP, vê templates de SP e templates sem estado definido

---

## GET /agent/checklists/today

Retorna o checklist do dia para o agente, ou indica que o cargo é isento.

### Response 200 — Com checklist pendente
```json
{
  "checklist": {
    "id": "uuid",
    "template_id": "uuid",
    "status": "pending",
    ...
  }
}
```

### Response 200 — Cargo isento (sem checklist)
```json
{
  "checklist_required": false
}
```

### Fluxo de Isenção (checklist_required)

O campo `checklist_required` é definido com base no cargo do agente:
- **`false`** — o cargo do agente **não exige** preenchimento de checklist diário. O frontend e o nativo ignoram completamente o reminder.
- **Ausente/`true`** — o cargo exige checklist. O sistema de reminder agressivo (nativo + frontend) é ativado.

### Como a isenção é propagada

```
Backend (GET /agent/checklists/today)
    │
    ├── retorna { checklist_required: false }
    │
    ▼
Frontend (dataService.getTodayChecklist)
    │
    ├── detecta checklist_required === false
    ├── escreve 'exempt' no Capacitor Preferences (checklist_today_status)
    └── DailyChecklistGuard libera o agente sem bloqueio
    │
    ▼
Mobile Nativo (TrackingForegroundService.checkChecklistAndAct)
    │
    ├── lê status 'exempt' do CapacitorPreferences
    └── trata como 'done' — cancela notificação e não abre o app
```

---

## POST /admin/checklists/templates/:id/sections

Cria uma nova seção em um template.

### Body

| Campo | Tipo | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|
| title | string | sim | - | Nome da seção |
| order_index | integer | não | 0 | Ordem |
| section_color | string | não | '#3B82F6' | Cor hexadecimal (ex: #10B981) |
| section_icon | string | não | 'ShieldCheck' | Nome do ícone Lucide pré-definido |

### Ícones pré-definidos

| Nome | Rótulo |
|---|---|
| ShieldCheck | Segurança |
| Shield | Proteção |
| Lock | Trancado |
| Eye | Vigilância |
| AlertTriangle | Alerta |
| Flame | Incêndio |
| Droplets | Água |
| Zap | Elétrica |
| Tool | Ferramentas |
| HardHat | EPI |
| ClipboardCheck | Checklist |
| FileText | Documentos |
| MapPin | Localização |
| Car | Veículos |
| Users | Pessoal |
| Building | Instalações |
| Door | Portas |
| Key | Chaves |
| Camera | Câmeras |
| Bell | Alarme |
| Radio | Comunicação |
| Wind | Ventilação |
| Thermometer | Temperatura |
| Package | Materiais |
| Wifi | Rede |
| Power | Energia |
| Heart | Saúde |

### Response 201
```json
{
  "id": "uuid",
  "template_id": "uuid",
  "title": "nome",
  "order_index": 0,
  "section_color": "#10B981",
  "section_icon": "ShieldCheck",
  "created_at": "2025-01-01T00:00:00Z"
}
```

---

## PUT /admin/checklists/sections/:sectionId

Atualiza uma seção existente.

### Body (todos opcionais)
| Campo | Tipo | Descrição |
|---|---|---|
| title | string | Nome da seção |
| order_index | integer | Ordem |
| section_color | string | Cor hexadecimal |
| section_icon | string | Nome do ícone Lucide |

---

## POST /admin/checklists/sections/:sectionId/questions

Cria uma nova pergunta em uma seção.

### Body

| Campo | Tipo | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|
| label | string | sim | - | Texto da pergunta |
| template_id | uuid | sim | - | ID do template |
| required | boolean | não | true | Se é obrigatório |
| requires_photo | boolean | não | false | Se exige foto |
| severity | string | não | 'medium' | 'critical', 'alert', 'normal' |
| exemption_days | integer | não | 0 | Dias de isenção |
| order_index | integer | não | 0 | Ordem |
| question_type | string | não | 'binary' | 'binary', 'multiple_choice', 'rating' |
| options | array/object | não | null | Opções customizadas |

### Tipos de pergunta

- **`binary`**: resposta Sim/Não (Conforme/Não Conforme). `options` = null.
- **`multiple_choice`**: opções customizadas. `options` = array de `{ label, value, is_compliant }`.

  Exemplo:
  ```json
  [
    { "label": "Bem", "value": "bem", "is_compliant": true },
    { "label": "Mais ou menos", "value": "mais_ou_menos", "is_compliant": false },
    { "label": "Mal", "value": "mal", "is_compliant": false }
  ]
  ```

- **`rating`**: avaliação numérica. `options` = `{ min, max, compliant_threshold }`.

  Exemplo:
  ```json
  { "min": 1, "max": 5, "compliant_threshold": 4 }
  ```

### Response 201
```json
{
  "id": "uuid",
  "section_id": "uuid",
  "template_id": "uuid",
  "label": "texto",
  "required": true,
  "requires_photo": false,
  "severity": "normal",
  "exemption_days": 0,
  "order_index": 0,
  "question_type": "multiple_choice",
  "options": [...]
}
```

---

## PUT /admin/checklists/questions/:questionId

Atualiza uma pergunta existente.

### Body (todos opcionais)
| Campo | Tipo | Descrição |
|---|---|---|
| label | string | Texto da pergunta |
| required | boolean | Obrigatoriedade |
| requires_photo | boolean | Exige foto |
| severity | string | 'critical', 'alert', 'normal' |
| exemption_days | integer | Dias de isenção |
| order_index | integer | Ordem |
| question_type | string | 'binary', 'multiple_choice', 'rating' |
| options | array/object | Opções customizadas (null para limpar) |

### Response 200
```json
{ "id": "uuid", ... }
```

---

## POST /agent/checklists

Envia/submete um checklist pelo aplicativo do agente.

### Body (Payload Principal)
| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| template_id | uuid | sim | ID do template do checklist |
| type | string | não | Tipo do checklist (padrão: `official`) |
| parent_checklist_id | uuid | não | ID do checklist pai (se aplicável) |
| date | string | sim | Data de referência (YYYY-MM-DD) |
| local_id | uuid/string | não | Identificador único local para tratamento de idempotência e sincronização offline |
| latitude | number | não | Coordenada de latitude |
| longitude | number | não | Coordenada de longitude |
| coordinates | string | não | String combinada de coordenadas geográficas |
| signature_url | string | não | Assinatura digital do agente em base64 (`data:image/png;base64,...`) |
| selfie_url | string | não | Foto tipo selfie de finalização do agente em base64 com timestamp overlay (`data:image/jpeg;base64,...`) |
| answers | array | sim | Lista de respostas para cada pergunta (ver objeto abaixo) |

### Body - Answer
| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| question_id | uuid | sim | ID da pergunta correspondente |
| is_compliant | boolean | sim (se não isento) | Se está em conformidade (`true`/`false`) |
| is_exempt | boolean | não | Se o item foi marcado como isento |
| photo_url | string | não | Foto da evidência em base64 com timestamp overlay (`data:image/jpeg;base64,...`) |
| answer_value | string | não | Valor da resposta selecionada (obrigatório para `multiple_choice` e `rating`) |

### Response 201
```json
{
  "success": true,
  "checklist": {
    "id": "uuid",
    "agent_id": 12,
    "template_id": "uuid",
    "date": "2026-06-16",
    "status": "completed",
    "signature_url": "https://storage.cenos...png",
    "selfie_url": "https://storage.cenos...jpg",
    "created_at": "..."
  }
}
```

---

## POST /agent/checklists/:id/sync

Sincroniza um checklist que foi salvo localmente em modo offline. Possui o mesmo comportamento de criação do `POST /agent/checklists` porém permitindo a definição explícita do ID gerado localmente pelo dispositivo móvel para correlação imediata de logs e mídias.

### Body
Mesmo formato do `POST /agent/checklists` mas o ID fornecido na URL é assumido como o identificador definitivo da submissão no banco de dados.

### Response 200
```json
{
  "success": true,
  "checklist": {
    "id": "uuid-da-url",
    "status": "completed",
    "created_at": "..."
  }
}
```

---

## GET /agent/checklists/:id/pdf

Gera PDF do checklist.

O PDF exibe:
- **binary**: "Conforme" / "Não Conforme"
- **multiple_choice**: label da opção selecionada
- **rating**: valor selecionado (ex: "4/5")
- **Assinatura e Selfie**: renderiza a imagem da assinatura digital e da selfie capturadas pelo agente.

---

## Funcionamento Offline-First (Sincronização & Queue)

O aplicativo móvel do agente funciona em modelo **offline-first**, garantindo que checklists de segurança possam ser preenchidos e concluídos mesmo sem conectividade de rede.

1. **Armazenamento Local (IndexedDB)**: Os templates ativos, formulários com regras de isenção e históricos de hoje são cacheados localmente com políticas de TTL definidas no IndexedDB local.
2. **Fila de Sincronização (Sync Queue)**: Ao finalizar um checklist sem conexão ativa com a internet:
   - Uma submissão simulada é salva imediatamente no IndexedDB local (`STORES.CHECKLIST_HISTORY`) para exibição imediata nas telas de listagem e detalhes do aplicativo.
   - O payload completo (com fotos, selfie e assinatura em base64) é enfileirado no `syncQueue` com o tipo de operação `checklist_submit`.
3. **Processamento em Background (Sync Manager)**: Assim que a conexão de rede é restabelecida, o `syncManager` detecta a fila pendente e dispara a requisição para `POST /agent/checklists/:id/sync` de forma transparente.
4. **Idempotência**: O backend utiliza o campo `local_id` enviado no payload para evitar duplicações de registros caso a mesma requisição offline seja transmitida mais de uma vez.

---

## Captura de Fotos com Timestamp Overlay

Visando auditorias de segurança mais confiáveis, a captura de fotos no checklist exige o uso de câmera integrada com marcas d'água de data e hora:

1. **Componente de Câmera**: Utiliza o componente unificado `CameraWithTimestamp` que acessa a câmera física do dispositivo.
2. **Processamento de Imagem (Frontend)**: 
   - A imagem capturada é processada em um elemento `<canvas>` que desenha um timestamp legível (`DD/MM/AAAA HH:mm:ss`) no canto inferior da foto.
   - A imagem resultante é comprimida e convertida para string `base64` no formato Data URL.
3. **Upload e Armazenamento (Backend)**:
   - Ao receber os payloads com mídias em base64 (`selfie_url`, `signature_url` ou `photo_url`), o servidor backend processa-os usando a rotina `processBase64Files()`.
   - Os arquivos são enviados para o serviço de storage (MinIO/S3) e os links resultantes substituem as strings base64 nas tabelas do banco de dados (`checklists` e `checklist_answers`).

---

## Filtro de Templates e Estados

O sistema possui controle geográfico e de ciclo de vida sobre os templates de checklists disponíveis:

1. **Filtro de Estado (UF)**:
   - Administradores podem vincular um template a um estado brasileiro específico (ex: `SP`, `RJ`) ou deixá-lo global (estado como `NULL`).
   - A rota de consulta do agente (`GET /agent/checklists/templates`) filtra e retorna apenas os templates que combinam com o estado do agente autenticado (`req.colaborador.estado`) ou que sejam globais (`estado IS NULL`).
2. **Ciclo de Vida (Ativo/Inativo)**:
   - Agentes de campo recebem apenas templates com `is_active = true`.
   - Administradores no Painel de Controle visualizam e gerenciam a listagem completa (ativos e inativos) em `/control/checklist-templates`. Podem alterar o status de ativação (`is_active`) a qualquer momento através do modal de edição.

---

## Filtros de Visibilidade por Seção

Cada seção de um template pode ser configurada com filtros que determinam quais agentes podem visualizar aquela seção ao preencher o formulário.

Os filtros são armazenados no JSONB `checklist_templates.data` como `section.filters`:

```json
{
  "cargo": ["NEG", "TEC"],
  "regional": ["NORTE"],
  "seccional": ["UAC01"],
  "processo": ["PROC_A"]
}
```

### Regras

- **AND entre categorias**: o agente precisa bater em **todas** as categorias definidas (cargo E regional E seccional E processo).
- **OR dentro de cada categoria**: basta o agente ter **um** dos valores da lista (ex: cargo = "NEG" OU "TEC").
- **Sem filtro** (`null` ou omitido): a seção fica visível para todos os agentes.
- **Filtragem server-side**: ocorre na função `getTemplateById(id, agentId)` chamada pela rota `GET /agent/checklists/form/:templateId`. O perfil do agente é buscado na tabela `colaboradores` (colunas `Cargo`, `seccional`, `regional`, `processo`) e as seções são filtradas antes de retornar.

### Admin UI

No editor de template (`SectionEditModal`), o administrador vê 4 multi-selects para configurar os filtros:
- **Cargo**: populado da tabela `colaboradores`
- **Regional**: populado da tabela `localidades`
- **Seccional (UAC)**: populado da tabela `localidades`
- **Processo**: populado da tabela `colaboradores`

---

## Assistente de IA para Templates de Checklist

Permite que administradores utilizem um chat com inteligência artificial (Gemini) para sugerir, criar e estruturar templates de checklist de forma interativa.

### GET /admin/checklists/templates/:id/chat

Recupera o histórico de mensagens do assistente IA para o template especificado.

#### Response 200
```json
[
  {
    "id": 1,
    "role": "user",
    "content": "Adicione um grupo de segurança de EPIs com luvas e botas",
    "attachments": null,
    "created_at": "2026-06-16T18:22:24Z"
  },
  {
    "id": 2,
    "role": "assistant",
    "content": "Pronto! Adicionei a seção de EPIs com perguntas obrigatórias de luvas e botas.",
    "attachments": null,
    "created_at": "2026-06-16T18:22:26Z"
  }
]
```

---

### POST /admin/checklists/templates/:id/chat

Envia uma mensagem para o assistente IA, passando a estrutura atual do template para processamento.

#### Body
| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| message | string | sim (se sem anexos) | Mensagem ou instrução do usuário |
| currentStructure | object | sim | Estrutura JSON atual do template contendo seções e perguntas |
| attachments | array | não | Lista de anexos como imagens ou áudios |

#### Response 200
```json
{
  "message": {
    "id": 3,
    "role": "assistant",
    "content": "Adicionei a seção de conformidade elétrica com 3 perguntas...",
    "created_at": "..."
  },
  "parsedStructure": {
    "title": "Checklist de Campo",
    "description": "...",
    "sections": [
      {
        "title": "Equipamentos de Proteção",
        "section_color": "#3B82F6",
        "section_icon": "HardHat",
        "questions": [
          {
            "label": "O técnico está usando luvas isolantes?",
            "required": true,
            "requires_photo": false,
            "severity": "critical",
            "question_type": "binary"
          }
        ]
      }
    ]
  }
}
```

---

### POST /admin/checklists/templates/:id/chat/apply

Aplica e sincroniza a estrutura de seções e perguntas proposta pela IA no banco de dados. Efetua inserções, atualizações e deleções de forma relacional transacional.

#### Body
| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| proposedStructure | object | sim | A estrutura JSON retornada pelo assistente IA em `parsedStructure` |

#### Response 200
```json
{
  "success": true
}
```

---

### DELETE /admin/checklists/templates/:id/chat

Limpa todo o histórico de conversação do assistente IA para o template.

#### Response 200
```json
{
  "success": true
}
```

---

## Sistema de Filtros Dinâmicos (V2)

O sistema foi evoluído para usar **filtros dinâmicos baseados em templates** em vez de cargos fixos. Cada template pode definir `data.filters` que determinam quais agentes são obrigados a preenchê-lo.

### Fluxo de Obrigatoriedade

```
GET /agent/checklists/requirements
    │
    ├── Backend (getAgentTemplatesStatus)
    │   ├── Busca perfil do agente (cargo, regional, seccional, processo, estado)
    │   ├── Busca templates ativos filtrados pelo estado
    │   ├── Para cada template, verifica se data.filters batem com perfil
    │   ├── Templates sem filters → OBRIGA todos agentes ativos
    │   └── Retorna { checklist_required, all_submitted, required_templates: [...] }
    │
    ▼
Frontend (DailyChecklistGuard)
    ├── Se checklist_required === false → libera (exempt)
    ├── Se all_submitted === true → libera (done)  
    └── Se não → bloqueia com overlay pendente
```

### Template sem filtros

Se um template não possui `data.filters` (ou está vazio), ele obriga **todos** os agentes ativos independentemente de cargo.

### Múltiplos templates

Um agente pode ser obrigado a preencher **vários templates**. O `DailyChecklistGuard` só libera quando todos forem submetidos. O `ChecklistNew` filtra da lista os templates já submetidos no dia.

---

## GET /agent/checklists/requirements

Retorna os templates obrigatórios para o agente hoje, baseado no matching dinâmico.

### Response 200
```json
{
  "checklist_required": true,
  "all_submitted": false,
  "total_required": 2,
  "total_submitted": 1,
  "required_templates": [
    { "id": "uuid", "title": "Checklist Diário", "submitted": true },
    { "id": "uuid", "title": "Checklist Semanal", "submitted": false }
  ]
}
```

### Regras de Matching

- **AND entre dimensões**: o agente precisa bater em **todas** as dimensões definidas no filtro
- **OR dentro de cada dimensão**: basta o agente ter **um** dos valores
- Template **sem filters**: obriga todos agentes ativos (qualquer cargo, regional, etc.)

---

## Dashboard V2 — `/admin/dashboard/v2/*`

Endpoints que usam **filtros dinâmicos dos templates** em vez de cargos fixos. Todos os endpoints V2 respeitam as permissões de estado do admin via `getUserAllowedStatePools`.

### GET /admin/dashboard/v2/templates

Lista templates ativos respeitando permissões de estado do admin.

#### Response 200
```json
[
  { "id": "uuid", "title": "Checklist Diário", "estado": null },
  { "id": "uuid", "title": "Checklist PI", "estado": "PI" }
]
```

---

### GET /admin/dashboard/v2/stats

KPIs por template. Se `template_id` for informado, retorna apenas dados daquele template.  
Se `template_id` não for informado, agrega todos os templates que o admin tem permissão de ver.

#### Query Params
| Parâmetro | Tipo | Descrição |
|---|---|---|
| date_from | string | Data inicial (YYYY-MM-DD) |
| date_to | string | Data final (YYYY-MM-DD) |
| template_id | string | Filtrar por template específico |
| regional | string | Filtrar por regional |
| sectional | string | Filtrar por seccional |
| estado | string | Filtrar por estado |
| gestor | string | Filtrar por gestor |

#### Response 200
```json
{
  "active_agents": 150,
  "total_checklists": 120,
  "compliant": 90,
  "non_compliant": 30,
  "compliance_rate": 75,
  "templates_breakdown": [
    {
      "template_id": "uuid",
      "template_title": "Checklist Diário",
      "active_agents": 100,
      "total_checklists": 80,
      "compliant": 60,
      "non_compliant": 20,
      "compliance_rate": 75
    }
  ],
  "regional_breakdown": [
    { "regional": "NORTE", "total_agents": 50, "submitted": 40, "pending": 10, "percentage": 20 }
  ],
  "pending_agents": [...]
}
```

---

### GET /admin/dashboard/v2/non-compliant-items

Lista itens não conformes agregados (para gráfico de barras), baseada nos filtros dos templates e permissões do admin.

#### Query Params
| Parâmetro | Tipo | Descrição |
|---|---|---|
| date_from | string | Data inicial (YYYY-MM-DD) |
| date_to | string | Data final (YYYY-MM-DD) |
| template_id | string | Filtrar por template (opcional) |
| regional | string | Filtrar por regional |
| sectional | string | Filtrar por seccional |
| estado | string | Filtrar por estado |
| gestor | string | Filtrar por gestor |

#### Response 200
```json
[
  { "label": "Uso de EPIs", "count": 15 },
  { "label": "Sinalização", "count": 8 }
]
```

---

### GET /admin/dashboard/v2/alerts

Lista itens críticos/alerta com severidade, baseada nos filtros dos templates.

#### Query Params
Mesmos parâmetros de filtro do `/v2/non-compliant-items`.

#### Response 200
```json
[
  {
    "checklist_id": "uuid",
    "agent_id": "123",
    "agent_nome": "João",
    "question": "Ferramenta danificada",
    "severity": "critical",
    "date": "2026-06-24",
    "observation": "Martelo com cabo solto",
    "photo_url": "https://..."
  }
]
```

---

### GET /admin/dashboard/v2/pending-agents

Lista paginada de agentes que não enviaram checklist, baseada nos filtros dos templates e permissões do admin.

#### Query Params
| Parâmetro | Tipo | Descrição |
|---|---|---|
| page | integer | Página (padrão: 1) |
| limit | integer | Itens por página (padrão: 20) |
| template_id | string | Filtrar por template (opcional) |
| agent_name | string | Filtrar por nome (ILIKE) |
| regional | string | Filtrar por regional |
| sectional | string | Filtrar por seccional |
| estado | string | Filtrar por estado |
| gestor | string | Filtrar por gestor |

#### Response 200
```json
{
  "data": [
    { "agent_id": "456", "nome": "Maria", "cargo": "LEITURISTA A PÉ", ... }
  ],
  "total": 5,
  "page": 1,
  "limit": 20,
  "totalPages": 1
}
```

---

## Isenções de Checklist por Agente (`agent_exemptions`)

Permite que administradores isentem um agente específico de responder o checklist por um período determinado. Durante a isenção, o agente não aparece como pendente em nenhum endpoint e o app não o bloqueia na tela de checklist.

### Regras de Negócio

- O período mínimo de isenção é **um dia** (data inicial = data final).
- **Domingos** são automaticamente isentos para todos os agentes — independente de isenções manuais.
- A isenção é verificada **em todos** os endpoints que expõem listas de agentes ou obrigatoriedade de checklist.
- Toda isenção criada fica **registrada no banco para auditoria** — não é possível editar, apenas criar e remover.
- Ao final do período de isenção, o agente volta automaticamente a ser cobrado sem nenhuma ação manual.

---

### Tabela `agent_exemptions`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | UUID | Identificador único |
| `agent_id` | VARCHAR | ID do agente (FK → `login.id`) |
| `start_date` | DATE | Data de início da isenção (inclusive) |
| `end_date` | DATE | Data de fim da isenção (inclusive) |
| `reason` | TEXT | Motivo (opcional, para auditoria) |
| `created_by` | INTEGER | ID do admin que criou (FK → `users.id`) |
| `created_at` | TIMESTAMP | Timestamp de criação |

---

### Função `isAgentExempt(agentId, dateStr)`

Centralizada em `src/functions/database/agentExemptions.js`. Retorna `true` se:

1. O dia da semana da `dateStr` for **domingo** (0 = domingo em `getUTCDay()`), **OU**
2. Existir uma linha em `agent_exemptions` onde `agent_id = agentId` E `start_date <= dateStr` E `end_date >= dateStr`.

```js
const exempt = await isAgentExempt(agentId, todayStr);
if (exempt) {
  return res.json({ checklist_required: false, exempted: true });
}
```

---

### Permissões

| Módulo | Descrição |
|---|---|
| `view_agent_exemptions` | Visualizar histórico de isenções de um agente |
| `create_agent_exemption` | Criar isenções para agentes |
| `delete_agent_exemption` | Deletar/revogar isenções de agentes |

---

### GET /admin/agents/:agentId/exemptions

Lista todas as isenções de um agente (históricas e futuras).

**Permissão:** `view_agent_exemptions`

#### Response 200
```json
[
  {
    "id": "uuid",
    "agent_id": "T60702",
    "start_date": "2026-06-25",
    "end_date": "2026-07-05",
    "reason": "Férias",
    "created_by_name": "Admin Principal",
    "created_at": "2026-06-25T21:00:00Z"
  }
]
```

---

### POST /admin/agents/:agentId/exemptions

Cria uma nova isenção para o agente.

**Permissão:** `create_agent_exemption`

#### Body
| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `start_date` | string (YYYY-MM-DD) | sim | Data de início |
| `end_date` | string (YYYY-MM-DD) | sim | Data de fim (≥ start_date) |
| `reason` | string | não | Motivo da isenção |

#### Validações (Zod)
- `end_date` deve ser ≥ `start_date` (erro `400` caso contrário).

#### Response 201
```json
{
  "id": "uuid",
  "agent_id": "T60702",
  "start_date": "2026-06-25",
  "end_date": "2026-07-05",
  "reason": "Férias",
  "created_by": 1,
  "created_at": "2026-06-25T21:00:00Z"
}
```

---

### DELETE /admin/agents/:agentId/exemptions/:exemptionId

Remove uma isenção. A remoção é imediata — se a isenção estava ativa, o agente volta a ser cobrado na próxima verificação.

**Permissão:** `delete_agent_exemption`

#### Response 204
Sem corpo.

---

### Impacto nos Endpoints do Agente

#### GET /agent/checklists/today

Antes de verificar o checklist do dia, agora chama `isAgentExempt`. Se o agente estiver isento:

```json
{ "checklist": null, "checklist_required": false, "exempted": true }
```

#### GET /agent/checklists/requirements

Antes de calcular os templates obrigatórios, agora chama `isAgentExempt`. Se o agente estiver isento:

```json
{
  "checklist_required": false,
  "exempted": true,
  "exemption_reason": "manual_exemption",
  "required_templates": [],
  "all_submitted": true,
  "total_required": 0,
  "total_submitted": 0
}
```

O campo `exemption_reason` pode ser `"sunday"` (domingo) ou `"manual_exemption"` (isenção cadastrada).

---

### Impacto no Dashboard Admin

#### GET /admin/dashboard/v2/stats

Passa a retornar o campo adicional `exempted_agents` no objeto de KPIs:

```json
{
  "active_agents": 150,
  "completed_agents": 90,
  "pending_agents": 45,
  "exempted_agents": 15,
  "total_checklists": 120,
  "compliant": 90,
  "non_compliant": 30,
  "compliance_rate": 75,
  ...
}
```

`exempted_agents` = quantidade de agentes elegíveis que possuem isenção ativa **hoje** (inclui domingos).

#### GET /admin/dashboard/v2/pending-agents

Agentes isentos **não** aparecem nesta lista. A query exclui automaticamente qualquer agente com isenção ativa para a data consultada.

---

## Dashboard V2 — Agrupamento e Rastreio de Não Conformidades

O dashboard implementa agrupamento inteligente de itens não conformes, rastreando **sequências de dias consecutivos** (streaks) que um colaborador apresenta o mesmo problema.

### Lógica de Agrupamento

Quando um colaborador marca a mesma pergunta como não conforme em múltiplos dias, o sistema:

1. Busca **todas as datas históricas** (sem filtro de período) em que a pergunta foi reportada como não conforme
2. Divide essas datas em **streaks separadas** usando a lógica de consecutividade com fins de semana
3. **Cada streak vira um item independente** — se há um gap entre streaks, são não conformidades distintas

Cada item retornado contém:

- **`consecutive_days`**: Tamanho daquela streak específica
- **`dates`**: Datas que compõem aquela streak (ordenadas cronologicamente)

#### Exemplo Prático — Múltiplas Streaks

```
Colaborador: João Silva
Pergunta: "Bota de segurança está em boas condições?"

Todas as datas históricas reportadas:
- 01/07 (Seg): Não conforme
- 02/07 (Ter): Não conforme  
- 03/07 (Qua): Não conforme
- 07/07 (Seg): Não conforme
- 08/07 (Ter): Não conforme
- 11/07 (Sexta): Não conforme
- 12/07 (Sábado): Não conforme
- 14/07 (Segunda): Não conforme

Resultado — 3 itens separados:

Item 1:
- consecutive_days: 3
- dates: ["2026-07-01", "2026-07-02", "2026-07-03"]

Item 2:
- consecutive_days: 2
- dates: ["2026-07-07", "2026-07-08"]

Item 3:
- consecutive_days: 3
- dates: ["2026-07-11", "2026-07-12", "2026-07-14"]  (sábado e domingo não quebram)
```

### GET /admin/dashboard/v2/alerts (Modificado)

Lista itens críticos/alerta agrupados por colaborador+pergunta.

#### Query Params
| Parâmetro | Tipo | Descrição |
|---|---|---|
| date_from | string | Data inicial (YYYY-MM-DD) |
| date_to | string | Data final (YYYY-MM-DD) |
| template_id | string | Filtrar por template (opcional) |
| regional | string | Filtrar por regional |
| sectional | string | Filtrar por seccional |
| estado | string | Filtrar por estado |
| gestor | string | Filtrar por gestor |
| export_raw | boolean | `true` para dados brutos (exportação Excel) |

#### Response 200 (Modo Normal)
```json
[
  {
    "checklist_id": null,
    "agent_id": "123",
    "agent_nome": "João Silva",
    "agent_matricula": "T60702",
    "regional": "NORTE",
    "seccional": "UAC01",
    "gestor": "Carlos Silva",
    "question": "Bota de segurança danificada",
    "severity": "critical",
    "date": "2026-07-14",
    "consecutive_days": 3,
    "dates": ["2026-07-11", "2026-07-12", "2026-07-14"]
  }
]
```

#### Response 200 (export_raw = true)
Retorna dados brutos sem agrupamento (cada linha = uma ocorrência individual).

---

### GET /admin/dashboard/v2/non-conformities (Novo)

Lista itens não conformes **que não são críticos nem de atenção**, agrupados por colaborador+pergunta.

#### Query Params
Mesmos parâmetros do `/v2/alerts`.

#### Response 200 (Modo Normal)
```json
[
  {
    "checklist_id": null,
    "agent_id": "456",
    "agent_nome": "Maria Oliveira",
    "agent_matricula": "T60801",
    "regional": "SUL",
    "seccional": "UAC03",
    "gestor": "Pedro Santos",
    "question": "Extintor fora da validade",
    "severity": "normal",
    "date": "2026-07-05",
    "consecutive_days": 2,
    "dates": ["2026-07-04", "2026-07-05"]
  }
]
```

---

### Comportamento por Modo

| Modo | `export_raw` | Comportamento |
|------|-------------|---------------|
| **Normal** | `false` (padrão) | Agrupa por `agent_id` + `question` + `severity`, divide em streaks. Cada streak = 1 item |
| **Exportação** | `true` | Retorna linhas individuais para Excel (até 5000 registros) |

### Cálculo de Dias Consecutivos

O cálculo é realizado em JavaScript após a query SQL, considerando **fins de semana como dias não-quebrantes**:

```javascript
/**
 * Conta quantos dias de fim de semana (sáb/dom) existem entre duas datas.
 */
function weekendDaysBetween(d1Str, d2Str) {
  const d1 = new Date(d1Str + 'T00:00:00');
  const d2 = new Date(d2Str + 'T00:00:00');
  const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
  let count = 0;
  for (let i = 1; i < diffDays; i++) {
    const d = new Date(d1.getTime() + i * 86400000);
    if (d.getDay() === 0 || d.getDay() === 6) count++;
  }
  return count;
}

/**
 * Dois dias são "consecutivos" se o gap de dias úteis entre eles (excluindo
 * fins de semana) for <= 1.
 * Exemplos:
 *   Sex(11) → Sab(12): gap=1, we=0 → 1 ≤ 1 ✓ consecutivo
 *   Sex(11) → Seg(14): gap=3, we=2 → 3-2=1 ≤ 1 ✓ consecutivo
 *   Sab(12) → Seg(14): gap=2, we=1 → 2-1=1 ≤ 1 ✓ consecutivo
 *   Seg(14) → Sex(18): gap=4, we=2 → 4-2=2 > 1 ✗ não consecutivo
 *   Ter(15) → Sex(18): gap=3, we=2 → 3-2=1 ≤ 1 ✓ consecutivo
 *   Seg(07) → Ter(08) → [Qua não reportada] → Sex(10):
 *     Ter→Sex: gap=3, we=2 → 3-2=1 ≤ 1 ✓ consecutivo!
 */
function isConsecutive(d1Str, d2Str) {
  const rawDiff = Math.round((new Date(d2Str + 'T00:00:00') - new Date(d1Str + 'T00:00:00')) / 86400000);
  const we = weekendDaysBetween(d1Str, d2Str);
  return (rawDiff - we) <= 1;
}
```

#### Regras

- **Sexta + Sábado + Segunda** = consecutivo (fim de semana entre sexta e segunda é pulado)
- **Sábado + Segunda** = consecutivo (domingo entre eles é pulado)
- **Segunda + Terça + [Quarta pula] + Sexta** = consecutivo (quarta pula, quinta é o gap, sexta fecha)
- **Segunda + Terça + [Quarta pula] + Quinta** = não consecutivo (quinta exige 2 dias úteis sem reporte)
- **Segunda + [Terça pula] + Quarta** = não consecutivo (gap de 1 dia útil sem reporte)
- **Sexta + Segunda** = consecutivo (gap de 1 dia útil considerando fds)

#### Exemplo Prático

```
Colaborador: João Silva
Pergunta: "Bota de segurança está em boas condições?"

Dias reportados (todas as datas históricas):
07/07 (Seg), 08/07 (Ter), 09/07 (Qua), 10/07 (Qui),
11/07 (Sex), 13/07 (Seg), 15/07 (Ter), 17/07 (Qui)

Splitting em streaks:
- Streak 1: 07/07 → 08/07 → 09/07 → 10/07 → 11/07 (5 dias seguidos)
  - Seg→Ter→Qua→Qui→Sex: todos consecutivos ✓
- Gap: Sex(11) → Seg(13): fds entre eles, mas é consecutivo! → incluído na streak 1
- Continuação streak 1: 11/07(Sex) → 13/07(Seg): sex→sáb→dom→seg = consecutivo ✓
- Streak 1 final: 07/07 → 08/07 → 09/07 → 10/07 → 11/07 → 13/07 (6 dias)
- Gap: 13/07(Seg) → 15/07(Ter): gap de 1 dia útil (14/07 = segunda... wait)
  - 13/07 = Seg, 15/07 = Ter. rawDiff=2, weekendDaysBetween=0 → 2-0=2 > 1 ✗ → streak quebra

- Streak 2: 15/07 → 17/07
  - 15/07(Ter) → 17/07(Qui): gap=2, we=0 → 2 > 1 ✗ → streak quebra

- Streak 2: apenas 15/07 (1 dia)
- Streak 3: apenas 17/07 (1 dia)

Resultado — 3 itens:
  Item 1: consecutive_days=6, dates=[07/07, 08/07, 09/07, 10/07, 11/07, 13/07]
  Item 2: consecutive_days=1, dates=[15/07]
  Item 3: consecutive_days=1, dates=[17/07]
```

#### Cada Streak é um Item Independente

O sistema retorna **todas as streaks** como itens separados. Se um colaborador teve uma sequência de 5 dias, depois um gap, e depois 2 dias, isso gera **dois itens** distintos nos painéis de Alertas e Não Conformidades.

Isso permite que o admin visualize padrões como:
- "O agente teve 3 ocorrências seguidas, parou, e recomeçou"
- "O problema persiste há X streaks diferentes ao longo do tempo"

- `dates` = datas daquela streak específica (ordenadas cronologicamente)
- `consecutive_days` = tamanho daquela streak específica
- `date` = última data da streak (para ordenação)

### Frontend — Painéis de Alertas e Não Conformidades

Os painéis `AlertsPanel` e `NonConformitiesPanel` exibem:

1. **Lista resumida** (até 8 itens) com badge de dias consecutivos quando > 1
2. **Botão "Ver todos"** que abre um modal com todos os itens
3. **Modal de detalhes** (`DetailsModal`) com:
   - Lista expansível de todos os itens
   - Badge "X dias seguidos" quando aplicável
   - Lista de todas as datas com não conformidade
   - Link para o checklist (quando disponível)

### Interface TypeScript (Frontend)

```typescript
interface SecurityAlert {
  checklist_id: string | null;
  agent_id: string;
  agent_nome: string;
  agent_matricula?: string;
  seccional?: string;
  regional?: string;
  gestor?: string;
  question: string;
  severity: 'critical' | 'alert' | 'normal';
  date: string;
  submitted_at?: string | null;
  observation?: string | null;
  photo_url?: string | null;
  consecutive_days?: number;
  dates?: string[];
}
```

