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
├── routes/
│   ├── public.js                       # Rotas públicas (/public/*)
│   ├── consultas.js                    # Consultas gerais (/api/*, token simples)
│   ├── agentDefaultAuth.js             # Rotas agente sem Telegram auth (/api/*)
│   ├── agente.js                       # Rotas do app do agente (/agent/*, Telegram auth)
│   ├── adminModules.js                 # Admin dashboard, search_in, justify, etc. (/admin/*)
│   ├── adminUsers.js                   # CRUD de usuários (/admin/user/*)
│   ├── adminBranches.js                # CRUD de filiais (/admin/branch/*)
│   ├── adminPermissions.js             # CRUD de permissões (/admin/permission/*)
│   ├── adminSecurityReports.js         # Relatórios de segurança (/admin/security_reports/*)
│   ├── adminMessageTemplates.js        # Modelos de mensagem (/admin/message_templates/*)
│   ├── adminBadges.js                  # CRUD de badges (/admin/badge/*)
│   ├── adminCeneduc.js                 # CRUD de cards CenEduc (/admin/ceneduc/*)
│   ├── trainingProjects.js             # Interativos (/admin/training/*)
│   ├── forms.js                        # Formulários dinâmicos (/admin/forms/*)
│   ├── formChat.js                     # Chat IA para formulários (/admin/forms/:id/chat)
│   ├── adminAppPins.js                 # PINs para login app nativo/web (/admin/agent/*)
│   ├── adminTracking.js                # Monitoramento: GPS, velocidade, quedas (/admin/tracking/*)
│   └── upload.js                       # Upload de arquivos MinIO/S3 (/*)
├── llm/                                # Módulo LLM (Modular)
│   ├── index.js                        # Factory de providers (OpenAI / Gemini)
│   ├── providers/                      # Classes específicas do OpenAI, Gemini, etc.
│   └── prompts/                        # Prompts estruturados do sistema (ex: formBuilder)
├── functions/
│   ├── postgresFunctions.js            # Todas as queries SQL consolidadas
│   ├── database/                       # Scripts de criação de tabelas e DDL do banco
│   │   ├── formChat.js                 # Lógica e persistência de chats com IA
│   │   ├── appPins.js                  # PINs para login app nativo
│   │   └── tracking.js                 # Estrutura de tabelas e queries de geolocalização
│   ├── generateDashboard.js            # Lógica dinâmica para montagem do layout SDUI
│   ├── generateCustomLinks.js          # Links customizados baseados nas restrições de grupos
│   ├── middlewares.js                  # Middlewares comuns (auth, guards, rate limits)
│   ├── minio.js                        # Cliente wrapper MinIO/S3
│   └── modules.js                      # Definição e enumeração de módulos do sistema
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

