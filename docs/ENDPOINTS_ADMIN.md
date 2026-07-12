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

### `POST /admin/user/register`
Registra um novo usuário administrativo no sistema.

**Body:**
```json
{
  "email": "novo@cenos.com.br",
  "senha": "senha_secreta",
  "nome": "Maria Souza",
  "role": "REGIONAL_ADMIN",
  "estado": "pi"
}
```

---

### `GET /admin/user/me`
Retorna os dados do usuário administrativo autenticado.

---

### `PUT /admin/user/me/password`
Permite que o próprio usuário administrativo altere sua senha. Requer a senha atual para verificação.

**Body:**
```json
{
  "senha_atual": "minha_senha_atual",
  "nova_senha": "minha_nova_senha"
}
```

**Resposta 200:**
```json
{ "success": true }
```

**Erro 401:**
```json
{ "error": "Senha atual incorreta" }
```

**Regras de validação de senha:**
- Mínimo 8 caracteres
- Pelo menos 1 letra maiúscula
- Pelo menos 1 letra minúscula
- Pelo menos 1 número
- Pelo menos 1 caractere especial

---

### `PUT /admin/user/me`
Permite que o próprio usuário administrativo atualize seu nome e/ou foto de perfil.

**Body:**
```json
{
  "nome": "Novo Nome",
  "foto": "https://minio.url/admin-profiles/1_1717000000000.jpg"
}
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `nome` | string | não | Novo nome do usuário |
| `foto` | string \| null | não | URL da foto ou null para remover |

**Resposta 200:**
```json
{
  "id": 1,
  "email": "gestor@cenos.com.br",
  "nome": "Novo Nome",
  "role": "COMPANY_ADMIN",
  "ativo": true,
  "foto": "https://minio.url/admin-profiles/1_1717000000000.jpg"
}
```

---

### `POST /admin/user/me/foto`
Faz upload de uma foto de perfil para o usuário administrativo autenticado. Aceita upload multipart (`foto`) ou base64 no body (`foto`). A imagem é comprimida via Sharp e armazenada no MinIO em `admin-profiles/{userId}_{timestamp}.jpg`.

**Content-Type:** `multipart/form-data`

**Body:**
| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `foto` | File (multipart) ou string (base64) | sim | Imagem da foto de perfil |

**Resposta 200:**
```json
{
  "url": "https://minio.url/admin-profiles/1_1717000000000.jpg"
}
```

**Erro 400:**
```json
{ "error": "Nenhuma foto enviada" }
```

---

### `GET /admin/user/users`
Lista todos os usuários administrativos cadastrados.

---

### `GET /admin/user/users/:id`
Retorna detalhes de um usuário administrativo específico.

---

### `PUT /admin/user/users/:id`
Atualiza dados de um usuário administrativo.

---

### `PUT /admin/user/users/:id/password`
Altera a senha de um usuário administrativo.

**Body:**
```json
{ "senha": "nova_senha" }
```

**Regras de validação de senha:**
- Mínimo 8 caracteres
- Pelo menos 1 letra maiúscula
- Pelo menos 1 letra minúscula
- Pelo menos 1 número
- Pelo menos 1 caractere especial

---

### `PUT /admin/user/users/:id/permissions`
Atualiza as permissões de módulo de um usuário.

---

### `DELETE /admin/user/users/:id`
Remove um usuário administrativo do sistema.

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

### `GET /admin/users_agents/:id`
Retorna detalhes de um agente de campo específico.

---

### `PUT /admin/users_agents/:id`
Atualiza dados de um agente de campo.

---

### `DELETE /admin/users_agents/:id`
Remove um agente de campo do sistema.

---

### `GET /admin/users_agents/options`
Retorna listas de valores para filtros (regionais, seccionais, estados).

---

### `GET /admin/branch` / `POST /admin/branch`
CRUD de filiais e regionais operacionais.

---

### `GET /admin/permission` / `POST /admin/permission`
CRUD de perfis de permissão (grupos de módulos e filtros geográficos).

---

### `GET /admin/available_modules`
Retorna a lista de todos os módulos do sistema disponíveis para atribuição de permissões.

---

## 3. Dashboard e Métricas Operacionais

Painel central com métricas em tempo real do desempenho dos agentes de campo.

### `GET /admin/dashboard`
Retorna dados consolidados do dashboard administrativo com indicadores de leituras, pontualidade, CNL e produtividade.

**Módulo Requerido:** `dashboard`

---

### `GET /admin/perdas`
Retorna dados de perdas de energia para análise no dashboard.

---

## 4. Ferramentas de Busca e Consulta

### `POST /admin/search_in`
Busca instalações no banco de dados por matrícula do agente, instalação ou conta-contrato.

**Body:**
```json
{
  "type": "instalacao",
  "queries": ["123456", "789012"]
}
```

---

### `PUT /admin/search_in/:id`
Atualiza dados de uma instalação específica encontrada via busca.

---

## 5. Gestão de Justificativas (Justify)

Módulo de gerenciamento de justificativas de falhas de leitura enviadas pelos agentes de campo.

### `GET /admin/justify`
Lista justificativas de falhas de leitura com filtros.

**Query Params:** `search`, `data`, `tipo`, `regional`, `seccional`, `page`, `limit`

---

### `GET /admin/justify/types`
Retorna os tipos de justificativa disponíveis.

---

### `POST /admin/justify`
Cria uma nova justificativa administrativa.

---

### `PUT /admin/justify/:id`
Atualiza uma justificativa existente.

---

### `DELETE /admin/justify/:id`
Remove uma justificativa do sistema.

---

### `GET /admin/justify_pending`
Lista justificativas pendentes de aprovação.

**Query Params:** `search`, `regional`, `seccional`, `status`, `page`, `limit`

---

### `POST /admin/justify_pending`
Cria uma justificativa pendente.

---

### `PUT /admin/justify_pending/:id`
Atualiza uma justificativa pendente.

---

### `DELETE /admin/justify_pending/:id`
Remove uma justificativa pendente.

---

## 6. Reporte Diário (Daily Report)

### `GET /admin/daily_report`
Lista os reportes diários enviados pelos agentes.

**Query Params:** `search`, `data`, `regional`, `seccional`, `page`, `limit`

---

### `POST /admin/daily_report`
Cria um reporte diário administrativo.

---

### `PUT /admin/daily_report/:id`
Atualiza um reporte diário.

---

### `DELETE /admin/daily_report/:id`
Remove um reporte diário.

---

## 7. Construtor de Formulários Dinâmicos e Assistente IA

Os formulários dinâmicos de vistoria são criados visualmente pelo administrador e sincronizados com os PWAs de campo.

### `GET /admin/forms`
Lista todos os formulários dinâmicos cadastrados.

**Módulo Requerido:** `forms`

---

### `GET /admin/forms/:id`
Retorna detalhes de um formulário específico, incluindo sua estrutura de perguntas.

**Módulo Requerido:** `forms`

---

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

### `GET /admin/forms/:id/chat`

Recupera o histórico de conversas do assistente de IA para o formulário especificado.

**Resposta 200:**
```json
[
  {
    "id": 1,
    "role": "user",
    "content": "Adicione uma nova pergunta do tipo rádio",
    "attachments": null,
    "created_at": "2026-06-03T15:00:00.000Z"
  },
  {
    "id": 2,
    "role": "assistant",
    "content": "Entendido! Adicionei a pergunta...",
    "attachments": null,
    "created_at": "2026-06-03T15:00:05.000Z"
  }
]
```

---

### `POST /admin/forms/:id/chat` (Assistente IA)

Permite criar ou modificar a estrutura de um formulário dinâmico enviando instruções de texto natural e/ou mídias para a IA (Gemini ou OpenAI). A IA responde e sugere uma nova estrutura JSON pronta para aplicação. O assistente é multimodal e aceita o envio de áudio, imagens ou documentos de suporte.

**Body:**
* `message` (string, opcional): Instrução de texto natural.
* `currentStructure` (object, opcional): Estrutura JSON atual do formulário.
* `attachments` (array, opcional): Lista de mídias anexadas (imagens, áudios, etc).
  * `url` (string): Link do arquivo.
  * `name` (string): Nome do arquivo.
  * `mimeType` (string): Tipo MIME.

Exemplo de Body:
```json
{
    "message": "Adicione um campo obrigatório do tipo foto para registrar a fachada do imóvel",
    "currentStructure": { "title": "...", "structure": [] },
    "attachments": []
}
```

**Resposta 200:**
```json
{
    "message": {
        "id": 15,
        "role": "assistant",
        "content": "Compreendido! Adicionei o campo 'Foto da Fachada' como obrigatório na página 1.",
        "created_at": "2026-06-03T15:01:00.000Z"
    },
    "parsedStructure": { "title": "...", "structure": [...] }
}
```

---

### `DELETE /admin/forms/:id/chat`

Limpa todo o histórico de conversas do assistente de IA do formulário especificado.

**Resposta 200:**
```json
{
    "success": true
}
```

---

### `PUT /admin/forms/:id`
Atualiza parcialmente um formulário dinâmico.

**Módulo Requerido:** `update_form`

---

### `DELETE /admin/forms/:id`
Remove um formulário dinâmico.

**Módulo Requerido:** `delete_form`

---

### `GET /admin/forms/:id/stats`
Retorna estatísticas de respostas de um formulário (total de submissões, taxa de preenchimento, etc).

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

## 8. Rastreamento e Monitoria em Tempo Real (Tracking)

Gerencia a telemetria, detecção de acidentes, trajetos e velocidades de agentes em campo.



### `GET /admin/tracking/agents`
Retorna todos os agentes operacionais com a última posição conhecida traçada em mapa (baseado em `tracking_session_points` — compatível com web/PWA).

---

### `GET /admin/tracking/agents-v2`
Retorna agentes com heartbeat (nativo Android) — contém `last_heartbeat_at`, `last_heartbeat_lat`, `last_heartbeat_lng`. Usado pelo admin para determinar online/offline de agentes APK.

---

### `GET /admin/tracking/agent/:id/trail`
Retorna as coordenadas históricas (trilha) percorridas por um agente específico em um determinado período de datas.

---

### `GET /admin/tracking/speed_violations`
Lista as infrações de limite de velocidade (> 50 km/h) disparadas em campo.

### `DELETE /admin/tracking/speed_violations/:id`
Exclui uma infração de velocidade. Requer role `COMPANY_ADMIN`.

**Response 200:**
```json
{ "message": "Violação excluída com sucesso", "violation": { ... } }
```

---



## 9. PINs de Aplicativo Standalone

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

### `GET /admin/agent/app_pins`
Lista todos os PINs gerados, com status de uso e expiração.

---

### `DELETE /admin/agent/app_pins/:id`
Remove um registro de PIN gerado.

---

## 10. Logs de Auditoria do Sistema

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

## 11. Modelos de Mensagens (Message Templates)

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

## 12. Consulta Geral de Serviços (Services Consult)

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

## 13. Revalidação de Auditorias (Revalidate)

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

## 14. Módulo de Inventário (Inventory)

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

### `PUT /admin/inventory/:id`
Atualiza parcialmente um registro de inventário.

---

### `DELETE /admin/inventory/:id`
Remove um registro de inventário.

---

## 14b. Módulo de Equipamentos (Equipment) — Novo Sistema

Sistema completo de gestão de equipamentos (PDA, Impressora, Maquineta) com fluxo de solicitação e aprovação. Cada operação de associação e devolução requer aprovação do administrador.

**Prefixo:** `/admin/equipment/*`

**Autenticação:** JWT Admin (Bearer)

**Módulos de Permissão:** `equipments`, `create_equipment`, `update_equipment`, `delete_equipment`, `request_equipment_assignment`, `unassign_equipment`, `approve_equipment_request`, `view_equipment_history`

---

### `GET /admin/equipment/`

Lista todos os equipamentos com filtros e paginação.

**Módulo Requerido:** `equipments`

**Query Params:**
| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `page` | number | Número da página (padrão: 1) |
| `limit` | number | Itens por página (padrão: 15) |
| `estado` | string | Filtro por estado geográfico |
| `tipo` | string | Filtro por tipo: `pda`, `impressora`, `maquineta` |
| `status` | string | Filtro por status: `disponivel`, `em_uso`, `manutencao`, `inativo` |
| `condicao` | string | Filtro por condição: `otimo`, `bom`, `regular`, `ruim`, `danificado` |
| `search` | string | Busca textual nos dados JSONB e nome do agente |

**Resposta 200:**
```json
{
  "data": [
    {
      "id": 1,
      "tipo": "pda",
      "estado": "pi",
      "dados": { "imei_1": "358912345678901", "numero_serie": "PDA-987654", "marca": "Zebra", "modelo": "TC21" },
      "status": "em_uso",
      "condicao": "bom",
      "fotos": [],
      "criado_por": "42",
      "created_at": "2026-05-25T14:02:00.000Z",
      "updated_at": "2026-05-25T19:30:00.000Z",
      "agente_atual": "t60702",
      "assignment_id": 3,
      "data_associacao": "2026-06-01T10:00:00.000Z"
    }
  ],
  "total": 50,
  "page": 1,
  "limit": 15,
  "totalPages": 4
}
```

---

### `GET /admin/equipment/options`

Retorna opções de filtro e configuração completa dos tipos de equipamento.

**Módulo Requerido:** `equipments`

**Resposta 200:**
```json
{
  "tipos": ["pda", "impressora", "maquineta"],
  "tiposConfig": { "pda": { "label": "PDA", "campos": [...] } },
  "status": ["disponivel", "em_uso", "manutencao", "inativo"],
  "condicoes": ["otimo", "bom", "regular", "ruim", "danificado"]
}
```

---

### `GET /admin/equipment/requests`

Lista solicitações pendentes de associação e devolução de agentes.

**Módulo Requerido:** `approve_equipment_request`

**Query Params:**
| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `page` | number | Número da página |
| `limit` | number | Itens por página |
| `estado` | string | Filtrar por estado do equipamento |

**Resposta 200:**
```json
{
  "data": [
    {
      "id": 5,
      "equipment_id": 1,
      "agente": "t60702",
      "foto_url": "/files/equipment-requests/t60702/photo.jpg",
      "latitude": -5.089,
      "longitude": -42.801,
      "status": "pendente",
      "tipo_solicitacao": "associacao",
      "observacao_agente": "Recebi do técnico",
      "assignment_id": null,
      "created_at": "2026-06-10T10:00:00.000Z",
      "agente_nome": "João da Silva",
      "tipo": "pda",
      "estado": "pi",
      "equipment_status": "disponivel",
      "condicao": "bom",
      "dados": { "imei_1": "358912345678901" }
    }
  ],
  "total": 3,
  "page": 1,
  "limit": 15,
  "totalPages": 1
}
```

> O campo `tipo_solicitacao` indica o tipo da solicitação: `'associacao'` (receber equipamento) ou `'devolucao'` (devolver equipamento).

---

### `GET /admin/equipment/agents/search`

Busca agentes por nome ou matrícula para associação de equipamentos.

**Módulo Requerido:** `assign_equipment`

**Query Params:**
| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `q` | string | Termo de busca (mínimo 2 caracteres) — nome ou matrícula |

**Resposta 200:**
```json
[
  {
    "id": "T60702",
    "nome": "João da Silva",
    "regional": "METROPOLITANA",
    "seccional": "UAC TERESINA",
    "estado": "pi"
  }
]
```

---

### `GET /admin/equipment/agent/:agente`

Retorna todos os equipamentos associados a um agente específico.

**Módulo Requerido:** `equipments`

**Path Params:** `agente` — matrícula do agente

**Resposta 200:** Array de equipamentos com dados de associação.

---

### `GET /admin/equipment/:id`

Retorna detalhes de um equipamento específico.

**Módulo Requerido:** `equipments`

**Path Params:** `id` — ID numérico do equipamento

**Resposta 200:** Objeto do equipamento com `agente_atual` (se associado) e dados de associação.

**Resposta 404:** `{ "error": "Equipamento não encontrado" }`

---

### `GET /admin/equipment/:id/history`

Retorna o histórico unificado de associações e solicitações processadas de um equipamento.

**Módulo Requerido:** `view_equipment_history`

**Path Params:** `id` — ID numérico do equipamento

**Resposta 200:**
```json
{
  "assignments": [
    {
      "id": 3,
      "equipment_id": 1,
      "agente": "t60702",
      "assignado_por": "42",
      "assignado_por_nome": "Admin",
      "data_associacao": "2026-06-01T10:00:00.000Z",
      "data_desassociacao": "2026-06-10T14:00:00.000Z",
      "desassociado_por": "42",
      "desassociado_por_nome": "Admin",
      "status": "encerrada",
      "observacao": "Devolução aprovada via solicitação",
      "created_at": "2026-06-01T10:00:00.000Z",
      "agente_nome": "João da Silva"
    }
  ],
  "requests": [
    {
      "id": 5,
      "equipment_id": 1,
      "agente": "t60702",
      "foto_url": "/files/equipment-requests/t60702/photo.jpg",
      "status": "aprovado",
      "tipo_solicitacao": "devolucao",
      "observacao_agente": "Equipamento com defeito",
      "processado_por": "42",
      "processado_por_nome": "Admin",
      "data_processamento": "2026-06-10T14:30:00.000Z",
      "observacao_admin": null,
      "created_at": "2026-06-10T12:00:00.000Z",
      "agente_nome": "João da Silva"
    }
  ]
}
```

> O histórico retorna duas listas separadas: `assignments` (associações criadas/encerradas) e `requests` (solicitações aprovadas ou rejeitadas, incluindo tipo `associacao` e `devolucao`).

---

### `POST /admin/equipment/`

Cadastra um novo equipamento.

**Módulo Requerido:** `create_equipment`

**Body (JSON):**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `tipo` | string | **sim** | `pda`, `impressora`, `maquineta` |
| `estado` | string | **sim** | Estado geográfico (ex: `pi`, `ma`) |
| `dados` | object | **sim** | Dados específicos do tipo (JSONB) |
| `status` | string | não | `disponivel` (padrão), `manutencao`, `inativo` |
| `condicao` | string | não | `bom` (padrão), `otimo`, `regular`, `ruim`, `danificado` |
| `fotos` | string[] | não | URLs de fotos do equipamento |

**Resposta 201:** Objeto do equipamento criado.

---

### `PUT /admin/equipment/:id`

Atualiza parcialmente um equipamento.

**Módulo Requerido:** `update_equipment`

**Path Params:** `id` — ID numérico do equipamento

**Body (JSON):** Campos parciais (mesmos do POST).

**Resposta 200:** Objeto do equipamento atualizado.

**Resposta 404:** `{ "error": "Equipamento não encontrado" }`

---

### `DELETE /admin/equipment/:id`

Remove um equipamento e todos os seus registros associados (CASCADE).

**Módulo Requerido:** `delete_equipment`

**Path Params:** `id` — ID numérico do equipamento

**Resposta 200:** `{ "id": 1 }`

**Resposta 404:** `{ "error": "Equipamento não encontrado" }`

---

### `POST /admin/equipment/:id/assign`

Cria uma solicitação de associação de equipamento a um agente. Requer comprovação fotográfica. A associação só é efetivada após aprovação do admin.

**Módulo Requerido:** `request_equipment_assignment`

**Content-Type:** `multipart/form-data`

**Campos:**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `agente` | string | **sim** | Matrícula do agente |
| `foto` | File | **sim** | Foto de comprovação |
| `latitude` | number | não | Latitude GPS |
| `longitude` | number | não | Longitude GPS |
| `observacao` | string | não | Observação |

**Resposta 201:** Objeto da solicitação criada com `status: 'pendente'` e `tipo_solicitacao: 'associacao'`.

**Resposta 400:** `{ "error": "Foto de comprovação é obrigatória" }` ou `{ "error": "Equipamento não está disponível" }`

---

### `POST /admin/equipment/:id/unassign`

Cria uma solicitação de devolução de equipamento. Requer comprovação fotográfica. A devolução só é efetivada após aprovação do admin.

**Módulo Requerido:** `unassign_equipment`

**Content-Type:** `multipart/form-data`

**Campos:**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `agente` | string | **sim** | Matrícula do agente atual |
| `foto` | File | **sim** | Foto de comprovação |
| `latitude` | number | não | Latitude GPS |
| `longitude` | number | não | Longitude GPS |
| `observacao` | string | não | Observação |

**Resposta 200:** Objeto da solicitação criada com `status: 'pendente'` e `tipo_solicitacao: 'devolucao'`.

**Resposta 400:** `{ "error": "Foto de comprovação é obrigatória" }` ou `{ "error": "Equipamento não está em uso" }`

---

### `POST /admin/equipment/requests/:id/approve`

Aprova uma solicitação pendente (associação ou devolução).

**Módulo Requerido:** `approve_equipment_request`

**Path Params:** `id` — ID numérico da solicitação

**Comportamento:**
- **Associação:** Cria a `equipment_assignments` e atualiza status do equipamento para `em_uso`.
- **Devolução:** Encerra a `equipment_assignments` ativa e atualiza status do equipamento para `disponivel`.

**Resposta 200:**
```json
{
  "request": { "id": 5, "status": "aprovado", "..." : "..." },
  "assignment": { "id": 3, "status": "ativa", "..." : "..." }
}
```

**Resposta 400:** `{ "error": "Solicitação não encontrada ou já processada" }` ou `{ "error": "Equipamento não está mais disponível" }`

---

### `POST /admin/equipment/requests/:id/reject`

Rejeita uma solicitação pendente.

**Módulo Requerido:** `approve_equipment_request`

**Path Params:** `id` — ID numérico da solicitação

**Body (JSON):**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `observacao_admin` | string | não | Motivo da rejeição |

**Resposta 200:** Objeto da solicitação com `status: 'rejeitado'`.

**Resposta 400:** `{ "error": "Solicitação não encontrada ou já processada" }`

---

### `GET /admin/equipment/:id/history` (resumo)

O endpoint de histórico retorna um objeto `{ assignments, requests }` com dois arrays:
- **`assignments`**: Todas as associações do equipamento (ativas e encerradas), com dados do agente, quem associou/desassociou e observação.
- **`requests`**: Todas as solicitações processadas (aprovadas e rejeitadas), com tipo (`associacao`/`devolucao`), dados da comprovação fotográfica e motivo de rejeição quando aplicável.

Os dois arrays são combinados no frontend num timeline único ordenado por data, permitindo visualizar todo o ciclo de vida do equipamento.

---

## 15. Módulo de Chat de Suporte Real-Time (Socket.io)

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

## 16. Mensagens Unificadas (Chat Multicanal)

Endpoint unificado que substitui o envio fragmentado de mensagens. Toda mensagem enviada é registrada em `chat_messages` com o canal correspondente, unificando o histórico de comunicação com o agente.

### `POST /admin/messages/send`

Envia mensagem para agente(s) via um ou mais canais e registra no chat unificado.

---

### `POST /admin/notifications/broadcast`

Envia notificação em massa para todos os agentes de um estado ou filtro geográfico.

**Módulo Requerido:** `notifications`

**Body (JSON):**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `title` | string | **sim** | Título da notificação |
| `body` | string | **sim** | Corpo da mensagem |
| `type` | string | não | `success`, `warn`, `danger`, `info` |
| `estado` | string | não | Filtrar por estado (`pi` ou `ma`) |
| `method` | string[] | não | Canais: `telegram`, `push`, `internal` |

---

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

---

## 17. Módulo de Notas de Serviço (Service Notes Admin)

Módulo completo de gerenciamento de notas de serviço. Permite criar grupos, categorias, notas, atribuir agentes, importar/exportar e gerenciar conclusões.

**Autenticação:** JWT Admin (Bearer) + módulo `service_notes`

---

### `GET /admin/service-notes/groups`

Lista todos os grupos de serviço ordenados por criação (decrescente).

**Módulo Requerido:** `service_notes`

**Resposta 200 (JSON):**
```json
[
  {
    "id": 1,
    "name": "Vistorias Semanais",
    "description": "Vistorias da semana operacional",
    "completion_config": {},
    "allow_all_agents": true,
    "allowed_agents": [],
    "allow_agent_creation": false,
    "created_at": "2026-05-01T10:00:00.000Z"
  }
]
```

---

### `GET /admin/service-notes/groups/:id`

Retorna detalhes de um grupo específico.

**Módulo Requerido:** `service_notes`

**Path Params:** `id` — ID numérico do grupo

**Resposta 200 (JSON):** Objeto do grupo (mesma estrutura acima)

**Resposta 404:** `{ "error": "Grupo nao encontrado" }`

---

### `POST /admin/service-notes/groups`

Cria um novo grupo de serviço.

**Módulo Requerido:** `create_service_note`

**Body (JSON):**
| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `name` | string | **sim** | Nome do grupo |
| `description` | string | não | Descrição |
| `completion_config` | object | não | Configuração do formulário dinâmico |
| `allow_all_agents` | boolean | não | Visibilidade pública (default: true) |
| `allowed_agents` | string[] | não | Lista de agentes com acesso |
| `allow_agent_creation` | boolean | não | Permite criação por agentes (default: false) |

**Resposta 201 (JSON):** Objeto do grupo criado

---

### `PUT /admin/service-notes/groups/:id`

Atualiza parcialmente um grupo de serviço.

**Módulo Requerido:** `update_service_note`

**Body (JSON):** Campos parciais (mesmos do POST)

**Resposta 200 (JSON):** Objeto do grupo atualizado

**Resposta 404:** `{ "error": "Grupo nao encontrado" }`

---

### `DELETE /admin/service-notes/groups/:id`

Remove um grupo e todas as notas associadas (CASCADE).

**Módulo Requerido:** `delete_service_note`

**Resposta 200:** `{ "success": true, "deleted": { ... } }`

---

### `GET /admin/service-notes/groups/:id/categories`

Lista categorias de marcador de um grupo.

**Módulo Requerido:** `service_notes`

**Resposta 200 (JSON):**
```json
[
  { "id": 1, "group_id": 1, "name": "Urgente", "color": "#FF0000" }
]
```

---

### `POST /admin/service-notes/groups/:id/categories`

Cria uma nova categoria de marcador.

**Módulo Requerido:** `create_service_note`

**Body (JSON):**
| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `name` | string | **sim** | Nome da categoria |
| `color` | string | não | Cor hexadecimal (default: `#2563EB`) |

**Resposta 201 (JSON):** Objeto da categoria criada

---

### `DELETE /admin/service-notes/categories/:id`

Remove uma categoria de marcador.

**Módulo Requerido:** `delete_service_note`

---

### `GET /admin/service-notes`

Lista notas de serviço com filtros avançados.

**Módulo Requerido:** `service_notes`

**Query Params:**
| Parâmetro | Tipo | Descrição |
|---|---|---|
| `groupId` | number | Filtrar por grupo |
| `status` | string | `PENDENTE` ou `CONCLUIDO` |
| `assignedTo` | string | Matrícula do agente ou `__any__` (atribuídos) |
| `archived` | string | `true`, `false` ou `all` |
| `unassigned` | boolean | Apenas não atribuídos |
| `categoryId` | number | Filtrar por categoria |
| `createdFrom` | string (ISO) | Data inicial de criação |
| `createdTo` | string (ISO) | Data final de criação |
| `completedFrom` | string (ISO) | Data inicial de conclusão |
| `completedTo` | string (ISO) | Data final de conclusão |

**Resposta 200 (JSON):**
```json
[
  {
    "id": 1,
    "group_id": 1,
    "title": "Vistoria na Rua A",
    "description": "Verificar medidor",
    "status": "PENDENTE",
    "assigned_to": "T001",
    "group_name": "Vistorias",
    "category_name": "Urgente",
    "category_color": "#FF0000",
    "created_at": "2026-05-01T10:00:00.000Z"
  }
]
```

---

### `GET /admin/service-notes/:id`

Detalhes de uma nota de serviço.

**Módulo Requerido:** `service_notes`

**Resposta 200 (JSON):** Objeto da nota com `completion_config` do grupo

**Resposta 404:** `{ "error": "Nota nao encontrada" }`

---

### `POST /admin/service-notes`

Cria uma nova nota de serviço (admin).

**Módulo Requerido:** `create_service_note`

**Body (JSON):**
| Campo | Tipo | Obrigatório |
|---|---|---|
| `group_id` | number | **sim** |
| `title` | string | **sim** |
| `description` | string | não |
| `coordinates` | string | não |
| `latitude` | number | não |
| `longitude` | number | não |
| `address` | string | não |
| `marker_category_id` | number | não |

---

### `PUT /admin/service-notes/:id`

Atualiza uma nota de serviço.

**Módulo Requerido:** `update_service_note`

---

### `DELETE /admin/service-notes/:id`

Remove uma nota de serviço.

**Módulo Requerido:** `delete_service_note`

---

### `PUT /admin/service-notes/:id/assign`

Atribui ou desatribui uma nota a um agente.

**Módulo Requerido:** `assign_service_notes`

**Body:**
| Campo | Tipo | Descrição |
|---|---|---|
| `userId` | string \| null | Matrícula do agente ou `null` para desatribuir |

---

### `POST /admin/service-notes/bulk-assign`

Atribuição em lote.

**Módulo Requerido:** `assign_service_notes`

**Body:**
| Campo | Tipo |
|---|---|
| `serviceIds` | number[] |
| `userId` | string \| null |

---

### `POST /admin/service-notes/bulk-category`

Altera categoria em lote.

**Módulo Requerido:** `update_service_note`

**Body:**
| Campo | Tipo |
|---|---|
| `serviceIds` | number[] |
| `markerCategoryId` | number \| null |

---

### `POST /admin/service-notes/bulk-delete`

Exclusão em lote.

**Módulo Requerido:** `delete_service_note`

**Body:** `{ "serviceIds": number[] }`

---

### `POST /admin/service-notes/bulk-archive`

Arquivamento em lote.

**Módulo Requerido:** `update_service_note`

---

### `POST /admin/service-notes/bulk-unarchive`

Restaura arquivamento em lote.

**Módulo Requerido:** `update_service_note`

---

### `POST /admin/service-notes/bulk-move`

Move notas entre grupos em lote.

**Módulo Requerido:** `update_service_note`

**Body:**
| Campo | Tipo |
|---|---|
| `serviceIds` | number[] |
| `targetGroupId` | number |

---

### `PUT /admin/service-notes/:id/complete`

Conclusão manual (admin) de uma nota de serviço.

**Módulo Requerido:** `update_service_note`

**Body:**
| Campo | Tipo |
|---|---|
| `completionData` | object \| null |

---

### `POST /admin/service-notes/:id/restore`

Restaura uma nota concluída para PENDENTE.

**Módulo Requerido:** `update_service_note`

---

### `POST /admin/service-notes/bulk-restore`

Restaura múltiplas notas em lote.

**Módulo Requerido:** `update_service_note`

**Body:** `{ "serviceIds": number[] }`

---

### `POST /admin/service-notes/import`

Importa notas a partir de arquivo XLSX ou array JSON.

**Módulo Requerido:** `import_service_notes`

**Content-Type:** `multipart/form-data`

**Campos:**
| Campo | Tipo | Descrição |
|---|---|---|
| `groupId` | number | **sim** — Grupo de destino |
| `file` | File | Arquivo .xlsx com colunas title/titulo, description/descricao, address/endereco, latitude, longitude |
| `notes` | JSON array | Alternativa ao file: array de objetos |

---

### `GET /admin/service-notes/:groupId/chat`

Obtém o histórico de mensagens do assistente de IA administrativo para o grupo de serviço especificado.

**Módulo Requerido:** `service_notes`

**Path Params:**
* `groupId` (number): ID do grupo de serviços ativo.

**Resposta 200:**
```json
[
  {
    "id": 1,
    "role": "user",
    "content": "Listar os serviços pendentes deste grupo",
    "attachments": null,
    "name": null,
    "tool_calls": null,
    "tool_call_id": null,
    "created_at": "2026-06-03T15:00:00.000Z"
  },
  {
    "id": 2,
    "role": "assistant",
    "content": "Aqui estão os serviços pendentes...",
    "attachments": null,
    "name": null,
    "tool_calls": null,
    "tool_call_id": null,
    "created_at": "2026-06-03T15:00:05.000Z"
  }
]
```

---

### `POST /admin/service-notes/:groupId/chat`

Envia uma mensagem (texto e/ou anexos multimídia) para o assistente de IA de Notas de Serviço. A IA analisa os anexos (áudio, imagens, PDFs, planilhas) e propõe ações administrativas em formato de JSON estruturado.

**Módulo Requerido:** `service_notes`

**Path Params:**
* `groupId` (number): ID do grupo de serviços ativo.

**Body (JSON):**
* `message` (string, opcional): Mensagem do usuário.
* `attachments` (array, opcional): Lista de mídias/documentos previamente carregados.
  * `url` (string): Link do arquivo.
  * `name` (string): Nome do arquivo.
  * `mimeType` (string): Tipo MIME.

Exemplo de Body:
```json
{
  "message": "Crie uma nota com prioridade a partir da imagem anexa",
  "attachments": [
    {
      "url": "/api/chat/file/anexo_123.jpg",
      "name": "fachada.jpg",
      "mimeType": "image/jpeg"
    }
  ]
}
```

**Resposta 200:**
Retorna a mensagem gerada e um array `proposedActions` contendo as propostas detectadas pela IA.
```json
{
  "message": {
    "id": 45,
    "role": "assistant",
    "content": "Identifiquei a solicitação e propus a criação da nota...",
    "attachments": null,
    "name": null,
    "tool_calls": null,
    "tool_call_id": null,
    "created_at": "2026-06-03T15:01:00.000Z"
  },
  "proposedActions": [
    {
      "type": "criar_servico",
      "params": {
        "title": "Ajustar Medidor",
        "description": "Ordem gerada via assistente de IA",
        "address": "Rua das Flores, 123",
        "latitude": -5.1595,
        "longitude": -42.7635,
        "markerCategoryId": 1
      }
    }
  ]
}
```

---

### `POST /admin/service-notes/:groupId/chat/apply`

Aplica as ações propostas pelo assistente de IA de Notas de Serviço que foram aprovadas manualmente pelo gestor.

**Módulo Requerido:** `service_notes`

**Path Params:**
* `groupId` (number): ID do grupo de serviços ativo.

**Body (JSON):**
* `proposedActions` (array, obrigatório): Lista de objetos de ação estruturados conforme retornado pela IA.

**Resposta 200:**
```json
{
  "success": true,
  "results": [
    {
      "type": "criar_servico",
      "result": {
        "success": true,
        "service": {
          "id": 345,
          "group_id": 2,
          "title": "Ajustar Medidor",
          "status": "PENDENTE",
          "created_at": "2026-06-03T15:02:00.000Z"
        }
      }
    }
  ]
}
```

---

### `DELETE /admin/service-notes/:groupId/chat`

Limpa o histórico de conversas do assistente administrativo de Notas de Serviço para o grupo especificado.

**Módulo Requerido:** `service_notes`

**Path Params:**
* `groupId` (number): ID do grupo de serviços ativo.

**Resposta 200:**
```json
{
  "success": true
}
```

---

### `GET /admin/messages/notifications/:agentId`

Consulta histórico de notificações de um agente específico com filtros.

**Módulo requerido:** JWT Admin (Bearer)

**Path Params:** `agentId` — matrícula do agente

**Query Params:**

| Parâmetro | Tipo | Default | Descrição |
|-----------|------|---------|-----------|
| `page` | number | 1 | Página |
| `limit` | number | 30 | Itens por página (máx 100) |
| `search` | string | — | Busca em título, body e sender (ILIKE) |
| `from` | string (ISO date) | — | Data inicial |
| `to` | string (ISO date) | — | Data final |

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
      "read": true,
      "read_at": "2026-05-29T15:00:00.000Z",
      "metadata": null,
      "created_at": "2026-05-29T14:30:00.000Z"
    }
  ],
  "total": 45,
  "page": 1,
  "pages": 2
}
```

---

### `GET /admin/service-notes/nearest-agents`

Retorna agentes com heartbeat mais próximos de um ponto central (centroide de notas selecionadas).

**Módulo Requerido:** `service_notes`

**Query Params:**
| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|--------|-----------|
| `lat` | number | **obrigatório** | Latitude do centroide |
| `lng` | number | **obrigatório** | Longitude do centroide |
| `limit` | number | 10 | Máximo de agentes a retornar |
| `radiusKm` | number | 10 | Raio de busca em quilômetros |

**Resposta 200:**
```json
[
  {
    "agent_id": "T60702",
    "nome": "João da Silva",
    "estado": "pi",
    "last_heartbeat_at": "2026-06-10T15:00:00.000Z",
    "latitude": -5.089,
    "longitude": -42.801,
    "distance": 2.345
  }
]
```

---

## 18. Módulo de Badges (Emblemas)

Gerencia o catálogo global de insígnias visuais da plataforma.

**Prefixo:** `/admin/badge/*`

**Autenticação:** JWT Admin (Bearer)

---

### `GET /admin/badge`

Lista todas as badges cadastradas no sistema.

**Módulo Requerido:** `badges`

**Resposta 200:** Array de badges.

---

### `GET /admin/badge/:id`

Retorna detalhes de uma badge específica.

**Módulo Requerido:** `badges`

**Resposta 200:** Objeto da badge.

**Resposta 404:** `{ "error": "Badge não encontrado" }`

---

### `POST /admin/badge`

Cria uma nova badge.

**Módulo Requerido:** `create_badge`

**Body (JSON):**
```json
{
  "title": "Super Agente",
  "description": "Leitura de mais de 500 rotas sem erros",
  "image_url": "https://api.izi.tec.br/files/assets/emblema_super.png"
}
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `title` | string | **sim** | Título da badge |
| `description` | string | não | Descrição |
| `image_url` | string | não | URL da imagem |

**Resposta 201:** Objeto da badge criada.

---

### `PUT /admin/badge/:id`

Atualiza parcialmente uma badge.

**Módulo Requerido:** `update_badge`

**Body (JSON):** Campos parciais (mesmos do POST).

**Resposta 200:** Objeto da badge atualizada.

**Resposta 404:** `{ "error": "Badge não encontrado" }`

---

### `DELETE /admin/badge/:id`

Remove uma badge permanentemente.

**Módulo Requerido:** `delete_badge`

**Resposta 200:** `{ "success": true, "deleted": { ... } }`

---

## 19. Badges de Usuário (User Badges)

Gerencia a associação de emblemas a perfis de agentes de campo.

**Prefixo:** `/admin/user-badges/*`

**Autenticação:** JWT Admin (Bearer)

---

### `GET /admin/user-badges/:id`

Consulta as badges associadas a um agente.

**Módulo Requerido:** `badges`

**Path Params:** `id` — matrícula do agente

**Query Params:**
| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `state` | string | Estado do agente (`pi` ou `ma`) |

**Resposta 200:**
```json
{
  "id": "T60702",
  "nome": "João Silva",
  "badges": [1, 3, 5]
}
```

**Resposta 404:** `{ "error": "Usuário não encontrado no sistema de campo" }`

---

### `POST /admin/user-badges/:id/add`

Atribui manualmente uma badge ao perfil do agente.

**Módulo Requerido:** `update_user`

**Body (JSON):**
```json
{
  "badgeId": 5
}
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `badgeId` | number | **sim** | ID da badge a atribuir |

**Resposta 200:** `{ "success": true, "badges": [1, 3, 5] }`

---

### `POST /admin/user-badges/:id/remove`

Revoga manualmente uma badge do perfil do agente.

**Módulo Requerido:** `update_user`

**Body (JSON):**
```json
{
  "badgeId": 5
}
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `badgeId` | number | **sim** | ID da badge a remover |

**Resposta 200:** `{ "success": true, "badges": [1, 3] }`

---

## 20. Módulo CenEduc (Admin)

CRUD de cards da plataforma de aprendizado CenEduc.

**Prefixo:** `/admin/ceneduc/*`

**Autenticação:** JWT Admin (Bearer)

---

### `GET /admin/ceneduc`

Lista todos os cards CenEduc cadastrados.

**Módulo Requerido:** `ceneduc`

**Query Params:**
| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `state` | string | Filtrar por estado (`pi` ou `ma`) |

**Resposta 200:** Array de cards.

---

### `GET /admin/ceneduc/:id`

Retorna detalhes de um card específico.

**Módulo Requerido:** `ceneduc`

**Resposta 200:** Objeto do card.

**Resposta 404:** `{ "error": "Card não encontrado" }`

---

### `POST /admin/ceneduc`

Cria um novo card CenEduc.

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

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `card_type` | string | **sim** | `cover` ou `train_item` |
| `section` | string | não | `slider` ou `banner` (só para train_item) |
| `group_title` | string | não | Obrigatório para train_item |
| `state` | string | não | `pi`, `ma` ou null (ambos) |
| `sort_order` | number | não | Ordem de exibição |
| `badge_id` | number | não | ID da badge concedida ao completar |
| `data` | object | **sim** | Conteúdo do card (título, imagem, link, resource_type, resource_id) |

**Resposta 201:** Objeto do card criado.

---

### `PUT /admin/ceneduc/:id`

Atualiza parcialmente um card CenEduc.

**Módulo Requerido:** `update_ceneduc`

**Body (JSON):** Campos parciais (mesmos do POST + `active` boolean).

**Resposta 200:** Objeto do card atualizado.

**Resposta 404:** `{ "error": "Card não encontrado" }`

---

### `DELETE /admin/ceneduc/:id`

Remove um card CenEduc.

**Módulo Requerido:** `delete_ceneduc`

**Resposta 200:** `{ "success": true, "deleted": { ... } }`

---

## 21. Módulo de Configurações (Etapas e Feriados)

Gerencia as etapas de leitura e feriados por estado (PI/MA).

**Prefixo:** `/admin/config/*`

**Autenticação:** JWT Admin (Bearer) + módulo `configs`

---

### `GET /admin/config/etapas`

Lista todas as etapas de leitura de um estado.

**Módulo Requerido:** `configs`

**Query Params:**
| Parâmetro | Tipo | Default | Descrição |
|-----------|------|---------|-----------|
| `state` | string | `pi` | Estado (`pi` ou `ma`) |

**Resposta 200:**
```json
[
  { "etapa": "1", "data": "05/05/2026" },
  { "etapa": "2", "data": "12/05/2026" }
]
```

---

### `PUT /admin/config/etapas`

Atualiza a data de uma etapa específica.

**Módulo Requerido:** `configs`

**Query Params:**
| Parâmetro | Tipo | Default | Descrição |
|-----------|------|---------|-----------|
| `state` | string | `pi` | Estado (`pi` ou `ma`) |

**Body (JSON):**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `etapa` | string | **sim** | Identificador da etapa |
| `data` | string | **sim** | Nova data no formato `DD/MM/YYYY` |

**Resposta 200:**
```json
{ "success": true, "updated": { "etapa": "1", "data": "05/05/2026" } }
```

**Resposta 404:** `{ "error": "Etapa não encontrada no banco desse estado." }`

---

### `GET /admin/config/feriados`

Lista todos os feriados de um estado.

**Módulo Requerido:** `configs`

**Query Params:**
| Parâmetro | Tipo | Default | Descrição |
|-----------|------|---------|-----------|
| `state` | string | `pi` | Estado (`pi` ou `ma`) |

**Resposta 200:**
```json
[
  { "id": 1, "date": "03/04/2026" },
  { "id": 2, "date": "21/04/2026" }
]
```

---

### `POST /admin/config/feriados`

Adiciona um novo feriado.

**Módulo Requerido:** `configs`

**Query Params:**
| Parâmetro | Tipo | Default | Descrição |
|-----------|------|---------|-----------|
| `state` | string | `pi` | Estado (`pi` ou `ma`) |

**Body (JSON):**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `date` | string | **sim** | Data no formato `DD/MM/YYYY` |
| `description` | string | não | Descrição do feriado |

**Resposta 201:** Objeto do feriado criado.

---

### `DELETE /admin/config/feriados/:id`

Remove um feriado.

**Módulo Requerido:** `configs`

**Query Params:**
| Parâmetro | Tipo | Default | Descrição |
|-----------|------|---------|-----------|
| `state` | string | `pi` | Estado (`pi` ou `ma`) |

**Path Params:** `id` — ID numérico do feriado

**Resposta 200:** `{ "success": true, "message": "Feriado excluído com sucesso." }`

**Resposta 404:** `{ "error": "Feriado não encontrado ou já excluído." }`

---

## 22. Relatórios de Segurança (Security Reports)

Gerencia relatórios de incidentes de segurança reportados pelos agentes de campo.

**Prefixo:** `/admin/security_reports/*`

**Autenticação:** JWT Admin (Bearer)

---

### `GET /admin/security_reports`

Lista relatórios de segurança dos últimos 3 meses, com paginação e filtros.

**Módulo Requerido:** `security_reports`

**Query Params:**
| Parâmetro | Tipo | Default | Descrição |
|-----------|------|---------|-----------|
| `page` | number | 1 | Número da página |
| `limit` | number | 9999 | Itens por página |
| `estado` | string | — | Filtrar por estado (`pi` ou `ma`) |
| `search` | string | — | Busca em autor, motivo e observação (ILIKE) |

**Resposta 200:**
```json
{
  "data": [
    {
      "id": 1,
      "autor": "T60702",
      "motivo": "Queda de poste",
      "observacao": "Poste na Rua A",
      "latitude": -5.089,
      "longitude": -42.801,
      "estado": "pi",
      "created_at": "2026-05-01T10:00:00.000Z",
      "nome": "João Silva",
      "matricula": "T60702"
    }
  ],
  "total": 10,
  "page": 1,
  "limit": 9999,
  "totalPages": 1
}
```

---

### `POST /admin/security_reports`

Cria um novo relatório de segurança (admin).

**Módulo Requerido:** `create_security_report`

**Body (JSON):**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `autor` | string | **sim** | Matrícula do agente |
| `motivo` | string | **sim** | Motivo do relatório |
| `observacao` | string | não | Observação adicional |
| `latitude` | number | não | Latitude do incidente |
| `longitude` | number | não | Longitude do incidente |
| `estado` | string | não | Estado (`pi` ou `ma`, default: estado do admin) |

**Resposta 201:** Objeto do relatório criado.

---

### `DELETE /admin/security_reports/:id`

Remove um relatório de segurança.

**Módulo Requerido:** `delete_security_report`

**Path Params:** `id` — ID numérico do relatório

**Resposta 200:** `{ "success": true, "deleted": { ... } }`

**Resposta 403:** `{ "error": "Você não tem permissão para deletar relatórios deste estado" }`

**Resposta 404:** `{ "error": "Relatório não encontrado" }`

---

### `GET /admin/security_reports/dashboard`

Retorna estatísticas do dashboard de segurança.

**Módulo Requerido:** `security_reports`

**Query Params:**
| Parâmetro | Tipo | Default | Descrição |
|-----------|------|---------|-----------|
| `estado` | string | — | Filtrar por estado (`pi` ou `ma`) |

**Resposta 200:**
```json
{
  "total": 100,
  "resolvidos": 45,
  "pendentes": 55,
  "taxaResolucao": 45,
  "porTipo": [
    { "motivo": "Queda de poste", "count": 30 }
  ],
  "porAgente": [
    { "autor": "T60702", "count": 15 }
  ],
  "tendenciaMensal": [
    { "mes": "2026-04-01T00:00:00.000Z", "total": 20 }
  ]
}
```

---

### `POST /admin/security_reports/:id/resolver`

Marca um relatório como resolvido com descrição da solução e evidências.

**Módulo Requerido:** `resolve_security_report`

**Path Params:** `id` — ID numérico do relatório

**Body (JSON):**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `descricao_solucao` | string | **sim** | Descrição detalhada de como foi solucionado |
| `evidencias` | array | **sim** | Lista de evidências (mínimo 1) |
| `evidencias[].nome_arquivo` | string | **sim** | Nome do arquivo |
| `evidencias[].tipo` | string | **sim** | Tipo (`imagem` ou `documento`) |
| `evidencias[].caminho` | string | **sim** | URL pública do arquivo (via `/admin/upload`) |

**Resposta 200:**
```json
{
  "success": true,
  "report": { "id": 1, "resolvido": true, "resolvido_por": "42", "resolvido_por_nome": "João Admin", "resolvido_em": "2026-06-11T...", "descricao_solucao": "..." },
  "evidencias": [{ "id": 1, "report_id": 1, "nome_arquivo": "foto.jpg", "tipo": "imagem", "caminho": "..." }]
}
```

> **Nota:** Evidências são obrigatórias exceto quando `motivo = "Sem Risco"`.

---

### `POST /admin/security_reports/:id/reabrir`

Reabre um relatório previamente resolvido, limpando os campos de solução.

**Módulo Requerido:** `resolve_security_report`

**Path Params:** `id` — ID numérico do relatório

**Resposta 200:** `{ "success": true, "report": { ... } }`

---

### `GET /admin/security_reports/:id/evidencias`

Lista as evidências de um relatório.

**Módulo Requerido:** `security_reports`

**Path Params:** `id` — ID numérico do relatório

**Resposta 200:** Array de evidências.

---

### `POST /admin/security_reports/:id/evidencias`

Adiciona uma evidência a um relatório existente.

**Módulo Requerido:** `resolve_security_report`

**Path Params:** `id` — ID numérico do relatório

**Body (JSON):**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `nome_arquivo` | string | **sim** | Nome do arquivo |
| `tipo` | string | **sim** | Tipo (`imagem` ou `documento`) |
| `caminho` | string | **sim** | URL pública do arquivo |

**Resposta 201:** Objeto da evidência criada.

---

## 23. Tokens de API (Admin)

Gerencia tokens de API para integração com sistemas externos. Os tokens são armazenados com hash SHA-256 e podem ser revogados individualmente.

**Módulo Requerido:** `admin`

### `GET /admin/api-tokens`

Lista todos os tokens cadastrados (sem o token completo).

**Resposta 200:**
```json
{
  "data": [
    {
      "id": 1,
      "token_identifier": "abc123...",
      "label": "Integração Sistema X",
      "created_by": "1",
      "created_by_name": "Admin",
      "created_at": "2025-01-01T00:00:00.000Z",
      "expires_at": null,
      "revoked_at": null,
      "revoked_by": null,
      "last_used_at": null,
      "last_used_ip": null
    }
  ]
}
```

### `POST /admin/api-tokens`

Cria um novo token de API. O token completo é retornado **apenas nesta resposta**.

**Body:**
| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `label` | string | **sim** | Nome descritivo do token |
| `expiresAt` | string | não | Data de expiração ISO (ex: `2026-12-31T23:59:00.000Z`) |

**Resposta 201:**
```json
{
  "id": 1,
  "token_identifier": "abc123...",
  "label": "Integração Sistema X",
  "created_by": "1",
  "created_by_name": "Admin",
  "created_at": "2025-01-01T00:00:00.000Z",
  "expires_at": null,
  "revoked_at": null,
  "last_used_at": null,
  "raw_token": "cenos_..."
}
```

### `POST /admin/api-tokens/:id/revoke`

Revoga um token ativo. O token não poderá mais ser usado para autenticação.

**Path Params:** `id` — ID numérico do token

**Resposta 200:** Objeto do token com `revoked_at` preenchido.

### `POST /admin/api-tokens/:id/unrevoke`

Reativa um token revogado.

**Path Params:** `id` — ID numérico do token

**Resposta 200:** Objeto do token com `revoked_at` como `null`.

### `DELETE /admin/api-tokens/:id`

Exclui permanentemente um token. Esta ação é irreversível.

**Path Params:** `id` — ID numérico do token

**Resposta 200:** `{ "success": true }`

### `GET /admin/api-tokens/:id/usage`

Retorna os logs de uso de um token específico (paginação).

**Path Params:** `id` — ID numérico do token

**Query Params:**
| Campo | Tipo | Padrão | Descrição |
|---|---|---|---|
| `page` | number | 1 | Página atual |
| `limit` | number | 50 | Itens por página (max 100) |

**Resposta 200:**
```json
{
  "data": [
    {
      "id": 1,
      "endpoint": "/public/notify",
      "method": "POST",
      "ip": "192.168.1.1",
      "user_agent": "axios/1.7.0",
      "accessed_at": "2025-01-01T00:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 50,
  "totalPages": 1
}
```