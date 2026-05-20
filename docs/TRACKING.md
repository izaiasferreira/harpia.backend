# Tracking & Monitoramento — Backend

## Visão Geral

Sistema de rastreamento GPS em tempo real dos agentes de campo, com detecção de velocidade excedida (>50 km/h), incidentes de queda, e alertas de proximidade. Dados sincronizados offline-first via batch sync.

---

## Tabelas

| Tabela | Descrição |
|--------|-----------|
| `tracking_points` | Coordenadas GPS coletadas (agent_id, lat, lng, speed, accuracy, recorded_at) |
| `speed_violations` | Infrações de velocidade >50 km/h |
| `fall_incidents` | Incidentes de queda detectados pelo acelerômetro (status: pending/confirmed/false_positive) |
| `agent_alerts_log` | Log de alertas genéricos (proximity_warning, speed_violation, etc.) |
| `fcm_tokens` | Tokens FCM dos dispositivos dos agentes (para push notifications) |

---

## Endpoints

### Agente

#### `POST /agent/tracking/sync`
Batch sync de pontos, violações, incidentes e alertas coletados offline.

**Body:**
```json
{
  "points": [{ "lat": -5.089, "lng": -42.801, "speed": 12.5, "accuracy": 8, "timestamp": 1716000000000 }],
  "violations": [{ "lat": -5.089, "lng": -42.801, "speed": 62.3, "speedLimit": 50, "timestamp": 1716000000000 }],
  "incidents": [{ "lat": -5.089, "lng": -42.801, "timestamp": 1716000000000 }],
  "alerts": [{ "type": "proximity_warning", "lat": -5.089, "lng": -42.801, "timestamp": 1716000000000, "details": {} }]
}
```

#### `POST /agent/fcm-token`
Registra token FCM do dispositivo para receber push notifications.

**Body:**
```json
{ "token": "fcm_token_string", "deviceInfo": "android_..." }
```

---

### Admin

#### `GET /admin/tracking/agents`
Última posição de todos os agentes (modo Live).

#### `GET /admin/tracking/agent/:id/trail?from=&to=`
Trajeto histórico de um agente em período específico.

#### `GET /admin/tracking/speed_violations?agent_id=&from=&to=`
Lista infrações de velocidade (>50 km/h).

#### `GET /admin/tracking/fall_incidents?status=&agent_id=&from=`
Lista incidentes de queda.

#### `PUT /admin/tracking/fall_incidents/:id`
Atualiza status do incidente (confirmed/false_positive).

**Body:**
```json
{ "status": "confirmed", "notes": "Texto livre do gestor" }
```

#### `GET /admin/tracking/alerts?agent_id=&type=&from=&to=`
Log de alertas para auditoria.

---

## Persistência Nativa Android (Anti-Kill)

O app Android possui mecanismos para manter o rastreamento ativo mesmo após o usuário fechar o app:

| Mecanismo | Arquivo | Função |
|-----------|---------|--------|
| Foreground Service | `TrackingForegroundService.java` | Serviço START_STICKY com notificação persistente |
| Boot Receiver | `BootReceiver.java` | Reinicia serviço após reboot do dispositivo |
| WorkManager Watchdog | `TrackingWatchdogWorker.java` | Verifica a cada 15min se serviço está vivo |
| FCM Silent Push | `FcmRestartReceiver.java` | Recebe push silencioso e reinicia serviço |

### Permissões Android necessárias
- `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_LOCATION`
- `ACCESS_BACKGROUND_LOCATION`
- `RECEIVE_BOOT_COMPLETED`
- `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`
- `SYSTEM_ALERT_WINDOW` (overlay crítico)

---

## Configuração

- Limite de velocidade: 50 km/h (constante no frontend + default no banco)
- Sync interval: 5 minutos (quando online)
- Batch size: 50 pontos por sync
- Precisão mínima: 30m (readings com accuracy > 30m são ignorados)
- Dados antigos: limpos após 7 dias (synced only)
