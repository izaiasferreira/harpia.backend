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
Lista os colaboradores de campo (técnicos) cadastrados no sistema. Suporta filtros por seccional e regional de atuação.

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

