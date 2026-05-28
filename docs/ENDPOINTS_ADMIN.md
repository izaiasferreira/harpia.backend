# Endpoints Administrativos (Admin-Facing APIs)

Este documento descreve os endpoints utilizados no Painel de Controle Administrativo (Control Center), organizados por módulos de negócio e segurança.

---

## 1. Regras Gerais de Acesso

* **Prefixo padrão:** `/admin/*`
* **Autenticação:** Requer cabeçalho `Authorization: Bearer <token>` contendo o JWT válido de administrador.
* **Módulos & Segurança:** Cada rota administrativa requer a posse do `ModuleId` associado (ex: `users`, `forms`, `tracking`) configurado nas permissões do usuário logado.

---

## 2. Sistema de Usuários, Permissões e Módulos

Gerencia as credenciais dos gestores do sistema, associando-os a níveis geográficos de supervisão (PI/MA, regionais, seccionais) e permissões de módulos.

### `POST /admin/user/login`
Autenticação administrativa com e-mail e senha. Retorna o token JWT assinado.

**Body:**
```json
{
  "email": "gestor@cenos.com.br",
  "senha": "senha_secreta"
}
```

**Resposta 200:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5...",
  "user": {
    "id": 1,
    "email": "gestor@cenos.com.br",
    "nome": "João Silva",
    "role": "COMPANY_ADMIN",
    "estado": "pi"
  }
}
```

---

### `GET /admin/users_agents`
Lista os colaboradores de campo (técnicos) cadastrados no sistema. Suporta filtros por seccional, regional, gestor, estado e busca textual.

**Resposta 200 (JSON):**
Retorna uma lista de agentes enriquecida com campos de login e inventário:
```json
[
  {
    "id": "T12345",
    "matricula": "12345",
    "nome": "João da Silva",
    "estado": "pi",
    "regional": "METROPOLITANA",
    "seccional": "UAC TERESINA",
    "setor": "LEITURA",
    "cargo": "AGENTE COMERCIAL A PÉ",
    "telegram_id": "987654321",
    "has_inventory": true
  }
]
```

* **Mapeamento Adicional:** Cada registro inclui a propriedade computada `has_inventory` (boolean), que sinaliza de forma reativa se aquele agente possui um inventário ativo cadastrado no sistema.
* **Exportação CSV:** O botão de exportação da listagem em massa gera um arquivo delimitado por ponto e vírgula (`;`) contendo o BOM (`\uFEFF`) e as colunas adicionais **"TEM TELEGRAM"** e **"TEM INVENTÁRIO"**.


---

### `POST /admin/users_agents`
Cadastra um novo colaborador de campo.

**Body:**
```json
{
  "matricula": "T60702",
  "nome": "João Silva",
  "cargo": "LEITURISTA A PÉ",
  "estado": "pi",
  "regional": "METROPOLITANA",
  "seccional": "UAC TERESINA"
}
```

---

### `GET /admin/branch` / `POST /admin/branch`
CRUD de filiais e regionais operacionais.

---

### `GET /admin/permission` / `POST /admin/permission`
CRUD de perfis de permissão (grupos de módulos e filtros geográficos).

---

## 3. Construtor de Formulários Dinâmicos e Assistente IA

Os formulários dinâmicos de vistoria são criados visualmente pelo administrador e sincronizados com os PWAs de campo.

### `POST /admin/forms`
Cria um formulário dinâmico definindo sua estrutura de perguntas obrigatórias.

**Body:**
```json
{
    "title": "Pesquisa de Vistoria de Medidor",
    "description": "Formulário de preenchimento obrigatório em campo",
    "coverUrl": "https://capas.cenos.com/foto.jpg",
    "settings": { "primaryColor": "#EF4444" },
    "structure": [
        {
            "title": "Dados Gerais",
            "elements": [
                {
                    "id": "foto_medidor",
                    "type": "question",
                    "field_type": "image",
                    "label": "Foto do Medidor",
                    "required": true
                }
            ]
        }
    ]
}
```

---

### `POST /admin/forms/:id/chat` (Assistente IA)
Permite criar ou modificar a estrutura de um formulário dinâmico enviando instruções de texto natural para a IA (Gemini ou OpenAI). A IA responde e sugere uma nova estrutura JSON pronta para aplicação.

**Body:**
```json
{
    "message": "Adicione um campo obrigatório do tipo foto para registrar a fachada do imóvel",
    "currentStructure": { "title": "...", "structure": [] }
}
```

**Resposta 200:**
```json
{
    "text": "Compreendido! Adicionei o campo 'Foto da Fachada' como obrigatório na página 1.",
    "parsedStructure": { "title": "...", "structure": [...] }
}
```

---

### `GET /admin/forms/:id/responses`
Lista as respostas coletadas para um formulário específico.

---

### `DELETE /admin/forms/responses/:id`
Exclui uma resposta de formulário específica do banco de dados (módulo `delete_form_response`).

---

### `GET /admin/forms/:id/export`
Exporta as respostas consolidadas de um formulário no formato CSV otimizado para o Microsoft Excel (com BOM UTF-8).

---

## 4. Rastreamento e Monitoria em Tempo Real (Tracking)

Gerencia a telemetria, detecção de acidentes, trajetos e velocidades de agentes em campo.

### `POST /agent/tracking/sync`
Invocado pelo aplicativo do agente a cada 5 minutos (offline-first batch sync) para transmitir as coordenadas e eventos coletados em background pelo GPS.

**Body:**
```json
{
  "points": [
    { "lat": -5.089, "lng": -42.801, "speed": 12.5, "accuracy": 8, "timestamp": 1716000000000 }
  ],
  "violations": [
    { "lat": -5.089, "lng": -42.801, "speed": 92.3, "speedLimit": 80, "timestamp": 1716000000000 }
  ],
  "incidents": [
    { "lat": -5.089, "lng": -42.801, "timestamp": 1716000000000 }
  ],
  "alerts": [
    { "type": "proximity_warning", "lat": -5.089, "lng": -42.801, "timestamp": 1716000000000, "details": { "reportId": 42 } }
  ]
}
```

---

### `GET /admin/tracking/agents`
Retorna todos os agentes operacionais com a última posição conhecida traçada em mapa.

---

### `GET /admin/tracking/agent/:id/trail`
Retorna as coordenadas históricas (trilha) percorridas por um agente específico em um determinado período de datas.

---

### `GET /admin/tracking/speed_violations`
Lista as infrações de limite de velocidade (> 80 km/h) disparadas em campo.

---

### `GET /admin/tracking/fall_incidents`
Retorna os incidentes de queda corporal detectados em campo pelo acelerômetro do celular do agente.

---

### `PUT /admin/tracking/fall_incidents/:id`
Permite ao gestor alterar o status do incidente (marcar como emergência confirmada ou falso positivo).

**Body:**
```json
{ "status": "confirmed", "notes": "Agente confirmado em queda, SAMU acionado." }
```

---

## 5. PINs de Aplicativo Standalone

### `POST /admin/agent/generate_app_pin`
Gera o código PIN de 6 dígitos numéricos, válido por 24 horas, para que um colaborador de campo acesse o aplicativo standalone (fora do Telegram Mini App).

**Body:**
```json
{ "agent_id": "T60702" }
```

**Resposta 200:**
```json
{
  "pin": "482917",
  "expires_at": "2026-05-18T15:00:00.000Z"
}
```

---

## 6. Logs de Auditoria do Sistema

Módulo de auditoria de performance, erros e infraestrutura.

### `GET /api/logs/data`
Busca e filtra registros de logs capturados na API e armazenados em cache Redis.

**Headers:** `Authorization: <LOGS_PASSWORD>`

**Query Params:** `page`, `limit`, `route` (busca textual em URLs), `status` (HTTP status code).

---

### `DELETE /api/logs/clear`
Exclui logicamente os logs correspondentes aos filtros selecionados para expurgo de base.

**Headers:** `Authorization: <LOGS_PASSWORD>`

---

## 7. Modelos de Mensagens (Message Templates)

Permite gerenciar textos padrão pré-cadastrados para notificações rápidas enviadas aos leitores e agentes de campo via Telegram.

### `GET /admin/message-templates`
Retorna todos os modelos de mensagens cadastrados.

**Módulo Requerido:** `message_templates`

**Query Params:** `search` (termo de busca), `page` (número da página), `limit` (itens por página).

---

### `POST /admin/message-templates`
Cria um novo modelo de mensagem padrão.

**Body:**
```json
{
  "name": "Equipamento com defeito",
  "text": "Olá agente, detectamos que o seu equipamento está apresentando...",
  "file": "https://url.do/arquivo.png",
  "web_app_button_text": "Abrir App",
  "web_app_button_url": "https://cenos.web.app/"
}
```

---

### `PUT /admin/message-templates/:id`
Atualiza parcialmente os dados de um modelo de mensagem.

---

### `DELETE /admin/message-templates/:id`
Deleta permanentemente um modelo de mensagem do banco.

---

## 8. Consulta Geral de Serviços (Services Consult)

Módulo analítico que oferece ao gestor uma visão de auditoria em tempo real sobre a execução de leituras e vistorias.

### `GET /admin/services`
Lista todos os serviços realizados e em andamento. Suporta scroll infinito no frontend e paginação.

**Módulo Requerido:** `services_consult`

**Query Params:**
| Campo | Tipo | Descrição |
|---|---|---|
| `date` | string | Data da execução no formato `DD.MM.YYYY` (Obrigatório) |
| `search` | string | Termo de busca por matrícula do agente, instalação, regional ou seccional |
| `page` | number | Número da página para paginação de resultados |

---

## 9. Revalidação de Auditorias (Revalidate)

Módulo de revalidação de fotos de auditoria armazenadas no bucket MinIO `auditorias-pi`. Permite visualizar fotos pendentes de revalidação e marcar como validadas ou invalidadas.

**Autenticação:** Token de query param `token` (mesmo do `/admin/*`).

**Armazenamento:** Fotos armazenadas no MinIO bucket `auditorias-pi`, acessíveis via `/files/auditorias-pi/{caminho}`.

### `GET /admin/revalidate/files_for_revalidate`
Lista todas as fotos de auditoria pendentes de revalidação (onde `validacao = 'FALSO'` e `revalidacao = 'None'`).

**Query Params:** Nenhum.

**Resposta 200:**
```json
[
  {
    "instalacao": "12345678",
    "data_foto": "15.01.2024",
    "hora_foto": "10.30.25",
    "apontamento": "B001",
    "foto": "http://localhost:3040/files/auditorias-pi/PI/12345678/15.01.2024/103025_B001.jpg"
  }
]
```

---

### `GET /admin/revalidate/files_for_view`
Lista fotos de auditoria com filtros opcionais para visualização.

**Query Params:**
| Campo | Tipo | Descrição |
|---|---|---|
| `date` | string | Data no formato `DD.MM.YYYY` (padrão: hoje) |
| `regional` | string | Filtrar por regional |
| `seccional` | string | Filtrar por seccional |
| `agent` | string | Filtrar por agente |
| `validation` | string | Filtrar por status de validação |

**Resposta 200:**
```json
[
  {
    "instalacao": "12345678",
    "data_foto": "15.01.2024",
    "hora_foto": "10.30.25",
    "apontamento": "B001",
    "foto": "http://localhost:3040/files/auditorias-pi/PI/12345678/15.01.2024/103025_B001.jpg",
    "validacao": "VERDADEIRO"
  }
]
```

---

### `POST /admin/revalidate/revalidate_file`
Salva o resultado da revalidação de uma foto.

**Body:**
```json
{
  "instalacao": "12345678",
  "data": "15.01.2024",
  "validation": "VERDADEIRO"
}
```

| Campo | Tipo | Descrição |
|---|---|---|
| `instalacao` | string | Número da instalação |
| `data` | string | Data da conclusão no formato `DD.MM.YYYY` |
| `validation` | string | Resultado: `VERDADEIRO` (válida) ou `FALSO` (inválida) |

**Resposta 200:**
```json
{
  "status": "success"
}
```

---

### `GET /admin/revalidate/filter_options`
Retorna as opções disponíveis para filtros (datas, regionais, seccionais, agentes).

**Resposta 200:**
```json
{
  "agentes": [],
  "seccionais": [],
  "regionais": [],
  "datas_conclusao": ["15.01.2024", "16.01.2024"],
  "validacoes": ["VERDADEIRO", "FALSO"]
}
```

---

## 10. Módulo de Inventário (Inventory)

Gerencia os equipamentos (PDA/Coletores, Impressoras Térmicas e Maquininhas de Cartão) associados a cada agente comercial em campo.

### `GET /admin/inventory`
Lista os inventários ativos dos agentes no sistema, com suporte a filtros e busca global por texto.

**Query Params:**
| Parâmetro | Tipo | Descrição |
|---|---|---|
| `page` | number | Número da página (padrão: 1) |
| `limit` | number | Limite de itens por página (se algum filtro for ativo, assume `9999` automaticamente para exibir listagem unificada) |
| `estado` | string | Filtro geográfico por estado: `pi` ou `ma` |
| `agente` | string | Busca por ID ou Nome do colaborador |
| `search` | string | Busca textual global que varre todos os campos do registro (Nome, IMEI, Serial, etc.) |

**Resposta 200 (JSON):**
```json
[
  {
    "id": 1,
    "agente": "T12345",
    "pda_imei_1": "358912345678901",
    "pda_imei_2": "358912345678902",
    "pda_numero_serie": "PDA-987654",
    "pda_marca": "Zebra",
    "pda_modelo": "TC21",
    "pda_numero_chip": "5586999999999",
    "pda_versao_android": "11",
    "pda_versao_bluetooth": "5.0",
    "impressora_numero_serie": "IMP-112233",
    "impressora_modelo": "IMPB-42",
    "impressora_marca": "Leopardo",
    "maquininha_numero_serie": "MAQ-556677",
    "maquininha_numero_logico": "123456",
    "estado": "pi",
    "created_at": "2026-05-25T14:02:00.000Z",
    "updated_at": "2026-05-25T19:30:00.000Z",
    "nome": "João da Silva",
    "matricula": "12345",
    "gestor": "Marcos Gestor",
    "regional": "METROPOLITANA",
    "seccional": "UAC TERESINA"
  }
]
```

### `POST /admin/inventory`
Cadastra ou sobrescreve o registro de inventário de um colaborador.

**Body (JSON):**
```json
{
  "agente": "T12345",
  "pda_imei_1": "358912345678901",
  "pda_imei_2": "358912345678902",
  "pda_numero_serie": "PDA-987654",
  "pda_marca": "Zebra",
  "pda_modelo": "TC21",
  "pda_numero_chip": "5586999999999",
  "pda_versao_android": "11",
  "pda_versao_bluetooth": "5.0",
  "impressora_numero_serie": "IMP-112233",
  "impressora_modelo": "IMPB-42",
  "impressora_marca": "Leopardo",
  "maquininha_numero_serie": "MAQ-556677", // Opcional, ou "Não possui maquininha"
  "maquininha_numero_logico": "123456",     // Opcional, ou "Não possui maquininha"
  "estado": "pi"
}
```

* **Campos Opcionais de Maquininha:** Tanto `maquininha_numero_serie` quanto `maquininha_numero_logico` são opcionais. No aplicativo e no formulário administrativo, o usuário pode marcar a opção "Não possui maquininha", a qual salva os dados como nulos ou limpa os inputs mantendo a conformidade do schema.

---

## 10. Módulo de Chat de Suporte Real-Time (Socket.io)

Este módulo gerencia a comunicação síncrona/assíncrona de auditoria imutável entre a central administrativa e os colaboradores em campo.

### `GET /admin/chat/rooms`
Retorna **todos os agentes** do sistema com metadados (regional, seccional, estado, matrícula) e, quando existir sala, a última mensagem trafegada e a contagem de mensagens pendentes (não lidas). Agentes sem sala retornam `id: null` e `last_message: null`.

**Resposta 200 (JSON):**
```json
{
  "success": true,
  "rooms": [
    {
      "id": 1,
      "agent_id": "T12345",
      "name": "Suporte Técnico",
      "type": "suporte",
      "created_at": "2026-05-26T12:00:00.000Z",
      "unread_count": 2,
      "agent_name": "João da Silva",
      "agent_regional": "METROPOLITANA",
      "agent_seccional": "UAC TERESINA",
      "agent_estado": "pi",
      "last_message": { ... }
    },
    {
      "id": null,
      "agent_id": "T99999",
      "name": "Suporte Técnico",
      "type": "suporte",
      "created_at": null,
      "unread_count": 0,
      "agent_name": "Maria Souza",
      "agent_regional": "INTERIOR",
      "agent_seccional": "UAC PARNAÍBA",
      "agent_estado": "pi",
      "last_message": null
    }
  ]
}
```

---

### `POST /admin/chat/rooms`
Cria uma sala de suporte para um agente (se já não existir). Utilizado quando o admin clica em um agente sem sala para iniciar uma conversa.

**Módulo Requerido:** `COMPANY_ADMIN`

**Body:**
| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `agent_id` | string | sim | ID/matrícula do agente |

**Resposta 200 (JSON):**
```json
{
  "success": true,
  "room": {
    "id": 10,
    "agent_id": "T99999",
    "name": "Suporte Técnico",
    "type": "suporte",
    "created_at": "2026-05-26T14:00:00.000Z",
    "agent_name": "Maria Souza",
    "agent_regional": "INTERIOR",
    "agent_seccional": "UAC PARNAÍBA",
    "agent_estado": "pi",
    "last_message": null,
    "unread_count": 0
  }
}
```

---

### `GET /admin/chat/rooms/unread-count`
Retorna o total de salas com mensagens não lidas enviadas por agentes.

**Resposta 200 (JSON):**
```json
{
  "success": true,
  "unread_rooms_count": 3
}
```

---

### `GET /admin/chat/rooms/:roomId/messages`
Recupera o histórico completo e vitalício de mensagens de uma sala de chat. O histórico é imutável: mensagens não possuem endpoints de exclusão ou edição.

**URL Parameters:**
* `roomId`: ID numérico sequencial da sala.

**Resposta 200 (JSON):**
```json
{
  "success": true,
  "messages": [
    {
      "id": 44,
      "room_id": 1,
      "sender_id": "admin_1",
      "sender_type": "admin",
      "sender_name": "Marcos Gestor (Suporte)",
      "message": "Olá João, em que posso te ajudar?",
      "message_type": "text",
      "file_url": null,
      "file_name": null,
      "latitude": null,
      "longitude": null,
      "read": true,
      "created_at": "2026-05-26T12:04:00.000Z"
    }
  ]
}
```

---

### `POST /api/chat/upload`
Endpoint para upload de arquivos multimídia suportados no chat (imagens, vídeos, áudios e documentos pdf/xlsx/docx). Integra com o armazenamento MinIO persistente e seguro.

**Consumes:** `multipart/form-data`

**Body:**
* `file`: Arquivo bruto (máx 15MB).
* `room_id`: ID numérico sequencial da sala de chat.

**Resposta 200 (JSON):**
```json
{
  "success": true,
  "file_url": "/api/chat/file/chat_attachments_1716723223_comercial.pdf",
  "file_name": "comercial.pdf"
}
```

---

### `POST /admin/chat/rooms/:roomId/read`
Marca instantaneamente todas as mensagens recebidas na sala especificada como lidas para o administrador. Dispara sincronização via Socket.io para zerar badges em tempo real.

**URL Parameters:**
* `roomId`: ID numérico da sala.

**Resposta 200 (JSON):**
```json
{
  "success": true,
  "marked_count": 2
}
```

---

## 10. Mensagens Unificadas (Chat Multicanal)

Endpoint unificado que substitui o envio fragmentado de mensagens. Toda mensagem enviada é registrada em `chat_messages` com o canal correspondente, unificando o histórico de comunicação com o agente.

### `POST /admin/messages/send`

Envia mensagem para agente(s) via um ou mais canais e registra no chat unificado.

**Módulo requerido:** JWT Admin (Bearer)

**Content-Type:** `multipart/form-data`

**Campos:**

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `channels` | JSON array | Sim | `["telegram"]`, `["push"]`, `["internal"]`, ou combinação |
| `text` | string | Sim* | Corpo da mensagem (*ou file) |
| `title` | string | Push: sim | Título da notificação push |
| `agent_ids` | JSON array | Sim | IDs dos agentes destinatários |
| `file` | File/string | Não | Anexo — upload (multer) ou URL |
| `webAppButtonText` | string | Não | Texto do botão webapp inline (Telegram) |
| `webAppButtonUrl` | string | Não | URL do botão webapp inline (Telegram) |
| `critical` | "true" | Não | Marca como alerta crítico (overlay no dispositivo) |
| `alertType` | string | Não | `danger`, `warn`, `success` |
| `alertIcon` | string | Não | Emoji do alerta (🚨, ⚠️, 🔥, etc.) |

**Comportamento por canal:**
- `telegram`: Envia via serviço intermediário (`TELEGRAM_API_URL`) + registra em `chat_messages` (channel='telegram')
- `push`: Envia FCM + registra em `chat_messages` (channel='push')
- `overlay`: Envia FCM com critical=true + registra em `chat_messages` (channel='overlay')
- `internal`: Apenas registra em `chat_messages` (channel='internal') + emite via socket.io

**Resposta 200:**
```json
{
  "telegram": { "sent": 3, "failed": 0 },
  "push": { "sent": 3, "failed": 1 },
  "chat": [{ "agentId": "T12345", "roomId": 42, "messageId": 501 }]
}
```

