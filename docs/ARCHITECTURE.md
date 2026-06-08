# Arquitetura Geral da API

Este documento apresenta a estrutura de diretórios do projeto, pools de conexão a bancos de dados PostgreSQL e utilização do cache Redis.

---

## 1. Estrutura de Diretórios e Componentes

A API é estruturada de forma modular, separando rotas públicas, do técnico de campo (agente) e do painel administrativo:

```
src/
├── index.js                            # Entry point — inicia o servidor HTTP
├── app.js                              # Express app — middlewares globais e montagem de routers
├── db.js                               # Pools de conexão PostgreSQL (pi, ma, localizacoes_pi, cenos)
├── redis.js                            # Cliente Redis (logs e rate limit)
├── socket.js                           # Socket.io (chat em tempo real, notificações)
├── db/
│   ├── migrations/                     # Migrações SQL versionadas
│   │   ├── 001_base_tables.sql
│   │   ├── 002_chat_tables.sql
│   │   ├── 003_service_notes.sql
│   │   ├── 004_tracking.sql
│   │   ├── 005_forms_training.sql
│   │   ├── 006_indexes.sql
│   │   ├── 007_types.sql
│   │   ├── 008_foreign_keys.sql
│   │   ├── 009_telegram_tokens.sql
│   │   └── run.js
│   └── schemas/                        # Schemas de criação de tabelas
│       ├── appPins.js
│       ├── badges.js
│       ├── branches.js
│       ├── ceneduc.js
│       ├── chat.js
│       ├── dailyReport.js
│       ├── fcmTokens.js
│       ├── forms.js
│       ├── index.js
│       ├── inventory.js
│       ├── justify.js
│       ├── login.js
│       ├── messageTemplates.js
│       ├── notifications.js
│       ├── permissions.js
│       ├── security.js
│       ├── sentMessages.js
│       ├── serviceNotes.js
│       ├── tracking.js
│       ├── training.js
│       └── users.js
├── routes/                             # 35 arquivos de rotas Express
│   ├── public.js                       # Rotas públicas (/public/*)
│   ├── publicNotify.js                 # Notificação pública (/public/notify)
│   ├── telegramWebhook.js              # Webhook Telegram (/public/telegram-webhook)
│   ├── consultas.js                    # Consultas gerais (/api/*, token simples)
│   ├── logs.js                         # Logs de auditoria (/api/logs/*)
│   ├── agentDefaultAuth.js             # Rotas agente sem Telegram auth (/api/*)
│   ├── agente.js                       # Rotas do app do agente (/agent/*, Telegram auth)
│   ├── agentServiceNotes.js            # Notas de serviço do agente (/agent/service-notes/*)
│   ├── adminModules.js                 # Dashboard, search_in, justify, CRUDs (/admin/*)
│   ├── adminUsers.js                   # CRUD de usuários admin (/admin/user/*)
│   ├── adminBranches.js                # CRUD de filiais (/admin/branch/*)
│   ├── adminPermissions.js             # CRUD de permissões (/admin/permission/*)
│   ├── adminSecurityReports.js         # Relatórios de segurança (/admin/security_reports/*)
│   ├── adminMessageTemplates.js        # Modelos de mensagem (/admin/message_templates/*)
│   ├── adminBadges.js                  # CRUD de badges (/admin/badge/*)
│   ├── adminUserBadges.js              # Badges por usuário (/admin/user-badges/*)
│   ├── adminCeneduc.js                 # CRUD de cards CenEduc (/admin/ceneduc/*)
│   ├── adminConfig.js                  # Config (etapas/feriados) (/admin/config/*)
│   ├── adminAppPins.js                 # PINs para login app nativo (/admin/agent/*)
│   ├── adminTracking.js                # Monitoramento GPS (/admin/tracking/*)
│   ├── adminServiceNotes.js            # Service notes admin (/admin/service-notes/*)
│   ├── serviceNotesChat.js             # Chat IA service notes (/admin/service-notes/:id/chat)
│   ├── adminNotifications.js           # Notificações push (/admin/notifications/*)
│   ├── adminMessages.js                # Mensagens multicanal (/admin/messages/*)
│   ├── adminChat.js                    # Chat administrativo (/admin/chat/*)
│   ├── chat.js                         # Chat do agente (/api/chat/*)
│   ├── trainingProjects.js             # Treinamentos interativos (/admin/training/*)
│   ├── trainingChat.js                 # Chat IA treinamentos (/admin/training/:id/chat)
│   ├── forms.js                        # Formulários dinâmicos (/admin/forms/*)
│   ├── formChat.js                     # Chat IA formulários (/admin/forms/:id/chat)
│   ├── revalidate.js                   # Revalidação de auditorias (/admin/revalidate/*)
│   ├── appUpdate.js                    # Auto-update Android (/api/app/update/*)
│   ├── upload.js                       # Upload de arquivos MinIO/S3 (/*)
│   ├── docsViewer.js                   # Visualizador de documentação (/docsmd, /raw-md/*)
│   └── webhooks.js                     # Webhooks diversos (não montado ativamente)
├── middlewares/                        # Middlewares de autenticação e validação
│   ├── auth.js                         # Autenticação geral
│   ├── jwtAuth.js                      # JWT admin
│   ├── telegramAuth.js                 # Telegram TMA
│   ├── permissions.js                  # Guardas de módulo
│   ├── logMiddleware.js                # Log de requisições
│   └── validate.js                     # Validação de schemas
├── llm/                                # Módulo LLM (Modular)
│   ├── index.js                        # Factory de providers (OpenAI / Gemini)
│   ├── providers/
│   │   ├── gemini.js                   # Provider Gemini
│   │   └── openai.js                   # Provider OpenAI
│   └── prompts/
│       ├── formBuilder.js              # Prompt para construção de formulários
│       └── serviceNotes.js             # Prompt para assistente service notes
├── functions/                          # Lógicas de negócio e queries
│   ├── postgresFunctions.js            # Queries SQL consolidadas (legado)
│   ├── generateDashboard.js            # Montagem do layout SDUI do dashboard
│   ├── generateCustomLinks.js          # Links customizados por permissão
│   ├── badges.js                       # Lógica de badges
│   ├── firebase.js                     # Firebase Admin (FCM push)
│   ├── minio.js                        # Cliente wrapper MinIO/S3
│   ├── modules.js                      # Definição de módulos do sistema
│   ├── middlewares.js                  # Helpers de middleware
│   ├── requestsFunctions.js            # Funções auxiliares de request
│   └── database/                       # Queries especializadas por módulo (31 arquivos)
│       ├── admin.js, agentes.js, adminSecurityReports.js
│       ├── appPins.js, badges.js, branches.js
│       ├── c12.js, ceneduc.js, chat.js, cnl.js, cnlSemReceita.js
│       ├── commom.js, configs.js, fcmTokens.js
│       ├── formChat.js, forms.js, getLeiturasGeral.js
│       ├── messageTemplates.js, notifications.js
│       ├── pendencias.js, perdas.js, permissions.js, pontualidade.js
│       ├── revalidate.js, serviceNotes.js, serviceNotesChat.js
│       ├── status.js, tracking.js, trainingChat.js
│       ├── trainingProjects.js, users.js
└── utils/
    └── dates.js                        # Helpers utilitários de formatação de datas
```

---

## 2. Conectores a Bancos de Dados (PostgreSQL)

O arquivo `db.js` exporta múltiplos pools de conexão com bancos PostgreSQL locais e remotos para abranger as bases transacionais de cada filial geográfica e logs locais:

* **`poolCenos`**: Conexão principal onde residem tabelas corporativas, logins, cadastros de colaboradores, justificativas de vistorias, segurança, gamificação, formulários dinâmicos e monitoramento de GPS.
* **`poolPi`** / **`poolMa`**: Conectam-se às bases de dados legadas de leitura e ordens de serviços de campo dos estados do Piauí e Maranhão, respectivamente.
* **`poolLocPi`**: Utilizado para consultas geográficas específicas de instalações e rotas do Piauí.

---

## 3. Logs de Transação e Rate Limit (Redis)

O arquivo `redis.js` inicia uma instância cliente do Redis. O Redis é utilizado principalmente para:
1. **Auditoria de Logs:** Armazenamento chave-valor de logs de execução e transação do sistema para rápida extração em tela administrativa (/api/logs/data).
2. **Rate Limit:** Controle de requisições por IP de endpoints sensíveis (ex: rotas públicas) para mitigar ataques de negação de serviço e força bruta.

---

## 4. Arquitetura de Comunicação em Tempo Real (Socket.io)

Para suportar a comunicação multimídia síncrona e notificações instantâneas do suporte, o sistema implementa uma camada híbrida REST + WebSockets (através do Socket.io).

### 4.1. Handshake e Segurança
As conexões do Socket.io passam por um middleware de autenticação obrigatório no handshake:
1. **Administradores:** Autenticam-se fornecendo um token JWT tradicional. O socket é mapeado no barramento sob a regra `admin`.
2. **Agentes de Campo (PWA):** Autenticam-se fornecendo a hash de validação do Telegram (`X-Telegram-Init-Data` em query param). O socket é mapeado sob a regra `agent`.
3. **Mapeamento Ativo:** As instâncias de sockets são organizadas em tempo real em um dicionário em memória (`activeConnections`), indexado pelo `userId` de modo a viabilizar o roteamento direto de mensagens e o motor de notificações.

### 4.2. Fluxo e Roteamento de Salas
* **Isolamento Geográfico e de Segurança:** Cada agente de campo opera em sua respectiva sala unificada (`room_${roomId}`). O agente de campo não possui acesso a salas de terceiros.
* **Administradores:** Podem entrar (`join`) em qualquer sala de suporte técnico sob demanda e são notificados instantaneamente de novas salas ou mensagens pendentes em qualquer estado de jurisdição.
* **Eventos de Status (Presença, Digitação, Gravação):**
  - `typing_status`: Notifica à outra ponta que o usuário está digitando texto.
  - `recording_status`: Sinaliza em tempo real se o atendente ou o agente está gravando um áudio pelo microfone.
  - `online_status`: Broadcasting do estado de presença para sinalização visual na lista de contatos.

### 4.3. Imutabilidade e Auditoria Plena
Em respeito à integridade operacional do suporte e auditoria em campo, o banco de dados PostgreSQL (`chat_messages` e `chat_rooms`) atua sob o princípio do **Append-Only**. 
* Não existem queries de `UPDATE` ou `DELETE` para mensagens.
* Uma vez persistidas na tabela corporativa, as mensagens multimídia são vitalícias. O frontend não expõe opções de remoção ou retratação de envio, garantindo a rastreabilidade plena do atendimento de suporte comercial.
* Badges de mensagens pendentes são computadas dinamicamente e zeradas sincronamente sob o endpoint de leitura (`POST /read`).

### 4.4. Push FCM para Mensagens de Chat (Fallback Offline)
Quando o admin envia uma mensagem no chat e o agente **não está com o app aberto**, o sistema envia uma notificação push via FCM como fallback:

1. **`send_message` no Socket.io** (`socket.js`): Após persistir a mensagem e notificar via WebSocket, chama `sendChatPushNotification()`.
2. **`sendChatPushNotification()`**: Busca os FCM tokens do agente em `fcm_tokens` e envia um push **data-only** (com `critical: 'true'` para garantir que `onMessageReceived` dispare mesmo em background).
3. **Android `FcmRestartReceiver`**: Recebe o push e decide:
   - **App aberto** → injeta JavaScript no WebView disparando evento `chatMessage` para notificação in-app.
   - **App fechado/background** → exibe notificação do sistema com `IMPORTANCE_HIGH` (heads-up se tela ligada, drawer se desligada).

O body da notificação varia conforme o tipo da mensagem: texto, imagem, vídeo, áudio, documento ou localização.

