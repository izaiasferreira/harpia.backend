# Tracking & Monitoramento — Backend

## Visão Geral

Sistema de rastreamento GPS em tempo real dos agentes de campo, com detecção de velocidade excedida (>50 km/h), incidentes de queda, e alertas de proximidade. Dados sincronizados offline-first via batch sync.

---

## Dados do Dispositivo (Bateria, Rede, Modelo)

Cada ponto de rastreamento agora inclui informações do dispositivo do agente. A coleta é feita no frontend (`trackingService.ts`) e enviada via `POST /agent/tracking/sync-v2`.

### Coleta por plataforma

| Dado | Mobile (nativo) | Web (fallback) |
|------|----------------|----------------|
| Nível da bateria | `Device.getBatteryInfo()` (Capacitor) | `navigator.getBattery()` (Web Battery API) |
| Tipo de rede | `Network.getStatus()` (Capacitor) | `navigator.connection.effectiveType` (Network Information API) |
| Modelo do dispositivo | `Device.getInfo().model` | `navigator.userAgent` |
| Plataforma | `Device.getInfo().platform` | `'web'` |
| Versão do SO | `Device.getInfo().osVersion` | `''` |

### Comportamento

- Bateria e rede são atualizadas a cada **5 minutos** em background
- Também são atualizadas **antes de cada sync**
- Cada ponto salvo offline já contém os dados do dispositivo no momento da coleta
- Dispositivo e plataforma/OS são estáticos (coletados uma vez na inicialização)

### Sync em tempo real

Para garantir que o admin veja a posição do agente o mais rápido possível:

- **JS (WebView vivo)**: Sync imediato a cada novo ponto GPS (throttle 10s) + timer periódico a cada **30s** para dar flush em pontos pendentes
- **Nativo Android (WebView morto)**: `TrackingForegroundService` coleta GPS via `LocationManager` + SQLite local + POST HTTP direto a cada **30s** (independente do WebView)
- **Web (desktop/dev)**: WatchLocation contínuo mesmo com aba oculta (não para mais no `visibilitychange`)
- **Retry automático**: A cada 30s, dados pendentes são reenviados

### Admin

O painel `/control/tracking` exibe os campos `battery_level`, `network_type`, `device_model` no card do agente e no popup do mapa. Quando o dado não está disponível, exibe `--`.

---

## Tabelas

| Tabela | Descrição |
|--------|-----------|
| `tracking_points` | Coordenadas GPS coletadas (agent_id, lat, lng, speed, accuracy, battery_level, network_type, device_model, device_platform, os_version, recorded_at) |
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

#### `POST /agent/tracking/sync-v2`
Batch sync com suporte a deviceInfo (bateria, rede, modelo do dispositivo). Os campos de device info podem ser enviados no `deviceInfo` do body ou diretamente em cada `point` (prioridade do ponto).

**Body:**
```json
{
  "points": [{ "lat": -5.089, "lng": -42.801, "speed": 12.5, "accuracy": 8, "batteryLevel": 0.85, "networkType": "wifi", "deviceModel": "SM-S908B", "devicePlatform": "android", "osVersion": "14", "timestamp": 1716000000000 }],
  "violations": [{ "lat": -5.089, "lng": -42.801, "speed": 62.3, "speedLimit": 50, "timestamp": 1716000000000 }],
  "incidents": [{ "lat": -5.089, "lng": -42.801, "timestamp": 1716000000000 }],
  "alerts": [{ "type": "proximity_warning", "lat": -5.089, "lng": -42.801, "timestamp": 1716000000000, "details": {} }],
  "deviceInfo": { "batteryLevel": 0.85, "connectionType": "wifi", "deviceModel": "SM-S908B", "devicePlatform": "android", "osVersion": "14" }
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
Última posição de todos os agentes (modo Live). Retorna também `battery_level`, `network_type`, `device_model`, `device_platform`, `os_version`.

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

O app não pode ser fechado pelo agente. Mecanismos em várias camadas garantem que o rastreamento continue mesmo após o usuário tentar fechar:

| Mecanismo | Arquivo | Função |
|-----------|---------|--------|
| Foreground Service | `TrackingForegroundService.java` | `START_STICKY` com notificação persistente (`setOngoing(true)`). Se morto pelo sistema, Android re-cria automaticamente. `onTaskRemoved` e `onDestroy` relançam a MainActivity. |
| Task Removed Handler | `MainActivity.java` (`onTaskRemoved`) | Quando o usuário remove o app dos recentes, reinicia a Activity e o Foreground Service imediatamente, antes do processo morrer. |
| Boot Receiver | `BootReceiver.java` | Após reboot, inicia Foreground Service + MainActivity automaticamente. |
| WorkManager Watchdog | `TrackingWatchdogWorker.java` | A cada **5 minutos**, verifica se o Foreground Service e a Activity estão vivos e reinicia se necessário. |
| FCM Silent Push | `FcmRestartReceiver.java` | Ao receber push `restart_tracking` do servidor, reinicia Foreground Service + app em background. |
| Chat Message Push | `FcmRestartReceiver.java` | Toda notificação de chat também reabre o app em background. |

### Matriz de Proteção

## Anti-Kill: Proteção 24/7

O Cenos combina múltiplas camadas para manter o rastreamento ativo 24/7, incluindo **sync nativo** que funciona independente do WebView.

| Ação do agente | Proteção implementada | Eficácia |
|---|---|---|
| App minimizado (background) | Foreground Service + `@capacitor-community/background-geolocation` (GPS contínuo) | 100% |
| Tela desligada | GPS via `LocationManager` no `TrackingForegroundService` + `FusedLocationProviderClient` no plugin | 100% |
| App removido dos recentes | `onTaskRemoved` + restart + Foreground Service `START_STICKY` + sync nativo via SQLite | ~99% |
| Processo morto pelo SO (low memory) | `START_STICKY` + heartbeat 30s reabre app + sync nativo via SQLite | ~95% |
| Boot do celular | `BootReceiver` inicia service + app | 100% |
| **Force Stop (Config > Apps)** | Nenhum app comum sobrevive. Solução: **MDM** | **Não protegido** |
| OEM chinesa (Xiaomi, Huawei, Oppo) | `onTaskRemoved` bloqueado pela ROM; sync nativo via SQLite + HTTP direto funciona independente | Parcial |

### Arquitetura de sync em camadas

```
GPS (LocationManager nativo)
  ├── ✅ [Sempre] SQLite nativo (TrackingForegroundService)
  │     └── HTTP POST → /agent/tracking/sync-v2 (a cada 30s, independente do WebView)
  │
  └── ✅ [Quando WebView vivo] Capacitor BackgroundGeolocation plugin
        └── JS callback → IndexedDB → syncQueue → HTTP (imediato + 30s)
```

### Force Stop — única falha real

O **Force Stop** (Configurações > Apps > Cenos > Forçar Parada) é o único meio do agente matar o app definitivamente. O Android sempre permite isso para qualquer app, e não há código que impeça.

### Solução corporativa: MDM (Mobile Device Management)

Para impedir totalmente que o agente pare o rastreamento, é necessário um **MDM** (Mobile Device Management). O Cenos é compatível com qualquer MDM que suporte Android Enterprise. Recomenda-se:

| Recurso MDM | Bloqueia |
|---|---|
| **Kiosk Mode** (single app) | Agente não sai do Cenos |
| **Desativar Force Stop** | Botão de forçar parada some |
| **Bloquear desinstalação** | App não pode ser removido |
| **Política de bateria** | OEMs não matam o app |

**MDMs recomendados (gratuitos + enterprise):**
- **Android Management API** (Google, gratuito) — `managedconfigurations@android.com`
- **Microsoft Intune** (pago, enterprise)
- **VMware Workspace ONE** (pago, enterprise)
- **Miradore** (freemium)

> Nota: Para usar kiosk mode, o Cenos precisa ser configurado como **Device Owner** via NFC ou QR Code na matrícula do dispositivo. O suporte a Device Owner está fora do escopo do app e deve ser configurado pelo MDM.

### Limitações conhecidas (OEMs chinesas)
Em dispositivos Xiaomi, Huawei, Oppo e outros, a agressiva otimização de bateria pode bloquear `onTaskRemoved` + `startActivity`. O app solicita `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` na inicialização, mas o usuário **deve** adicionar manualmente o app à lista de exceções de bateria do sistema.

### Permissões Android necessárias
- `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_LOCATION`
- `ACCESS_BACKGROUND_LOCATION`
- `RECEIVE_BOOT_COMPLETED`
- `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`
- `SYSTEM_ALERT_WINDOW` (overlay crítico)

---

## Configuração

- Limite de velocidade: 50 km/h (constante no frontend + default no banco)
- Sync interval (JS): imediato (throttle 10s) + timer 30s
- Sync interval (nativo): 30s (independente do WebView)
- Batch size: 50 pontos por sync
- Precisão mínima: 30m (readings com accuracy > 30m são ignorados)
- Dados antigos: limpos após 7 dias (synced only)
- Watchdog heartbeat: 30s (reabre app se WebView morto)
