# Tracking & Monitoramento

Sistema de rastreamento GPS em tempo real dos agentes de campo. Tolerância zero a falhas — funciona offline-first, em segundo plano, sem nunca trazer o app para primeiro plano.

---

## Arquitetura Geral

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
        ├── HTTP POST → /agent/tracking/sync-v2
        ├── Se 200 OK → marca synced = 1 + envia heartbeat (POST /agent/tracking/heartbeat)
        └── Se falhar → mantém synced = 0 (retry na próxima)
```

### Heartbeat (presença online)

O serviço nativo envia um heartbeat leve (`POST /agent/tracking/heartbeat`) após cada sync bem-sucedido (a cada 30s), contendo apenas `{ lat, lng }`. O backend atualiza `login.last_heartbeat_at`, `last_heartbeat_lat` e `last_heartbeat_lng`.

O admin frontend consulta `GET /admin/tracking/agents-v2` para obter o heartbeat dos agentes. A determinação de online/offline no admin é:

| Origem | Online se |
|--------|-----------|
| **Natino (APK)** | `last_heartbeat_at` < 5 min (enviado pelo próprio serviço a cada 30s) |
| **Web (PWA)** | `recorded_at` do último `tracking_points` < 5 min (comportamento legado) |

### Duas camadas independentes

| Camada | Coleta | Armazenamento | Sync | Ativo quando |
|--------|--------|---------------|------|--------------|
| **Natina (Java)** | FusedLocationProviderClient (GPS + rede + Wi-Fi) | SQLite nativo | HTTP direto a cada 30s | **Sempre** (WebView vivo ou morto) |
| **JS (WebView)** | Capacitor BackgroundGeolocation + watchPosition | IndexedDB | syncQueue via axios (imediato + 30s) | Quando o WebView está vivo |

As duas camadas funcionam em paralelo. O backend deduplica por `point_id`.

---

## Serviço Nativo — TrackingForegroundService

### Provedor de Localização

Usa `FusedLocationProviderClient` do Google Play Services com `PRIORITY_HIGH_ACCURACY`:
- Funde chip GPS + triangulação de ERBs (torres de celular) + redes Wi-Fi próximas
- Mais rápido para obter o primeiro fix (sinal estável) que o `LocationManager` cru
- Funciona melhor em túneis, ruas estreitas, sombra de árvores
- Intervalo: **5s** entre atualizações, mínimo **2s**

### Filtros de Qualidade de Dados

**1. Precisão (accuracy)**
```java
if (!location.hasAccuracy() || location.getAccuracy() > MAX_ACCURACY_M) return;
// MAX_ACCURACY_M = 30 metros
```
Rejeita pontos com sinal fraco. Evita que o mapa exiba posições imprecisas (saltos falsos).

**2. Distância mínima**
```java
if (lastSavedLocation != null) {
    Location.distanceBetween(..., dist);
    if (dist[0] < MIN_DISTANCE_M) return;
}
// MIN_DISTANCE_M = 5 metros
```
Ignora pontos com deslocamento menor que 5m do último salvo. Se o agente está parado (sinal fechado, esperando pedido), não acumula centenas de pontos no mesmo lugar.

### Buffering Local (Offline-First)

Toda coordenada é imediatamente gravada no SQLite local com `synced = 0`:
```sql
INSERT INTO tracking_points (point_id, lat, lng, speed, accuracy, battery_level, network_type, device_model, device_platform, os_version, ts, synced)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
```

### Sync Nativo (HTTP)

Thread separada executa a cada **30s**:
1. Lê até 50 pontos com `synced = 0` (ordenados por timestamp)
2. Monta payload JSON e envia via `POST /agent/tracking/sync-v2`
3. Se servidor responde 200 OK → marca `synced = 1`
4. Se falhar (rede off, servidor fora) → dados permanecem `synced = 0` e são reenviados no próximo ciclo
5. Dados sincronizados com mais de 7 dias são deletados

### Verificações em Tempo Real no Native Service

O `TrackingForegroundService` também executa nativamente:

1. **Excesso de velocidade** (>81 km/h): salva em `speed_violations` (SQLite), envia notificação nativa, sync via HTTP batch
2. **Proximidade de riscos de segurança** (50m de um security report): lê dados de `SharedPreferences` (escritos pelo JS ao abrir o app), calcula distância Haversine em cada GPS tick, notifica com cooldown de 20 min por ponto. Nativo nunca faz HTTP próprio. No mobile, o JS (`proximityAlert.ts`) aborta se `isNative()` — só o nativo dispara. No web, o JS mantém a checagem.

Ambas rodam no mesmo processo nativo, independentes do WebView.

### Dados enviados por ponto

| Campo | Origem | Formato |
|-------|--------|---------|
| `lat`, `lng` | FusedLocationProviderClient | decimal degrees |
| `speed` | Location.getSpeed() | m/s |
| `accuracy` | Location.getAccuracy() | metros |
| `batteryLevel` | BatteryManager (0~1) | float (backend normaliza para 0~100) |
| `networkType` | ConnectivityManager | "wifi", "4g", "3g", "2g", "mobile", "none" |
| `deviceModel` | Build.MODEL | string |
| `devicePlatform` | hardcoded | "android" |
| `osVersion` | Build.VERSION.RELEASE | string |
| `timestamp` | Location.getTime() | epoch ms |

---

## Anti-Kill: Proteção 24/7

O app NUNCA abre a interface sozinho. Múltiplas camadas garantem que o serviço de tracking (GPS → SQLite → HTTP) continue rodando:

| Camada | Arquivo | Intervalo | Disparo |
|--------|---------|-----------|---------|
| START_STICKY | `TrackingForegroundService.java` | imediato | Sistema recria o Service se processo morto |
| onTaskRemoved | `TrackingForegroundService.java` | imediato | Usuário limpa o app dos recentes |
| onDestroy | `TrackingForegroundService.java` | imediato | Service é destruído |
| AlarmManager | `TrackingAlarmReceiver.java` | **1 min** | `setAlarmClock` (funciona em Doze) |
| WorkManager | `TrackingWatchdogWorker.java` | **1 min** | Auto-reagendável, Backup via AlarmManager se service falhar |
| BootReceiver | `BootReceiver.java` | boot | Dispositivo reinicia |
| FCM Push | `FcmRestartReceiver.java` | push | Servidor envia `restart_tracking` |

Nenhum desses mecanismos chama `startActivity()`. O app nunca volta para primeiro plano sozinho.

### Matriz de Proteção

| Cenário | Proteção | Eficácia |
|---------|----------|----------|
| App minimizado (background) | Foreground Service + FusedLocationProviderClient | 100% |
| Tela desligada / bloqueada | GPS nativo independente do WebView | 100% |
| App removido dos recentes | onTaskRemoved + START_STICKY + AlarmManager 1min + WorkManager 1min | ~99% |
| Processo morto pelo SO | START_STICKY + AlarmManager 1min + WorkManager 1min | ~98% |
| Boot do celular | BootReceiver inicia Service + watchdogs | 100% |
| **Force Stop (Config > Apps)** | Nenhum app comum sobrevive. Solução: MDM | Não protegido |
| OEM chinesa (Xiaomi, Huawei, Oppo) | AlarmManager + WorkManager + sync nativo (onTaskRemoved bloqueado pela ROM) | Parcial |

---

## Dados do Dispositivo

### Coleta por plataforma

| Dado | Mobile (nativo) | Web (fallback) |
|------|----------------|----------------|
| Nível da bateria | `BatteryManager` (0~1) | `navigator.getBattery()` (0~1) |
| Tipo de rede | `ConnectivityManager` | `navigator.connection.effectiveType` |
| Modelo | `Build.MODEL` | `navigator.userAgent` |
| Fabricante | `Build.MANUFACTURER` | — |
| Versão Android | `Build.VERSION.RELEASE` | — |
| IMEI / Serial | `DeviceNativePlugin` (com READ_PHONE_STATE) | — |

### Normalização da bateria

- Capacitor/navegador envia 0~1
- Nativo envia 0~1 (convertido de `BatteryManager.getIntProperty(BATTERY_PROPERTY_CAPACITY) / 100f`)
- Backend normaliza: `if (batteryLevel <= 1) batteryLevel = Math.round(batteryLevel * 100)`
- Armazenado no PostgreSQL como `DECIMAL(4,2)` (0~100)

---

## Endpoints

### Synct (v2 — recomendado)

#### `POST /agent/tracking/sync-v2`

Batch sync com deviceInfo e dados do dispositivo em cada ponto.

**Body:**
```json
{
  "points": [
    {
      "lat": -5.089,
      "lng": -42.801,
      "speed": 12.5,
      "accuracy": 8,
      "batteryLevel": 0.85,
      "networkType": "wifi",
      "deviceModel": "SM-G998B",
      "devicePlatform": "android",
      "osVersion": "14",
      "timestamp": 1716000000000
    }
  ],
  "violations": [],
  "incidents": [],
  "alerts": [],
  "deviceInfo": {
    "batteryLevel": 0.85,
    "connectionType": "wifi",
    "deviceModel": "SM-G998B",
    "devicePlatform": "android",
    "osVersion": "14"
  }
}
```

### Legado

#### `POST /agent/tracking/sync`
Mesmo formato sem campos de dispositivo.

#### `POST /agent/fcm-token`
```json
{ "token": "fcm_token_string", "deviceInfo": "android_..." }
```

### Admin

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/admin/tracking/agents` | Última posição de todos os agentes |
| GET | `/admin/tracking/agent/:id/trail?from=&to=` | Trajeto histórico |
| GET | `/admin/tracking/speed_violations` | Infrações de velocidade |
| DELETE | `/admin/tracking/speed_violations/:id` | Excluir infração (requer `COMPANY_ADMIN`) |
| GET | `/admin/tracking/fall_incidents` | Incidentes de queda |
| PUT | `/admin/tracking/fall_incidents/:id` | Atualizar status do incidente |
| GET | `/admin/tracking/alerts` | Log de alertas |

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
| Limite de velocidade | 81 km/h | `trackingService.ts` (constante) |
| foregroundServiceType | `location` | AndroidManifest.xml (obrigatório Android 14+) |
| SCHEDULE_EXACT_ALARM | Manifest + runtime (Android 13+) | Fallback para setInexactRepeating se negado |
