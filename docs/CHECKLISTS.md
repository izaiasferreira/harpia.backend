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

## PUT /admin/checklists/templates/:id

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
