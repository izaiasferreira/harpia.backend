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
