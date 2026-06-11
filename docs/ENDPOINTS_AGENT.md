# Endpoints do Técnico de Campo (Agent-Facing APIs)

Este documento descreve os endpoints consumidos pelo aplicativo do Técnico de Campo (PWA ou aplicativo nativo).

---

## 1. Regras Gerais de Acesso

* **Prefixo padrão:** `/agent/*`
* **Autenticação:** Requer o cabeçalho `X-Telegram-Init-Data` contendo a string de inicialização do Telegram (TMA) ou o token persistente obtido via login de PIN do aplicativo standalone.
* **Objeto Injetado:** O middleware de autenticação injeta `req.colaborador` contendo a matrícula e o estado federativo do colaborador requisitante (ex: `{ "id": "T60702", "estado": "pi" }`).

---

## 2. Endpoints do Perfil e Desempenho

### `GET /agent/agent_data`
Retorna as credenciais básicas do colaborador autenticado para validação de sessão.

**Resposta 200:**
```json
{ "id": "T60702", "estado": "pi" }
```

---

### `GET /agent/profile`
Retorna o perfil social completo do técnico, contendo seu nome, função, foto de avatar (MinIO), estatísticas de produtividade em campo, metas operacionais e emblemas conquistados (gamificação).

**Resposta 200:**
```json
{
    "user": {
        "name": "Izaias da Silva Ferreira",
        "role": "LEITURISTA A PÉ",
        "location": "REGIONAL METROPOLITANA",
        "photo": "https://api.izi.tec.br/files/assets/profile.png",
        "stats": {
            "level": 4.5,
            "completionRate": 85,
            "fastResponses": 134,
            "points": 4350
        }
    },
    "goals": [
        { "id": 1, "title": "Não ultrapassar mais de 1.10% de CNL", "completed": true },
        { "id": 2, "title": "Ter 80% do CNL indevidos justificado", "completed": true }
    ],
    "badges": [
        {
            "id": 2,
            "title": "Roterizador Master",
            "description": "Completou o treinamento de Roteirização",
            "earned": true,
            "imageUrl": "https://api.izi.tec.br/files/assets/emblema3.png"
        }
    ]
}
```

---

### `POST /agent/profile/upload`
Atualiza a foto de avatar do perfil do colaborador. Suporta uploads multipart `form-data` ou strings JSON em `base64`.

**Body (form-data):**
* `photo` (file): arquivo de imagem

**Resposta 200:** Retorna os metadados do perfil com a URL da foto atualizada no bucket do MinIO.

---

### `GET /agent/badge`
Atribui um emblema de gamificação (badge) manualmente ao perfil do agente.

**Query Params:**
| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `badge` | number | **Sim** | ID do emblema a ser associado. |

---

## 3. Endpoints de Dashboard e Serviços

### `GET /agent/agent_dashboard`
Retorna os dados consolidados do dashboard do agente, incluindo métricas de leituras do dia, pontualidade, CNL e gráficos de desempenho.

**Headers:** `X-Telegram-Init-Data`

**Resposta 200:** Objeto com indicadores operacionais do agente.

---

### `GET /agent/agent_services`
Lista os serviços/leituras atribuídos ao agente com paginação.

**Query Params:**
* `page` (number): número da página. Padrão: `1`.
* `date` (string): filtro por data.
* `filter` (string): tipo de filtro.

---

### `GET /agent/last_update_agent`
Retorna o timestamp da última atualização dos dados do agente.

---

### `GET /agent/custom_links`
Gera os links customizados do agente baseados em suas permissões e grupos.

---

## 4. Endpoints de Consulta de Instalações

### `GET /agent/predicted`
Retorna as vistorias operacionais e leituras com previsões de perdas de energia calculadas pelo sistema central para a rota daquele técnico.

**Query Params:**
* `status` (string): status das leituras (`PENDENTE` ou `CONCLUIDO`). Padrão: `PENDENTE`.
* `page` (number): número da página. Padrão: `1`.
* `limit` (number): limite de resultados. Padrão: `100`.

**Resposta 200:** Array de instalações contendo conta-contrato, endereço e as coordenadas geográficas.

---

### `POST /agent/search_in`
Busca instalações do banco de dados em lote por número da instalação, número do medidor físico ou conta-contrato.

**Body:**
```json
{
    "type": "instalacao",
    "queries": ["123456", "789012"]
}
```

---

### `GET /agent/instalation_details`
Retorna a ficha técnica detalhada e o histórico recente de leituras e impedimentos de uma unidade consumidora específica.

**Query Params:**
* `instalacao` (string, **Obrigatório**): número único da instalação.

**Resposta 200:**
```json
{
    "instalacao": "123456",
    "unidade_leitura": "TH09B011",
    "tipo": "OB",
    "status_ds": "LIGADO",
    "etapa": "09",
    "cidade": "TERESINA",
    "seccional": "UAC TERESINA",
    "regional": "METROPOLITANA",
    "latitude": null,
    "longitude": null,
    "ntlei_historico": ["C12", "C12"],
    "estado": "pi"
}
```

---

## 5. Endpoints de Justificativas e Performance Diária

### `GET /agent/get_justify`
Pesquisa justificativas de falhas de leitura enviadas pelo colaborador.

**Query Params:** `instalacao` (string), `tipo` (string), `data_leit_prev` (string).

---

### `POST /agent/create_justify`
Cria uma justificativa para um erro ou pendência de rota de campo. O sistema impede a criação de duplicidades (mesma instalação e mesma data prevista de leitura).

**Body:**
```json
{
    "instalacao": "18518168",
    "data_leit_prev": "10/04/2026",
    "tipo": "cnl",
    "motivo": "Medidor com defeito",
    "justificativa": "Aparelho quebrado após descarga elétrica local.",
    "foto": "base64_string_aqui"
}
```

---

### `POST /agent/daily_report`
Cria um reporte diário subjetivo (feedback) do técnico sobre suas atividades de campo. É permitido apenas **1 reporte por dia** por colaborador.

**Body:**
```json
{
    "nota": 5,
    "motivo": "Boa performance",
    "observacao": "Finalizei o roteiro 2 horas antes do previsto.",
    "foto": "https://exemplo.com/comprovante.jpg"
}
```

---

### `PUT /agent/update_justify`
Atualiza uma justificativa existente.

**Body:** Campos parciais da justificativa.

---

### `DELETE /agent/delete_justify/:id`
Remove uma justificativa do sistema.

---

### `GET /agent/justify_pending`
Lista as justificativas pendentes de aprovação do agente autenticado.

**Query Params:** `status`, `page`, `limit`

---

### `GET /agent/justify_pending/:id`
Retorna detalhes de uma justificativa pendente específica.

---

### `PUT /agent/justify_pending/:id/respond`
Responde a uma justificativa pendente, aceitando ou rejeitando.

**Body:**
```json
{
  "status": "APROVADO",
  "observacao": "Justificativa aceita"
}
```

---

### `GET /agent/daily_report`
Lista os reportes diários do agente autenticado.

**Query Params:** `data`, `limit`

---

### `GET /agent/daily_report/check_today`
Informa reativamente ao app se o colaborador já enviou seu reporte diário na data atual para evitar submissões em duplicidade.

**Resposta 200:**
```json
{
    "hasReportToday": true,
    "data": { "id": 15, "nota": 5, ... }
}
```

---

### `POST /agent/inventory`
Cria ou atualiza o inventário de equipamentos do agente.

**Body:**
```json
{
  "pda_imei_1": "358912345678901",
  "pda_numero_serie": "PDA-987654",
  "pda_marca": "Zebra",
  "pda_modelo": "TC21"
}
```

---

## 6. Endpoints de Segurança do Técnico (Safety Features)

### `POST /agent/security_check`
Realiza a confirmação diária obrigatória de segurança ("Estou ciente dos riscos operacionais do dia"). Pode ser executada apenas **1 vez por dia** por agente.

**Body:**
```json
{
    "latitude": "-5.0912",
    "longitude": "-42.8021"
}
```

---

### `GET /agent/security_check`
Lista os checks de segurança do agente autenticado.

**Query Params:** `data`, `limit`

---

### `GET /agent/security_check/check_today`
Verifica se o check-in de segurança já foi realizado hoje.

**Resposta 200:**
```json
{ "checked": true, "data": { ... } }
```

---

### `POST /agent/security_report`
Permite ao colaborador reportar geograficamente um local ou instalação perigosa que oferece risco à vida (ex: cão bravo solto, risco de assalto, cabo elétrico caído).

**Body:**
```json
{
    "motivo": "Cão bravo",
    "observacao": "Pitbull de grande porte solto na frente do medidor.",
    "latitude": "-5.0912",
    "longitude": "-42.8021"
}
```

---

### `GET /agent/security_report`
Lista os relatórios de segurança do agente.

---

## 7. Endpoints de Upload de Mídia (MinIO/S3)

### `POST /agent/upload_agent`
Upload otimizado de imagens comprobatórias coletadas pela câmera WebRTC do app. O backend redimensiona, compacta a imagem em até 60% e armazena de forma estruturada no bucket.

**Body:** `multipart/form-data` contendo a chave `file`.

**Resposta 200 (sucesso):**
```json
{
    "success": true,
    "fileName": "agents/123/123456789-ag001-xyz.jpg",
    "url": "https://api.izi.tec.br/files/api-banco-dev/agents/123/...",
    "size": 45000,
    "originalSize": 120000,
    "compression": "62%",
    "mimetype": "image/jpeg"
}
```

---

## 8. Notificações

### `GET /agent/notifications`
Lista paginada de notificações do agente autenticado.

**Query Params:**

| Parâmetro | Tipo | Default | Descrição |
|-----------|------|---------|-----------|
| `page` | number | 1 | Página |
| `limit` | number | 20 | Itens por página (máx 50) |
| `unread_only` | boolean | false | Filtrar apenas não lidas |

**Resposta 200:**
```json
{
  "success": true,
  "notifications": [
    {
      "id": 42,
      "agent_id": "T60702",
      "sender": "sistema_rh",
      "title": "Aviso Importante",
      "body": "Seu treinamento vence amanhã.",
      "type": "warn",
      "method": ["push", "telegram"],
      "read": false,
      "read_at": null,
      "metadata": null,
      "created_at": "2026-05-29T14:30:00.000Z"
    }
  ],
  "total": 150,
  "unread_count": 5,
  "page": 1,
  "pages": 8
}
```

---

### `POST /agent/notifications/read`
Marca notificações como lidas.

**Body (JSON):**
```json
{ "ids": [1, 2, 3] }
```
ou para marcar todas:
```json
{ "all": true }
```

**Resposta 200:**
```json
{ "success": true }
```

---

## 9. Módulo de Chat de Suporte Real-Time (Socket.io)

Endpoints utilizados pelo app do técnico (PWA) para envio de mídias, histórico e controle de mensagens lidas.

### `GET /api/chat/agent/support`
Retorna (e cria se não existir) a sala exclusiva de Suporte entre o Técnico autenticado e a central administrativa, contendo a última mensagem trafegada e a contagem de não lidas.

**Headers:**
* Requere cabeçalho `X-Telegram-Init-Data` com os dados criptografados do Telegram Mini App ou cabeçalho `Authorization: Bearer <token>`.

**Resposta 200 (JSON):**
```json
{
  "success": true,
  "room": {
    "id": 1,
    "agent_id": "T12345",
    "name": "Suporte T12345 - João da Silva",
    "type": "support",
    "created_at": "2026-05-26T12:00:00.000Z",
    "unread_count": 0
  }
}
```

---

### `GET /api/chat/rooms/:roomId/messages`
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
Endpoint para upload de arquivos multimídia suportados no chat (imagens, vídeos, gravação de áudios brutos da API MediaRecorder e documentos pdf/xlsx/docx). Armazenamento em MinIO seguro.

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

### `POST /api/chat/rooms/:roomId/read`
Marca instantaneamente todas as mensagens recebidas na sala especificada como lidas para o agente. Dispara evento Socket.io de sincronização para zerar as badges no app.

**URL Parameters:**
* `roomId`: ID numérico da sala.

**Resposta 200 (JSON):**
```json
{
  "success": true,
  "marked_count": 1
}
```

---

## 10. Módulo de Notas de Serviço (Service Notes)

Endpoints consumidos pelo app do agente para visualização, conclusão e criação de notas de serviço em campo.

### `GET /agent/service-notes`

Retorna todas as notas de serviço atribuídas ao agente autenticado, incluindo metadados do grupo e categoria. Notas arquivadas são excluídas.

**Headers:** `X-Telegram-Init-Data`

**Resposta 200 (JSON):**
```json
[
  {
    "id": 1,
    "group_id": 1,
    "title": "Vistoria na Rua A",
    "description": "Verificar medidor 12345",
    "coordinates": "-5.089,-42.801",
    "latitude": -5.089,
    "longitude": -42.801,
    "address": "Rua A, 123",
    "status": "PENDENTE",
    "assigned_to": "T001",
    "self_registered": false,
    "group_name": "Vistorias Semanais",
    "category_name": "Urgente",
    "category_color": "#FF0000",
    "completion_config": { "formFields": [] },
    "created_at": "2026-05-01T10:00:00.000Z"
  }
]
```

---

### `GET /agent/service-notes/:id`

Retorna os detalhes completos de uma nota de serviço específica, incluindo `completion_config` do grupo para renderização do formulário de conclusão.

**Headers:** `X-Telegram-Init-Data`

**Path Params:** `id` — ID numérico da nota

**Resposta 200 (JSON):** Objeto da nota (mesma estrutura do array acima).

**Resposta 404:**
```json
{ "error": "Nota nao encontrada" }
```

---

### `PUT /agent/service-notes/:id/complete`

Conclui uma nota de serviço atribuída ao agente. Atribui automaticamente se `assigned_to` estiver nulo. Requer que a nota esteja atribuída ao agente ou não atribuída.

**Headers:** `X-Telegram-Init-Data`

**Path Params:** `id` — ID numérico da nota

**Body (JSON):**
| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `coordinates` | string | não | Coordenadas GPS no formato `"lat,lng"` |
| `completionData` | object | não | Dados do formulário dinâmico de conclusão |
| `completedAt` | string (ISO) | não | Timestamp de conclusão (default: now) |

**Resposta 200:**
```json
{
  "success": true,
  "note": { "id": 1, "status": "CONCLUIDO", "completed_by": "T001", ... }
}
```

**Resposta 404:**
```json
{ "error": "Nota nao encontrada ou nao atribuida a voce" }
```

---

### `POST /agent/service-notes/self-register`

Auto-registro de serviço em campo com conclusão imediata (status `CONCLUIDO`). Disponível apenas em grupos com `allow_agent_creation = true` e visibilidade ao agente.

**Headers:** `X-Telegram-Init-Data`

**Body (JSON):**
| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `groupId` | number | **sim** | ID do grupo |
| `title` | string | não | Título (auto-gerado se omitido: "Registro – {grupo} – {data}") |
| `coordinates` | string | não | Coordenadas GPS `"lat,lng"` |
| `completionData` | object | não | Respostas do formulário dinâmico |
| `completedAt` | string (ISO) | não | Timestamp de conclusão |

**Resposta 201:**
```json
{
  "success": true,
  "note": { "id": 99, "status": "CONCLUIDO", "self_registered": true, "assigned_to": "T001", ... }
}
```

**Resposta 400:**
```json
{ "error": "groupId obrigatorio" }
```

**Resposta 403:**
```json
{ "error": "Este grupo nao permite criacao de servicos por agentes" }
```

---

### `POST /agent/service-notes/create`

Cria uma nova nota de serviço com status `PENDENTE`. Disponível apenas em grupos com `allow_agent_creation = true` e visibilidade ao agente.

**Headers:** `X-Telegram-Init-Data`

**Body (JSON):**
| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `group_id` | number | **sim** | ID do grupo |
| `title` | string | **sim** | Título da nota |
| `description` | string | não | Descrição detalhada |
| `coordinates` | string | não | Coordenadas `"lat,lng"` |
| `latitude` | number | não | Latitude (alternativa a coordinates) |
| `longitude` | number | não | Longitude (alternativa a coordinates) |
| `address` | string | não | Endereço textual |
| `marker_category_id` | number | não | ID da categoria de marcador |
| `assignToSelf` | boolean | não | Auto-atribuir ao agente (default: false) |

**Resposta 201:**
```json
{
  "success": true,
  "note": { "id": 100, "status": "PENDENTE", "assigned_to": "T001", "self_registered": true, ... }
}
```

**Resposta 400:**
```json
{ "error": "group_id obrigatorio" }
```

**Resposta 403:**
```json
{ "error": "Este grupo nao permite criacao de servicos por agentes" }
```

---

### `GET /agent/service-notes/groups/visible`

Lista todos os grupos visíveis ao agente (públicos ou com o agente na lista `allowed_agents`), independente de permissão de criação. Usado para exibir grupos no mapa mesmo sem permissão de cadastro.

**Headers:** `X-Telegram-Init-Data`

**Resposta 200 (JSON):**
```json
[
  { "id": 1, "name": "Grupo Público", "allow_all_agents": true, "allow_agent_creation": false },
  { "id": 2, "name": "Grupo Restrito", "allow_all_agents": false, "allowed_agents": ["T001"], "allow_agent_creation": true }
]
```

---

### `GET /agent/service-notes/groups/creatable`

Lista apenas grupos onde o agente pode criar serviços (`allow_agent_creation = true` + visibilidade). Usado no seletor de grupo ao criar uma nova nota de serviço.

**Headers:** `X-Telegram-Init-Data`

**Resposta 200 (JSON):**
```json
[
  { "id": 1, "name": "Grupo Público", "allow_agent_creation": true, "completion_config": { "formFields": [...] } }
]
```

---

### `GET /agent/service-notes/groups/:groupId/categories`

Lista as categorias de marcador disponíveis em um grupo.

**Headers:** `X-Telegram-Init-Data`

**Path Params:** `groupId` — ID numérico do grupo

**Resposta 200 (JSON):**
```json
[
  { "id": 1, "group_id": 1, "name": "Urgente", "color": "#FF0000" },
  { "id": 2, "group_id": 1, "name": "Programado", "color": "#00FF00" }
]
```

---

## 11. Rastreamento GPS (Tracking)

### `POST /agent/tracking/sync`
Envia lote de pontos GPS, violações de velocidade, incidentes de queda e alertas coletados offline.

**Body:**
```json
{
  "points": [{ "lat": -5.089, "lng": -42.801, "speed": 12.5, "accuracy": 8, "timestamp": 1716000000000 }],
  "violations": [{ "lat": -5.089, "lng": -42.801, "speed": 62.3, "speedLimit": 50, "timestamp": 1716000000000 }],
  "incidents": [{ "lat": -5.089, "lng": -42.801, "timestamp": 1716000000000 }]
}
```

---

### `POST /agent/tracking/sync-v2`
Envia lote de pontos GPS com informações extendidas de dispositivo (bateria, rede, modelo) e violações de velocidade.

**Body:**
```json
{
  "points": [{ "lat": -5.089, "lng": -42.801, "speed": 12.5, "accuracy": 8, "batteryLevel": 0.75, "networkType": "4g", "deviceModel": "SM-S908E", "devicePlatform": "android", "osVersion": "14", "timestamp": 1716000000000 }],
  "violations": [{ "lat": -5.089, "lng": -42.801, "speed": 62.3, "speedLimit": 50, "timestamp": 1716000000000 }],
  "deviceInfo": { "batteryLevel": 0.75, "connectionType": "4g", "deviceModel": "SM-S908E", "devicePlatform": "android", "osVersion": "14" }
}
```

---

### `POST /agent/tracking/heartbeat`
Enviado pelo app nativo Android a cada 30s para registrar presença online + última localização. O admin usa `last_heartbeat_at` para determinar status online/offline.

**Body:**
```json
{
  "lat": -5.08921,
  "lng": -42.80174
}
```

---

### `POST /agent/fcm-token`
Registra o token FCM do dispositivo do agente para recebimento de notificações push.

**Body:**
```json
{ "token": "fcm_token_string", "deviceInfo": "android_13" }
```

---

## 12. Treinamentos e Gamificação

### `POST /agent/training/:id/complete`
Marca um treinamento interativo como concluído e atribui a badge correspondente ao agente.

**Path Params:** `id` — ID do treinamento

