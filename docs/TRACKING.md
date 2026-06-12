# Tracking & Monitoramento

Sistema de rastreamento GPS em tempo real dos agentes de campo. Tolerância zero a falhas — funciona offline-first, em segundo plano, sem nunca trazer o app para primeiro plano.

---

## Arquitetura Geral

### Modelo Unificado (v3 — atual)

A partir desta versão, todos os dados de tracking são unificados. Cada ponto carrega localização **e** status do dispositivo. A validação de velocidade (limite excedido) é feita **no backend** — não mais no cliente.

```
GPS (FusedLocationProviderClient — Google Play Services)
  │
  ├── Filtro de precisão (accuracy > 30m → rejeita)
  ├── Filtro de distância (< 5m do último ponto → ignora)
  │
  └── Salva no SQLite local (synced = 0)
        │
  └── Thread separada a cada 30s:
        ├── Lê batch de 50 pontos com synced = 0
        ├── HTTP POST → /agent/tracking/sync-unified
        │   Payload: { points: [{ lat, lng, speed, accuracy,
        │                   batteryLevel, isCharging, networkType,
        │                   gpsEnabled, deviceModel, osVersion, timestamp }] }
        ├── Backend: valida velocidade contra limite do agente
        │            → insere em tracking_session_points
        │            → marca is_speed_violation = TRUE se speed > limit
        ├── Resposta: { success, synced, violations, speedLimitApplied }
        ├── Se 200 OK → marca synced = 1 + emite trackingSync event (frontend)
        │             + envia heartbeat (POST /agent/tracking/heartbeat)
        └── Se falhar → mantém synced = 0 (retry na próxima)
```

### Camadas de Coleta

| Camada | Coleta | Armazenamento | Sync | Ativo quando |
|--------|--------|---------------|------|--------------|
| **Nativa (Java)** | FusedLocationProviderClient (GPS + rede + Wi-Fi) | SQLite nativo | HTTP direto a cada 30s | **Sempre** (WebView vivo ou morto) |
| **JS (WebView)** | BackgroundGeolocation + Geolocation.watchPosition | IndexedDB | syncQueue via axios | Quando o WebView está vivo |

As duas camadas funcionam em paralelo. O backend deduplica por `point_id` (nativo) ou aceita duplicados removendo `id` no insert (web).

### Heartbeat (presença online)

O serviço nativo envia um heartbeat leve (`POST /agent/tracking/heartbeat`) após cada sync bem-sucedido (a cada 30s), contendo apenas `{ lat, lng }`. O backend atualiza `login.last_heartbeat_at`, `last_heartbeat_lat` e `last_heartbeat_lng`.

| Origem | Online se |
|--------|-----------|
| **Nativo (APK)** | `last_heartbeat_at` < 5 min |
| **Web (PWA)** | Último ponto em `tracking_session_points` < 5 min |

---

## Tabelas do Banco

### tracking_session_points (unificada)

Armazena localização + status do dispositivo de todos os agentes (nativo e web) em uma única tabela.

```sql
CREATE TABLE tracking_session_points (
    id SERIAL PRIMARY KEY,
    agent_id TEXT NOT NULL,
    latitude DECIMAL(9,6) NOT NULL,
    longitude DECIMAL(9,6) NOT NULL,
    speed DECIMAL(7,3),          -- km/h (nativo já envia km/h; web pode enviar m/s → normalizado)
    accuracy DECIMAL(7,2),      -- metros
    battery_level DECIMAL(4,1), -- 0-100 (nativo: 0-100; Capacitor/web: 0-1 → ×100)
    is_charging BOOLEAN DEFAULT FALSE,
    network_type TEXT,
    gps_enabled BOOLEAN DEFAULT TRUE,
    device_model TEXT,
    device_platform TEXT,
    os_version TEXT,
    recorded_at TIMESTAMPTZ NOT NULL,
    speed_limit_applied DECIMAL(5,2), -- limite usado na validação
    is_speed_violation BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_agent FOREIGN KEY (agent_id) REFERENCES login(id)
);
CREATE INDEX idx_tracking_agent ON tracking_session_points(agent_id);
CREATE INDEX idx_tracking_recorded ON tracking_session_points(recorded_at);
CREATE INDEX idx_tracking_violation ON tracking_session_points(is_speed_violation) WHERE is_speed_violation = TRUE;
```

### tracking_agent_config

Limite de velocidade customizado por agente.

```sql
CREATE TABLE tracking_agent_config (
    agent_id TEXT PRIMARY KEY REFERENCES login(id),
    speed_limit_kmh DECIMAL(5,2) NOT NULL DEFAULT 81,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by TEXT
);
```

### tracking_global_config

Configurações globais de tracking.

```sql
CREATE TABLE tracking_global_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- default_speed_limit_kmh = '81'
```

---

## Validação de Velocidade (Backend)

O backend valida velocidade na inserção de cada ponto:

```js
const speedLimitNum = Number(speedLimit) || 81;
// Android GPS retorna m/s → nativo envia km/h (sem conversão)
// Heuristic: valores > 50 e inteiros → provavelmente m/s → ×3.6
if (speedKmh > 50 && speedKmh < 150 && Number.isInteger(speedKmh)) {
    speedKmh = Math.round(speedKmh * 3.6);
}
const isViolation = speedKmh != null && speedKmh > speedLimitNum;
```

O limite é buscado por agente (`tracking_agent_config`) ou usa o global (`tracking_global_config.default_speed_limit_kmh`, padrão 81 km/h).

---

## Endpoints

### Agente (nativo + web)

#### `POST /agent/tracking/sync-unified` (recomendado)

Payload unificado — cada ponto contém localização + status do dispositivo.

**Body:**
```json
{
  "points": [{
    "lat": -5.089,
    "lng": -42.801,
    "speed": 12.5,
    "accuracy": 8,
    "batteryLevel": 85,
    "isCharging": false,
    "networkType": "wifi",
    "gpsEnabled": true,
    "deviceModel": "SM-G998B",
    "devicePlatform": "android",
    "osVersion": "14",
    "timestamp": 1716000000000
  }]
}
```

**Resposta:**
```json
{
  "success": true,
  "synced": 12,
  "violations": 1,
  "speedLimitApplied": 81.0
}
```

#### `GET /agent/tracking/config`
Retorna `{ agentSpeedLimit, globalSpeedLimit }` — limites de velocidade configurados.

#### `PUT /agent/tracking/config`
Atualiza o limite de velocidade do agente: `{ speedLimitKmh: 90 }`.

#### `POST /agent/tracking/heartbeat`
Envia presença online: `{ lat, lng }`. Atualiza `login.last_heartbeat_at/lat/lng`.

### Admin

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/admin/tracking/agents` | Todos os agentes (login) enriquecidos com último ponto de tracking |
| GET | `/admin/tracking/agent/:id/trail?from=&to=` | Trajeto histórico (até 10000 pontos) |
| GET | `/admin/tracking/speed_violations` | Pontos com `is_speed_violation = TRUE` |
| DELETE | `/admin/tracking/speed_violations/:id` | Excluir infração (requer `COMPANY_ADMIN`) |
| GET | `/admin/tracking/global-config` | Configurações globais |
| PUT | `/admin/tracking/global-config` | Atualizar config: `{ key, value }` |
| GET | `/admin/tracking/agent-config/:id` | Config de tracking do agente |
| PUT | `/admin/tracking/agent-config/:id` | Atualizar limite do agente: `{ speedLimitKmh }` |
| GET | `/admin/tracking/fall_incidents` | Incidentes de queda |
| PUT | `/admin/tracking/fall_incidents/:id` | Atualizar status do incidente |
| GET | `/admin/tracking/alerts` | Log de alertas |

---

## HeartbeatIndicator (frontend)

O componente `HeartbeatIndicator.tsx` mostra um pulso em tempo real a cada sync:

- **Nativo (Android):** ouve `DeviceNativePlugin.emitTrackingEventStatic("location", count)` após resposta 200 do `sync-unified`
- **Web:** ouve `trackingEvents.emit({ type: 'sync', pointsCount, violationsCount, speedLimitApplied, syncedAt })` após `syncQueue` processar `tracking_batch_unified`

O indicador é um único dot que pulsa, mostra contagem de pontos sincronizados e badge de violação (!). Desaparece 3.5s após o sync.

---

## Anti-Kill: Proteção 24/7

O app NUNCA abre a interface sozinho.

| Camada | Arquivo | Intervalo | Disparo |
|--------|---------|-----------|---------|
| START_STICKY | `TrackingForegroundService.java` | imediato | Sistema recria o Service se processo morto |
| onTaskRemoved | `TrackingForegroundService.java` | imediato | Usuário limpa o app dos recentes |
| onDestroy | `TrackingForegroundService.java` | imediato | Service é destruído |
| AlarmManager | `TrackingAlarmReceiver.java` | **1 min** | `setAlarmClock` (funciona em Doze) |
| WorkManager | `TrackingWatchdogWorker.java` | **1 min** | Auto-reagendável, Backup via AlarmManager se service falhar |
| BootReceiver | `BootReceiver.java` | boot | Dispositivo reinicia |
| FCM Push | `FcmRestartReceiver.java` | push | Servidor envia `restart_tracking` |

### Matriz de Proteção

| Cenário | Proteção | Eficácia |
|---------|----------|----------|
| App minimizado (background) | Foreground Service + FusedLocationProviderClient | 100% |
| Tela desligada / bloqueada | GPS nativo independente do WebView | 100% |
| App removido dos recentes | onTaskRemoved + START_STICKY + AlarmManager 1min + WorkManager 1min | ~99% |
| Processo morto pelo SO | START_STICKY + AlarmManager 1min + WorkManager 1min | ~98% |
| Boot do celular | BootReceiver inicia Service + watchdogs | 100% |
| **Force Stop (Config > Apps)** | Nenhum app comum sobrevive. Solução: MDM | Não protegido |
| OEM chinesa (Xiaomi, Huawei, Oppo) | AlarmManager + WorkManager + sync nativo | Parcial |

---

## Configurações

| Parâmetro | Valor | Onde |
|-----------|-------|------|
| Sync interval (nativo) | 30s | `TrackingForegroundService` |
| Sync interval (JS) | imediato (throttle 10s) + timer 30s | `trackingService.ts` |
| Batch size | 50 pontos | `TrackingForegroundService` |
| Precisão mínima | 30m | `TrackingForegroundService` |
| Distância mínima | 5m | `TrackingForegroundService` |
| Intervalo de localização | 5s (mín 2s) | `TrackingForegroundService` |
| Dados antigos (cleanup) | 7 dias | `TrackingForegroundService` |
| Watchdog AlarmManager | 1 min | `TrackingAlarmReceiver` |
| Watchdog WorkManager | 1 min | `TrackingWatchdogWorker` |
| Limite de velocidade padrão | 81 km/h | `tracking_global_config` |
| foregroundServiceType | `location` | AndroidManifest.xml (obrigatório Android 14+) |
| SCHEDULE_EXACT_ALARM | Manifest + runtime (Android 13+) | Fallback para setInexactRepeating se negado |