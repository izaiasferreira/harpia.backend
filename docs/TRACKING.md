# Tracking & Monitoramento

Sistema de rastreamento GPS em tempo real dos agentes de campo. Tolerância zero a falhas — funciona offline-first, em segundo plano, sem nunca trazer o app para primeiro plano.

---

## Arquitetura Geral

### Modelo Unificado com Staging-First (v3 — atual)

A partir da atualização de Junho/2026, o sistema utiliza uma **tabela de staging temporária** (`tracking_staging`) para gravação imediata dos pontos em 1-3ms, liberando a requisição HTTP de forma assíncrona. O processamento definitivo, incluindo validações de velocidade e atualização de status, é executado em background pelo worker.

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
        ├── Backend:
        │   ├── Valida backpressure (recusa se staging > 100k pontos pendentes)
        │   ├── Insere diretamente em `tracking_staging` (UNLOGGED, sem índices complexos)
        │   └── Retorna imediatamente 200 OK com { synced }
        │
        └── Em background (Worker a cada 5s):
            ├── Busca lote de até 5000 pontos (`FOR UPDATE SKIP LOCKED`)
            ├── Resolve speed limit por agente (com cache em memória de 30s)
            ├── Normaliza e insere em `tracking_session_points` (marcando violações)
            ├── Atualiza `login.last_heartbeat_at/lat/lng`
            └── Limpa staging antigo (> 24h)
```

### Camadas de Coleta

| Camada | Coleta | Armazenamento | Sync | Ativo quando |
|--------|--------|---------------|------|--------------|
| **Nativa (Java)** | FusedLocationProviderClient (GPS + rede + Wi-Fi) | SQLite nativo | HTTP direto a cada 30s | **Sempre** (WebView vivo ou morto) |
| **JS (WebView)** | BackgroundGeolocation + Geolocation.watchPosition | IndexedDB | syncQueue via axios | Quando o WebView está vivo |

As duas camadas funcionam em paralelo. O backend deduplica por `point_id` (nativo) ou aceita duplicados removendo `id` no insert (web).

### Heartbeat (presença online)

Para otimização de performance e redução de conexões simultâneas, a rota de heartbeat (`POST /agent/tracking/heartbeat`) foi transformada em **NOOP (No Operation)** no backend. Ela retorna sucesso de forma imediata sem tocar no banco de dados. 

A atualização real do status "Online" e do último batimento (`last_heartbeat_at/lat/lng`) agora é feita de forma **assíncrona** pelo worker em background a partir do último ponto processado no lote de sincronização.

| Origem | Online se |
|--------|-----------|
| **Nativo (APK)** | `last_heartbeat_at` < 5 min (atualizado pelo worker) |
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

#### `POST /agent/tracking/sync-unified` (Recomendado)

Enfileira de forma ultra-rápida (1-3ms) os pontos geográficos na tabela de staging para processamento assíncrono. Retorna imediatamente.

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
  "synced": 1,
  "violations": 0,
  "speedLimitApplied": 81.0
}
```

*Nota: `violations` sempre retornará 0 no momento do sync, já que o processamento real de velocidade é realizado em segundo plano pelo worker.*

#### `GET /agent/tracking/config`
Retorna `{ agentSpeedLimit, globalSpeedLimit }` — limites de velocidade configurados.

#### `PUT /agent/tracking/config`
Atualiza o limite de velocidade do agente: `{ speedLimitKmh: 90 }`.

#### `POST /agent/tracking/heartbeat` (Legado — NOOP)
Rota de compatibilidade com aplicativos antigos. O servidor responde `{ success: true, deprecated: true }` imediatamente sem tocar no banco. A atualização de presença do agente é realizada pelo worker a partir do fluxo de sincronização.

#### `POST /agent/tracking/alerts/sync`
Recebe alert logs do dispositivo nativo. Registra em `agent_alerts_log`.

**Body:**
```json
{
  "alerts": [{
    "type": "high_speed",
    "lat": -5.089,
    "lng": -42.801,
    "details": {},
    "timestamp": 1716000000000
  }]
}
```

**Resposta:**
```json
{ "success": true, "synced": 1 }
```

### Admin

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/admin/tracking/agents` | Todos os agentes (login) enriquecidos com último ponto de tracking |
| GET | `/admin/tracking/agent/:id/trail?from=&to=` | Trajeto histórico (até 10000 pontos) |
| GET | `/admin/tracking/agent/:id/trail-extended?from=&to=` | Trajeto + paradas detectadas |
| GET | `/admin/tracking/agent/:id/alerts?from=&to=` | Alertas de proximidade recebidos pelo agente na janela (`agent_proximity_alerts`) |
| GET | `/admin/tracking/speed_violations` | Pontos com `is_speed_violation = TRUE` |
| DELETE | `/admin/tracking/speed_violations/:id` | Excluir infração (requer `COMPANY_ADMIN`) |
| GET | `/admin/tracking/global-config` | Configurações globais |
| PUT | `/admin/tracking/global-config` | Atualizar config: `{ key, value }` |
| GET | `/admin/tracking/agent-config/:id` | Config de tracking do agente |
| PUT | `/admin/tracking/agent-config/:id` | Atualizar limite do agente: `{ speedLimitKmh }` |

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

---

## Dead Reckoning (Estimativa de Posição) & Anti-Doze

A partir de Julho/2026, o sistema de tracking conta com duas camadas para eliminar lacunas de localização causadas pelo modo **Doze** do Android:

### Anti-Doze (Android)

O Android Doze restringe `FusedLocationProviderClient.requestLocationUpdates()` mesmo para foreground services após longos períodos de tela desligada. As seguintes medidas foram implementadas:

1. **`setMaxUpdateDelayMillis(10_000)`** — Android 12+: limita o delay máximo entre atualizações de localização a 10s, mesmo em Doze.

2. **Watchdog via AlarmManager (`setAndAllowWhileIdle`) a cada 15s** — receptor unificado `TrackingWatchdogReceiver` que:
   - Verifica stall do GPS: se `recorded_at` (último ponto real) > 5 min atrás → re-registra `requestLocationUpdates()` + solicita uma localização única (`requestSingleLocation()`)
   - Dispara `estimatePosition()` se o último ponto real está entre 15-60s atrás (janela de estimação)
   - Executa em processo estático (`onWatchdogTick()` lê `lastRealGpsTimestamp` do `SharedPreferences`)

3. **`requestDisableBatteryOptimization()`** — solicitação única na primeira inicialização para reduzir chance de Doze profundo.

### Algoritmo de Dead Reckoning

Quando o GPS falha brevemente (< 60s), a posição é extrapolada linearmente:

```
estimatePosition():
  delta_t = agora - lastRealGpsTimestamp
  se delta_t > 60s → aborta (não estima)
  heading = bearing(lastRealLat, lastRealLng, lastGpsLat, lastGpsLng)
  dist = speed_kmh * (delta_t / 3600)  // km percorridos no intervalo
  lat, lng = haversineStep(lastRealLat, lastRealLng, heading, dist)
  salva como is_estimated=true, estimated_from_lat/lng apontando para o último GPS real
```

**Limitações:**
- Teto de 60s de estimação (após isso, para de estimar e aguarda GPS)
- Não usa acelerômetro/giroscópio (step detection via inércia é imprevisível — 20-30% de erro com celular no bolso/mão/mesa)
- Desvio (`dead_reckon_drift`) é calculado quando o GPS retorna: distância haversine entre posição real e estimada

### Stop Detection (Backend)

A rota `GET /admin/tracking/agent/:id/trail-extended` executa detecção de paradas no backend:

```
getAgentTrailWithStops(agentId, dateFrom, dateTo):
  points = getAgentTrailUnified(...)
  para cada ponto consecutivo:
    agrupa por proximidade geográfica (< 20m do primeiro do cluster)
    se cluster >= 3 pontos:
      velocidade média < 2 km/h → confirma parada
      duração > 60s → registra como stop
  retorna { points, stops }
```

Cada stop contém: `lat, lng, stopped_at, resumed_at, duration_seconds, n_points, accuracy_avg, speed_avg`.

### Novas Colunas em `tracking_session_points` (migration 022)

```sql
ALTER TABLE tracking_session_points
  ADD COLUMN IF NOT EXISTS is_estimated BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS estimated_from_lat DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS estimated_from_lng DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS dead_reckon_drift DECIMAL(6,2),
  ADD COLUMN IF NOT EXISTS heading_at_estimation DECIMAL(5,1);
```

### Novos Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/admin/tracking/agent/:id/trail-extended?from=&to=` | Pontos + paradas detectadas (`{ points, stops }`) |
| GET | `/admin/tracking/agent/:id/alerts?from=&to=` | Alertas de proximidade recebidos pelo agente na janela (`agent_proximity_alerts`) |

### Frontend — HistoryTab (Painel Admin)

A aba de histórico agora renderiza:

- **Pontos estimados**: `CircleMarker` com `fillOpacity: 0.1` (oco) e borda âmbar; trecho da polyline tracejada (`dashArray: '8, 8'`, opacidade reduzida)
- **Paradas**: marcadores roxos (#7C3AED) com tooltip mostrando duração, velocidade média e precisão
- **Sinal perdido**: gaps > 60s entre pontos consecutivos → marcador laranja pulsante (CSS `signal-lost-pulse`) na última posição conhecida; gaps > 5min exibem badge "⚠ Sinal perdido > 5min"
- **Legenda**: toggles Eye/EyeOff para controlar visibilidade de pontos estimados, paradas e sinal perdido
- **Badge de estimados**: contagem de pontos estimados exibida nas abas de trajeto (amarelo)