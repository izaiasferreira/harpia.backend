# Documentação da API — Gedai Backend

## Índice Rápido

| Documento | Conteúdo |
|-----------|----------|
| [`ENDPOINTS_ADMIN.md`](./ENDPOINTS_ADMIN.md) | Endpoints administrativos (JWT) — 22 seções |
| [`ENDPOINTS_AGENT.md`](./ENDPOINTS_AGENT.md) | Endpoints do app do agente (Telegram Auth) — 12 seções |
| [`ENDPOINTS_PUBLIC.md`](./ENDPOINTS_PUBLIC.md) | Endpoints públicos + consultas token simples |
| [`GAMIFICATION_TRAINING.md`](./GAMIFICATION_TRAINING.md) | Badges, CenEduc, Treinamentos Interativos |
| [`AUTHENTICATION.md`](./AUTHENTICATION.md) | 5 métodos de autenticação |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Estrutura de diretórios, pools, Redis |
| [`ENVIRONMENT.md`](./ENVIRONMENT.md) | Variáveis de ambiente |
| [`TRACKING.md`](./TRACKING.md) | Tracking GPS, velocidade, quedas |
| [`NOTIFICATIONS.md`](./NOTIFICATIONS.md) | Notificações push, overlay, endpoint unificado |
| [`SERVICE_NOTES.md`](./SERVICE_NOTES.md) | Notas de Serviço (admin + agente + offline) |
| [`APP_UPDATE.md`](./APP_UPDATE.md) | Auto-update Android (APK self-hosted) |

---

## Mapa de Rotas por Prefixo

### `GET /health`
Health check simples (sem prefixo).

---

### `/public/*` — Público (rate limit 60/min)
| Rota | Descrição |
|------|-----------|
| `GET /public/health` | Status do servidor, pools e Redis |
| `GET /public/calendar` | Calendário de eventos |
| `GET /public/feriados` | Feriados por estado |
| `GET /public/metabase_geral` | Redirect para dashboard Metabase |
| `GET /public/generate_token` | Gera token de acesso temporário |
| `POST /public/telegram-webhook` | Webhook inbound Telegram |
| `POST /public/notify` | Notificação pública para agentes |
| `GET /public/training/:id` | Visualização pública de treinamento |
| `GET /public/form/:id` | Estrutura pública de formulário |
| `GET /public/form/:id/check` | Verifica resposta duplicada |
| `POST /public/form/submit/:id` | Submissão de resposta |
| `POST /public/form/upload` | Upload de arquivo para formulário |
| `POST /public/app_login` | Login app nativo (matrícula + PIN) |
| `POST /public/app_refresh_token` | Refresh de token do app nativo |

### `/api/*` — API Token (`?token=cenos_...`)
| Rota | Descrição |
|------|-----------|
| `GET /api/last_update` | Data da última sincronização |
| `GET /api/pendencias` / `..._json` | Pendências consolidadas/JSON |
| `GET /api/pontualidade` / `..._json` | Índices de pontualidade |
| `GET /api/cnl*` | Leituras CNL (3 formatos) |
| `GET /api/c12*` | Metas C12 (3 formatos) |
| `GET /api/licacao_nova_c12_json` | Novas ligações C12 |
| `GET /api/e02_json` | Leituras E02 |
| `GET /api/c16_json` | Leituras C16 |
| `GET /api/perdas` / `..._json` | Perdas e fraudes |
| `GET /api/not_start_services` | Serviços não iniciados |
| `GET /api/completed_services` | Serviços finalizados |
| `GET /api/incompleted_services` | Serviços incompletos |
| `GET /api/agent_telegram_id` | Telegram ID do agente |
| `POST /api/justification_codes` | Códigos de justificativa |
| `POST /api/justify_pending` | Justificativa pendente em lote |
| `GET /api/logs/data` | Logs de auditoria (Redis) |
| `DELETE /api/logs/clear` | Expurgo de logs |

### `/agent/*` — Telegram TMA Auth
| Rota | Descrição |
|------|-----------|
| `GET /agent/agent_data` | Dados da sessão |
| `GET /agent/profile` | Perfil + badges + metas |
| `POST /agent/profile/upload` | Upload foto do perfil |
| `GET /agent/badge` | Atribuir badge |
| `GET /agent/agent_dashboard` | Dashboard SDUI |
| `GET /agent/agent_services` | Serviços do agente |
| `POST /agent/search_in` | Busca instalações |
| `GET /agent/instalation_details` | Detalhes da instalação |
| `GET /agent/predicted` | Leitura previstas |
| `GET /agent/last_update_agent` | Última atualização |
| `GET /agent/custom_links` | Links customizados |
| `GET /agent/get_justify` | Consultar justificativa |
| `POST /agent/create_justify` | Criar justificativa |
| `PUT /agent/update_justify` | Atualizar justificativa |
| `DELETE /agent/delete_justify/:id` | Remover justificativa |
| `GET /agent/justify_pending` | Justificativas pendentes |
| `POST /agent/justify_pending/:id/respond` | Responder pendência |
| `GET /agent/justify_pending/:id` | Pendência por ID |
| `GET /agent/inventory` | Inventário do agente (legado) |
| `POST /agent/inventory` | Criar inventário (legado) |
| `GET /agent/equipment/mine` | Equipamentos do agente |
| `GET /agent/equipment/available` | Equipamentos disponíveis |
| `POST /agent/equipment/:id/request` | Solicitar associação de equipamento |
| `POST /agent/equipment/:id/unassign` | Solicitar devolução de equipamento |
| `POST /agent/daily_report` | Criar daily report |
| `GET /agent/daily_report` | Listar daily reports |
| `GET /agent/daily_report/check_today` | Verificar report de hoje |
| `POST /agent/security_check` | Check-in segurança |
| `GET /agent/security_check` | Listar checks |
| `GET /agent/security_check/check_today` | Verificar check de hoje |
| `POST /agent/security_report` | Relatório de segurança |
| `GET /agent/security_report` | Listar relatórios |
| `GET /agent/predicted` | Leitura previstas |
| `POST /agent/tracking/sync-unified` | Sync de GPS (unificado) |
| `POST /agent/tracking/alerts/sync` | Sync de alert logs |
| `POST /agent/fcm-token` | Registro de token FCM |
| `GET /agent/ceneduc` | CenEduc do agente |
| `POST /agent/ceneduc/complete/:id` | Completar card + badge |
| `GET /agent/ceneduc/check/:id` | Verificar conclusão |
| `POST /agent/training/:id/complete` | Completar treinamento |
| `GET /agent/notifications` | Notificações do agente |
| `POST /agent/notifications/read` | Marcar como lida |
| `POST /agent/upload_agent` | Upload de arquivo |
| `GET /agent/service-notes/*` | Notas de Serviço (grupos + CRUD + concluir + criar) |

### `/admin/*` — JWT Admin
| Seção | Descrição | Módulos |
|-------|-----------|---------|
| `/admin/user/*` | Login, CRUD de usuários | `users` |
| `/admin/users_agents` | CRUD de agentes de campo | `users` |
| `/admin/branch/*` | Filiais/regionais | `branch` |
| `/admin/permission/*` | Perfis de permissão | `permission` |
| `/admin/forms/*` | Formulários dinâmicos | `forms` |
| `/admin/tracking/*` | Monitoramento GPS/quedas | `tracking` |
| `/admin/agent/*` | PINs de acesso | — |
| `/admin/message_templates/*` | Modelos de mensagem | `message_templates` |
| `/admin/services` | Consulta de serviços | `services_consult` |
| `/admin/revalidate/*` | Revalidação de auditoria | — |
| `/admin/service-notes/*` | Notas de Serviço | `service_notes` |
| `/admin/messages/*` | Mensagens multicanal | — |
| `/admin/inventory` | Inventário de equipamentos (legado) | — |
| `/admin/equipment/*` | Equipamentos (PDA/Impressora/Maquineta) com fluxo de aprovação | `equipments`, `approve_equipment_request` |
| `/admin/chat/*` | Chat de suporte | `COMPANY_ADMIN` |
| `/admin/badge/*` | Badges (emblemas) | `badges` |
| `/admin/user-badges/*` | Badges por agente | `badges` |
| `/admin/ceneduc/*` | Cards CenEduc | `ceneduc` |
| `/admin/training/*` | Treinamentos interativos | `trainings` |
| `/admin/config/*` | Etapas e feriados | `configs` |
| `/admin/security_reports/*` | Relatórios de segurança | `security_reports` |
| `/admin/notifications/*` | Notificações push/broadcast | `notifications` |

### Outras Rotas
| Prefixo | Descrição |
|---------|-----------|
| `/files/*` | Arquivos estáticos + MinIO proxy |
| `/api/chat/*` | Upload de arquivos do chat |
| `/admin/chat/*` | Salas de chat |
| `/api/app/update/*` | Auto-update Android |

---

## Grupos de Permissão (ModuleIds)

| ModuleId | Descrição |
|----------|-----------|
| `users` | Usuários e agentes |
| `branch` | Filiais/regionais |
| `permission` | Perfis de acesso |
| `forms`, `create_form`, `update_form`, `delete_form` | Formulários |
| `tracking` | Monitoramento |
| `service_notes`, `create_service_note`, `update_service_note`, `delete_service_note`, `assign_service_notes`, `import_service_notes` | Notas de Serviço |
| `badges`, `create_badge`, `update_badge`, `delete_badge` | Badges |
| `ceneduc`, `create_ceneduc`, `update_ceneduc`, `delete_ceneduc` | CenEduc |
| `trainings`, `create_training`, `update_training`, `delete_training` | Treinamentos |
| `configs` | Configurações |
| `security_reports`, `create_security_report`, `delete_security_report`, `resolve_security_report` | Segurança |
| `services_consult` | Consulta de serviços |
| `message_templates` | Modelos de mensagem |
| `notifications` | Notificações |
| `inventory` | Inventário (legado) |
| `equipments`, `create_equipment`, `update_equipment`, `delete_equipment` | Equipamentos (CRUD) |
| `request_equipment_assignment`, `unassign_equipment` | Solicitações de associação/devolução |
| `approve_equipment_request` | Aprovação de solicitações |
| `view_equipment_history` | Histórico de equipamentos |
| `delete_form_response` | Excluir resposta de formulário |
| `revalidate` | Revalidação de auditoria |

---

## Ver também

- [Arquitetura e diretórios](./ARCHITECTURE.md)
- [Autenticação (5 métodos)](./AUTHENTICATION.md)
- [Variáveis de ambiente](./ENVIRONMENT.md)
