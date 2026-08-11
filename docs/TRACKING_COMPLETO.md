# 🗺️ Sistema de Tracking — Gedai

## Sumário
1. [Visão Geral da Arquitetura](#1-visão-geral-da-arquitetura)
2. [Fluxo Ponta-a-Ponta](#2-fluxo-ponta-a-ponta)
3. [Mobile — App do Agente (Android Nativo)](#3-mobile--app-do-agente-android-nativo)
4. [Mobile — Fallback WebView (PWA)](#4-mobile--fallback-webview-pwa)
5. [Backend — API e Processamento](#5-backend--api-e-processamento)
6. [Admin Web — Painel de Monitoramento](#6-admin-web--painel-de-monitoramento)
7. [Banco de Dados — Tabelas e Relacionamentos](#7-banco-de-dados--tabelas-e-relacionamentos)
8. [Validação de Velocidade](#8-validação-de-velocidade)
9. [Detecção de Quedas](#9-detecção-de-quedas)
10. [Heartbeat e Presença Online](#10-heartbeat-e-presença-online)
11. [Anti-Kill (Proteção 24/7)](#11-anti-kill-proteção-247)
12. [Matriz de Funcionalidades por Camada](#12-matriz-de-funcionalidades-por-camada)
13. [Referência de Endpoints](#13-referência-de-endpoints)
14. [Glossário](#14-glossário)

---

## 1. Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AGENTE (Mobile)                              │
│                                                                     │
│  ┌─────────────────────┐     ┌──────────────────────────────────┐   │
│  │   NATIVO (Java)      │     │   WEBVIEW / PWA (JS/TS)          │   │
│  │                      │     │                                  │   │
│  │  FusedLocationClient │     │  navigator.geolocation           │   │
│  │       ↓              │     │  @capacitor/geolocation          │   │
│  │  SQLite (synced=0)   │     │       ↓                          │   │
│  │       ↓              │     │  IndexedDB (synced=0)            │   │
│  │  HTTP POST a cada 30s│     │       ↓                          │   │
│  │  /tracking/sync-uni. │     │  syncQueue a cada 30s            │   │
│  │       │              │     │  /tracking/sync-unified          │   │
│  └───────┼──────────────┘     └──────────┼───────────────────────┘   │
│          │                               │                           │
│          └───────────┬───────────────────┘                           │
│                      │                                               │
│                      │ POST /agent/tracking/sync-unified             │
│                      ▼                                               │
└──────────────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       BACKEND (Node.js + PostgreSQL)                 │
│                                                                     │
│  Agente recebe pontos → Valida schema Zod → Busca limite do agente │
│  → Normaliza bateria (0-1 → 0-100) e velocidade (m/s → km/h)       │
│  → Insere em tracking_session_points com is_speed_violation         │
│  → Atualiza heartbeat (login.last_heartbeat_at)                     │
│  → Retorna { synced, violations, speedLimitApplied }                │
│                                                                     │
│  ┌─────────────────────┐                                            │
│  │  PostgreSQL          │                                            │
│  │                      │                                            │
│  │  tracking_session_   │── Pontos GPS unificados                    │
│  │     points           │    (v3 - NOVO)                             │
│  │                      │                                            │
│  │  tracking_agent_     │── Limites por agente (v3)                  │
│  │     config           │                                            │
│  │                      │                                            │
│  │  tracking_global_    │── Config global (v3)                       │
│  │     config           │                                            │
│  │                      │                                            │
│  │  fall_incidents      │── Incidentes de queda (legado)             │
│  │  agent_alerts_log    │── Logs de alerta (legado)                  │
│  │                      │                                            │
│  │  login               │── Heartbeat (last_heartbeat_at/lat/lng)    │
│  │                      │                                            │
│  │  ── (legado) ──      │                                            │
│  │  tracking_session_points  │── Tabela unificada de pontos                  │
│  └──────────────────────┘                                            │
└──────────────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    ADMIN WEB (React + Leaflet)                       │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  TrackingAdmin.tsx  (?tab=live|history|speed|falls|settings)  │   │
│  └──────┬──────┬──────┬──────┬──────┬──────┬─────────────────────┘   │
│         │      │      │      │      │      │                        │
│         ▼      ▼      ▼      ▼      ▼      ▼                        │
│  ┌──────┐ ┌───────┐ ┌──────┐ ┌──────┐ ┌────────┐                   │
│  │ LIVE │ │HISTORY│ │ SPEED│ │ FALLS│ │SETTINGS│                   │
│  │      │ │       │ │      │ │      │ │        │                   │
│  │Mapa  │ │Mapa + │ │Mapa +│ │Lista │ │Form.   │                   │
│  │agentes│ │trajeto│ │infra-│ │inci- │ │config  │                   │
│  │online/│ │slider │ │ções  │ │dentes│ │global  │                   │
│  │offline│ │gráfico│ │agrup.│ │      │ │        │                   │
│  │flutu- │ │playback│ │por   │ │      │ │        │                   │
│  │antes  │ │       │ │data/ │ │      │ │        │                   │
│  │       │ │       │ │agente│ │      │ │        │                   │
│  └──────┘ └───────┘ └──────┘ └──────┘ └────────┘                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Fluxo Ponta-a-Ponta

```
GPS (celular do agente)
 │
 ├─ CHECA: accuracy ≤ 30m?    ──NÃO→ REJEITA
 ├─ CHECA: distância > 5m do último? ──NÃO→ IGNORA
 │
 ▼
 Salva no SQLite local (synced=0) / IndexedDB
 │
 ├─ Timer 30s (ou 50 pontos acumulados)
 │
 ▼
 HTTP POST /agent/tracking/sync-unified
 ┌─────────────────────────────────────┐
 │ Payload: {                          │
 │   points: [{                        │
 │     id, lat, lng, speed, accuracy,  │
 │     batteryLevel, isCharging,        │
 │     networkType, gpsEnabled,         │
 │     deviceModel, devicePlatform,     │
 │     osVersion, timestamp             │
 │   }]                                │
 │ }                                    │
 └─────────────────────────────────────┘
 │
 ▼
 ┌─── BACKEND ─────────────────────────────────────────────┐
 │                                                         │
  │ 1. Valida com Zod (unifiedPointSchema)                  │
  │    • Ponto inválido (sem lat/lng, formato legado, etc.)  │
  │      é logado e DESCARTADO — não derruba o lote          │
  │ 2. Busca speed_limit do agente (tracking_agent_config)  │
 │    ↓ não encontrado                                     │
 │ 3. Usa default global (tracking_global_config = 81km/h) │
 │ 4. Normaliza: battery 0-1→0-100, speed heurística       │
 │ 5. Insere em tracking_session_points                    │
 │    • Se speed > limit → is_speed_violation = TRUE       │
 │ 6. Atualiza heartbeat no login                          │
 │ 7. Retorna { synced, violations, speedLimitApplied }    │
 └─────────────────────────────────────────────────────────┘
 │
 ▼
 Admin Web consulta:
 ├── LIVE:      GET /admin/tracking/agents + /agents-v2
 ├── HISTORY:   GET /admin/tracking/agent/:id/trail
 ├── SPEED:     GET /admin/tracking/speed_violations
 ├── FALLS:     GET /admin/tracking/fall_incidents
 └── SETTINGS:  GET/PUT /admin/tracking/global-config
```

---

## 3. Mobile — App do Agente (Android Nativo)

### 3.1 Camada Nativa (Java) — Funciona 24/7

O **TrackingForegroundService.java** roda como foreground service com `START_STICKY` e notificação persistente "Gedai — Rastreamento ativo". Independe completamente do WebView.

```
┌──────────────────────────────────────────────────────────────┐
│                TrackingForegroundService.java                 │
│                                                              │
│  ┌────────────────┐                                          │
│  │FusedLocation   │ ← Google Play Services                   │
│  │ProviderClient  │    (GPS + ERB + Wi-Fi)                   │
│  │PRIORITY_HIGH_  │    intervalo 5s, mín 2s                  │
│  │ACCURACY        │                                          │
│  └───────┬────────┘                                          │
│          │                                                    │
│          ▼                                                    │
│  ┌────────────────┐                                          │
│  │ saveLocation() │── accuracy > 30m? → REJEITA              │
│  │                │── dist < 5m do último? → IGNORA          │
│  │                │── Lê bateria, rede, GPS status           │
│  │                │── Checa velocidade (>81 km/h) → notifica │
│  │                │── Checa proximidade (50m) → notifica     │
│  │                │── Salva no SQLite (synced=0)             │
│  └───────┬────────┘                                          │
│          │                                                    │
│          ▼ (a cada 30s)                                       │
│  ┌────────────────┐                                          │
│  │ syncThread     │── SELECT synced=0 LIMIT 50               │
│  │                │── POST /agent/tracking/sync-unified      │
│  │                │── 200 OK → UPDATE synced=1               │
│  │                │         → sendHeartbeat(lat,lng)         │
│  │                │         → emit trackingSync para WebView │
│  │                │── Falha → retry no próximo ciclo         │
│  │                │── Cleanup >7 dias                        │
│  └────────────────┘                                          │
└──────────────────────────────────────────────────────────────┘
```

**Filtros de qualidade (antes de salvar):**

| Filtro | Condição | Por quê? |
|--------|----------|----------|
| Precisão | `accuracy > 30m` → REJEITA | Sinal fraco (dentro de prédio, túnel) |
| Distância | `< 5m` do último → IGNORA | Evita pontos duplicados/aglomerados |

**Status do dispositivo coletado a cada ponto:**

```
┌─────────────────────────────────────────────────────┐
│  Ponto GPS (a cada 5s)                               │
│                                                       │
│  lat=-5.089   lng=-42.812   speed=45.2   acc=8.5m   │
│                                                       │
│  ┌───────────────────────────────────────────────┐   │
│  │  🔋 85%  ⚡ não carregando   📶 4G   🛰️ GPS OK │   │
│  │  📱 SM-A536  Android 13                        │   │
│  └───────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### 3.2 Estrutura de Arquivos (Mobile Nativo)

```
mobile/android/app/src/main/java/com/cenos/app/
├── MainActivity.java                 ─── Entry point, registra plugins, inicia watchdogs
├── TrackingForegroundService.java     ─── Serviço GPS persistente (START_STICKY)
├── TrackingWatchdogWorker.java        ─── WorkManager auto-reagendável (1min)
├── TrackingAlarmReceiver.java         ─── AlarmManager Doze-resistant (1min)
├── BootReceiver.java                  ─── Reinicia tracking após reboot
├── FcmRestartReceiver.java           ─── Firebase push + overlay crítico
├── DeviceNativePlugin.java           ─── Plugin Capacitor: IMEI, serial, dados do sistema
├── OverlayPermissionPlugin.java      ─── Plugin Capacitor: overlay flutuante + notificações
├── AppUpdatePlugin.java              ─── Plugin Capacitor: download + instalação APK
├── BatteryOptimizationPlugin.java    ─── Plugin Capacitor: desabilitar otimização de bateria
├── FloatingBubbleService.java        ─── Bolha flutuante com alertas e atalhos
```

---

## 4. Mobile — Fallback WebView (PWA)

Quando o app roda como PWA (navegador, não APK), o **trackingService.ts** assume a coleta:

```
navigator.geolocation / @capacitor/geolocation
 │
 ▼
 handleLocationUpdate()
 ├── Salva em IndexedDB (TRACKING_POINTS)
 ├── Verifica velocidade >81 km/h
 │     └── Salva em SPEED_VIOLATIONS (IndexedDB)
 ├── Verifica proximidade (proximityAlert.ts)
 └── sync via syncQueue (30s, batch de 50 pontos)
       └── POST /agent/tracking/sync-unified
```

**Quando `isNative()` retorna `true`** (rodando no APK):
- Toda coleta JS é **abortada**
- O `trackingService` só persiste a `api_base_url` nas Preferences para o serviço nativo consumir
- A regra é: **funções contínuas sempre no nativo**, JS é apenas fallback

---

## 5. Backend — API e Processamento

### 5.1 Endpoint de Sync

```
POST /agent/tracking/sync-unified
X-Telegram-Init-Data: {token_de_autenticacao}

Body: {
  points: [
    {
      id: "uuid-unico-do-ponto",
      lat: -5.089,
      lng: -42.812,
      speed: 45.2,
      accuracy: 8.5,
      batteryLevel: 85,
      isCharging: false,
      networkType: "4g",
      gpsEnabled: true,
      deviceModel: "SM-A536",
      devicePlatform: "android",
      osVersion: "13",
      timestamp: 1718000000000
    }
  ]
}
```

### 5.2 Processamento Interno

```
insertUnifiedPoints (REMOVED — dead code)
 │
 ├── Esta função foi removida. O staging + worker assíncrono
 │   (trackingSyncWorker) é agora o único fluxo de processamento.
 │
 ├── O fluxo atual (sync-unified → staging → worker) está documentado
 │   na seção 5.3 acima.
```

### 5.3 Resposta do Backend

```json
{
  "success": true,
  "synced": 12,
  "violations": 1,
  "speedLimitApplied": 81.0
}
```

---

## 6. Admin Web — Painel de Monitoramento

### 6.1 Estrutura de Abas

```
┌────────────────────────────────────────────────────────────────┐
│  TrackingAdmin.tsx                                              │
│  ┌──────┬─────────┬──────────┬────────┬──────────┐            │
│  │ LIVE │HISTÓRICO│VELOCIDADE│ QUEDAS │ CONFIG   │ ← Abas     │
│  └──────┴─────────┴──────────┴────────┴──────────┘            │
│                                                                │
│  URL: /control/tracking?tab=live|history|speed|falls|settings │
└────────────────────────────────────────────────────────────────┘
```

Arquivos:
```
front/src/admin/pages/tracking/
├── TrackingAdmin.tsx         ─── Orquestrador de abas (via ?tab=)
├── constants.ts              ─── Cores, ícones, helpers (gmapsLink, formatTime, etc.)
├── LiveTab.tsx               ─── Mapa com agentes em tempo real
├── HistoryTab.tsx            ─── Trajeto histórico + slider + gráfico
├── SpeedTab.tsx              ─── Infrações de velocidade agrupadas
├── FallsTab.tsx              ─── Incidentes de queda
└── SettingsTab.tsx           ─── Configuração global de tracking
```

### 6.2 Aba LIVE — Agentes em Tempo Real

```
┌──────────────────────────────────────────────────────────┐
│ 🔍 [Buscar agente...]                                    │ ← Painel flutuante topo
│                                                          │
│  ┌──────────────────────┐                                │
│  │ ┌──────────────────┐ │  🟢 João Silva                │ ← Painel flutuante
│  │ │                  │ │      ID: AGT-042               │    esquerdo
│  │ │     MAPA         │ │      Vel: 45 km/h             │
│  │ │   FULL SCREEN    │ │      🔋 85%  📶 4G            │
│  │ │                  │ │      📱 SM-A536               │
│  │ │  🟢 🟢 🟢        │ │      Último: 14:32:18        │
│  │ │     🟢 🟢 🟢     │ │      📍 Ver no Maps           │
│  │ │        ⚪        │ │                                │
│  │ │                  │ │ ┌──────────────────┐          │
│  │ └──────────────────┘ │ │ 🟢 Maria Santos  │          │
│  │                      │ │     ...           │          │
│  │                      │ └──────────────────┘          │
│  └──────────────────────┘                                │
│                                                          │
│  Auto-refresh: 30s  │  Online: 12  │  Offline: 3        │
└──────────────────────────────────────────────────────────┘

🟢 = Online (heartbeat ≤ 5min)    ⚪ = Offline (heartbeat > 5min)
```

**Funcionamento:**
1. **`loadLiveData()`** dispara `Promise.all([fetchTrackingAgents(), fetchAgentsHeartbeat()])`
2. Dados dos agentes são **mergeados** com heartbeat (que fornece lat/lng mais fresco e `last_seen`)
3. **Auto-refresh** a cada 30 segundos via `setInterval`
4. **Online/Offline**: heartbeat ≤ 5 minutos = 🟢, senão = ⚪
5. **Search filter**: filtra por nome, ID, estado, regional, seccional, gestor
6. **FlyTo**: clicar no card do agente voa o mapa até ele
7. **FitBounds**: na primeira carga apenas (`useRef` para evitar re-fit no refresh)

### 6.3 Aba HISTORY — Histórico de Trajeto

```
┌──────────────────────────────────────────────────────────┐
│ [Buscar agente...] ──── [📅 12/06/2026] ──── [+ Adicionar]│
│                                                          │
│  ┌──────────────────────┐   Trajetos ativos:             │
│  │                      │   ┌─ 🟦 João Silva (12/06)   │
│  │      MAPA            │   │   ● 142 pts, 3 est.      │
│  │    FULL SCREEN       │   │   [X] Remover            │
│  │                      │   │                           │
│  │  🟦━🟦━🟦━🟦━━━━     │   │ 👁️ Estimado             │
│  │   🟦━🟦 🟦━🟦        │   │ 👁️ Paradas 🟣           │
│  │    🟦━🟦━🟦━🟦      │   │ 👁️ Sinal perdido 🟠     │
│  │  🔴 (violação)       │   │                           │
│  │  🟣 (parada)         │   │ 📊 [Mostrar gráfico]      │
│  │  🟠 (sinal perdido)  │   │                           │
│  └──────────────────────┘   ──────▰▰▰▰▰▰▰▰▰──────      │
│                                   ▶ [Play]  0:42        │
│                                  ↑ slider temporal       │
│                              ┌──────────────────────┐    │
│                              │  Velocidade (km/h)    │    │
│                              │  80 ┤     ╱╲          │    │
│                              │  60 ┤   ╱  ╲   ╱╲    │    │
│                              │  40 ┤ ╱    ╲ ╱  ╲    │    │
│                              │  20 ┤╱      ╲╱    ╲──│    │
│                              │     0───10───20───30─→    │
│                              └──────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

**Funcionalidades:**
- Busca de agente com **autocomplete** (debounce 300ms, mínimo 2 caracteres, `fetchUserAgents`)
- **Data específica** (T00:00:00 até T23:59:59)
- **Múltiplos trajetos** simultâneos, cada um com cor distinta (array `TRAIL_COLORS` com 8 cores)
- **Dead Reckoning**: pontos estimados renderizados como `CircleMarker` oco (fillOpacity 0.1, borda âmbar) com polyline tracejada (`dashArray: '8, 8'`); contagem exibida em badge amarelo nas abas de trajeto
- **Stop Detection**: paradas detectadas exibidas como marcadores roxos com tooltip de duração, velocidade média e precisão
- **Signal Loss**: gaps > 60s entre pontos exibem marcador laranja pulsante; gaps > 5min mostram badge "⚠ Sinal perdido > 5min"
- **Legend toggles**: Eye/EyeOff para controlar visibilidade de pontos estimados, paradas e sinal perdido
- Cada ponto do trajeto renderizado como `CircleMarker` — **🔴 vermelho** se `is_speed_violation = true`
- **Slider temporal** na parte inferior — controla qual ponto atual é exibido no mapa
- **Play/Pause** — animação percorre os pontos a 200ms de intervalo
- **Gráfico de velocidade** — Recharts `LineChart` (km/h × índice do ponto)
- Remove trajetos individuais ou limpa todos

**Endpoint utilizado:** `GET /admin/tracking/agent/:id/trail-extended?from=&to=` (retorna `{ points, stops }`)

### 6.4 Aba SPEED — Infrações de Velocidade

```
┌──────────────────────────────────────────────────────────┐
│                    INFRAÇÕES DE VELOCIDADE               │
│                                                          │
│  ┌──────────────────────┐  ┌───────────────────────────┐│
│  │                      │  │ 📅 12/06/2026             ││
│  │      MAPA            │  │                           ││
│  │    FULL SCREEN       │  │  🟥 João Silva            ││
│  │                      │  │    ● 85 km/h (lim: 81)    ││
│  │  🟥 (João)           │  │    ● 92 km/h (lim: 81)    ││
│  │  🟧 (Maria)          │  │    [🗑️ Excluir]           ││
│  │  🟥                  │  │                           ││
│  │     🟧               │  │  🟧 Maria Santos          ││
│  │       🟪 (Pedro)     │  │    ● 83 km/h (lim: 81)    ││
│  │                      │  │    [🗑️ Excluir]           ││
│  └──────────────────────┘  │                           ││
│                            │ ───────────────────────────││
│                            │ 📅 11/06/2026             ││
│                            │  🟥 João Silva            ││
│                            │    ● 87 km/h (lim: 81)    ││
│                            │    [🗑️ Excluir]           ││
│                            └───────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

**Agrupamento:** `Dia → Agente → Infrações individuais`

**Cores por agente:**
| Agente | Cor | Código |
|--------|:---:|--------|
| João | 🟥 Vermelho | `#ef4444` |
| Maria | 🟧 Laranja | `#f97316` |
| Pedro | 🩷 Rosa | `#ec4899` |
| Ana | 🟪 Roxo | `#a855f7` |

**Exclusão:**
- Botão 🗑️ visível apenas para usuários com role `COMPANY_ADMIN`
- Aparece com `opacity-0 group-hover:opacity-100`
- Confirmação antes de deletar
- Remove da lista local imediatamente após confirmação do backend

### 6.5 Aba FALLS — Incidentes de Queda

```
┌──────────────────────────────────────────────────────────┐
│                   INCIDENTES DE QUEDA                    │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 🆘 AGT-042 · 12/06 14:32:18                        │  │
│  │    📍 -5.089, -42.812                              │  │
│  │    Status: ⏳ Pendente                              │  │
│  │    [✅ Confirmar]  [❌ Falso Positivo]              │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ ✅ AGT-018 · 11/06 09:15:42                        │  │
│  │    📍 -5.142, -42.731                              │  │
│  │    Status: ✅ Confirmado                            │  │
│  │    Confirmado em: 11/06 09:20:00                   │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ ❌ AGT-091 · 10/06 22:05:00                        │  │
│  │    📍 -5.201, -42.650                              │  │
│  │    Status: ❌ Falso Positivo                        │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**Status:**
- ⏳ **Pendente** — aguardando validação do admin
- ✅ **Confirmado** — admin confirmou como queda real
- ❌ **Falso Positivo** — admin descartou

### 6.6 Aba SETTINGS — Configuração Global

```
┌──────────────────────────────────────────────────────────┐
│               CONFIGURAÇÃO DE MONITORAMENTO              │
│                                                          │
│  Limite Global de Velocidade                             │
│  ┌─────────────────────────────────────┐                 │
│  │ [81] km/h  (1-300)                  │                 │
│  └─────────────────────────────────────┘                 │
│  [💾 Salvar]                                             │
│                                                          │
│  ── Configurações futuras ──                             │
│  ☐ Intervalo de sync (s)         [30   ]                │
│  ☐ Distância mínima (m)          [5    ]                │
│  ☐ Precisão GPS (m)              [30   ]                │
│  ☐ Detecção de queda             [ativado]              │
│  ☐ Alerta de bateria fraca       [20%  ]                │
└──────────────────────────────────────────────────────────┘
```

---

## 7. Banco de Dados — Tabelas e Relacionamentos

### 7.1 Diagrama de Entidades

```
┌────────────────────┐       ┌──────────────────────────┐
│       login        │       │ tracking_session_points  │ ← v3 (NOVO)
│────────────────────│       │──────────────────────────│
│ id (PK)            │──1:N──│ id (PK)                  │
│ nome               │       │ agent_id (FK)            │
│ regional           │       │ lat, lng                 │
│ seccional          │       │ speed, accuracy          │
│ gestor             │       │ battery_level            │
│ last_heartbeat_at  │       │ is_charging              │
│ last_heartbeat_lat │       │ network_type             │
│ last_heartbeat_lng │       │ gps_enabled              │
└────────────────────┘       │ device_model             │
       │                     │ device_platform          │
       │                     │ os_version               │
       │                     │ recorded_at              │
       │                     │ synced_at                │
       │                     │ speed_limit_applied      │
       │                     │ is_speed_violation       │
       │                     └──────────────────────────┘
       │
       │ 1:1 ┌──────────────────────┐
       ├─────│ tracking_agent_config│ ← v3 (NOVO)
       │     │──────────────────────│
       │     │ agent_id (PK, FK)    │
       │     │ speed_limit_kmh      │
       │     │ updated_at           │
       │     │ updated_by           │
       │     └──────────────────────┘
       │
       │ 1:N ┌──────────────────────┐
       ├─────│ fall_incidents       │ ← Legado (ainda ativo)
       │     │──────────────────────│
       │     │ id (PK)              │
       │     │ agent_id (FK)        │
       │     │ lat, lng             │
       │     │ status               │
       │     │ recorded_at          │
       │     │ confirmed_at         │
       │     │ notes                │
       │     └──────────────────────┘
       │
       │ 1:N ┌──────────────────────┐
       └─────│ agent_alerts_log     │ ← Legado (ainda ativo)
             │──────────────────────│
             │ id (PK)              │
             │ agent_id (FK)        │
             │ alert_type           │
             │ lat, lng             │
             │ details (JSONB)      │
             │ recorded_at          │
             └──────────────────────┘
```

### 7.2 tracking_session_points (v3)

```sql
-- ════════════════════════════════════════════════════════════
-- TABELA PRINCIPAL: tracking_session_points
-- ════════════════════════════════════════════════════════════
-- Cada linha = um ponto GPS + status completo do dispositivo
-- O backend decide se é violação no momento da inserção
--
-- PK: id (UUID gerado pelo cliente)
-- FK: agent_id → login(id)
-- INDEX: (agent_id, recorded_at DESC)
-- PARTIAL INDEX: (agent_id, is_speed_violation) WHERE is_speed_violation = TRUE
CREATE TABLE tracking_session_points (
    id              UUID PRIMARY KEY,
    agent_id        VARCHAR(20) NOT NULL REFERENCES login(id),
    lat             DOUBLE PRECISION NOT NULL,
    lng             DOUBLE PRECISION NOT NULL,
    speed           DOUBLE PRECISION DEFAULT 0,
    accuracy        DOUBLE PRECISION DEFAULT 0,
    battery_level   INTEGER,                     -- 0-100
    is_charging     BOOLEAN DEFAULT FALSE,
    network_type    VARCHAR(20),
    gps_enabled     BOOLEAN DEFAULT TRUE,
    device_model    VARCHAR(200),
    device_platform VARCHAR(20),
    os_version      VARCHAR(20),
    recorded_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    synced_at       TIMESTAMP DEFAULT NOW(),
    speed_limit_applied DOUBLE PRECISION,        -- qual limite foi usado
    is_speed_violation  BOOLEAN DEFAULT FALSE,   -- TRUE se speed > speed_limit_applied
    is_estimated        BOOLEAN DEFAULT FALSE,   -- TRUE = ponto gerado por dead reckoning
    estimated_from_lat  DOUBLE PRECISION,        -- último GPS real lat (para calcular drift)
    estimated_from_lng  DOUBLE PRECISION,        -- último GPS real lng
    dead_reckon_drift   DOUBLE PRECISION         -- distância estimada entre real e estimado (m)
);
```

### 7.3 tracking_agent_config (v3)

```sql
-- ════════════════════════════════════════════════════════════
-- CONFIG POR AGENTE: tracking_agent_config
-- ════════════════════════════════════════════════════════════
-- Limite personalizado por agente (opcional)
-- Se não existir, usa o global
CREATE TABLE tracking_agent_config (
    agent_id        VARCHAR(20) PRIMARY KEY REFERENCES login(id),
    speed_limit_kmh NUMERIC(5,1) NOT NULL DEFAULT 81 CHECK (speed_limit_kmh >= 1 AND speed_limit_kmh <= 300),
    updated_at      TIMESTAMP DEFAULT NOW(),
    updated_by      VARCHAR(50)
);
```

### 7.4 tracking_global_config (v3)

```sql
-- ════════════════════════════════════════════════════════════
-- CONFIG GLOBAL: tracking_global_config
-- ════════════════════════════════════════════════════════════
-- Chave-valor para configurações globais
CREATE TABLE tracking_global_config (
    key         VARCHAR(50) PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TIMESTAMP DEFAULT NOW()
);
-- Seed: ('default_speed_limit_kmh', '81.0')
```

### 7.5 Legado (ainda em uso)

```sql
-- fall_incidents: incidentes de queda (ainda ativo no admin)
CREATE TABLE fall_incidents (
    id            SERIAL PRIMARY KEY,
    agent_id      VARCHAR(20) NOT NULL REFERENCES login(id),
    latitude      DOUBLE PRECISION NOT NULL,
    longitude     DOUBLE PRECISION NOT NULL,
    status        VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'false_positive')),
    recorded_at   TIMESTAMP DEFAULT NOW(),
    confirmed_at  TIMESTAMP,
    notes         TEXT
);

-- agent_alerts_log: log de alertas (ainda ativo no admin)
CREATE TABLE agent_alerts_log (
    id            SERIAL PRIMARY KEY,
    agent_id      VARCHAR(20) NOT NULL REFERENCES login(id),
    alert_type    VARCHAR(50) NOT NULL,
    latitude      DOUBLE PRECISION,
    longitude     DOUBLE PRECISION,
    details       JSONB,
    recorded_at   TIMESTAMP DEFAULT NOW()
);
```

### 7.6 Heartbeat (na tabela `login`)

```sql
-- Colunas adicionadas pela migration 011_heartbeat.sql:
ALTER TABLE login ADD COLUMN last_heartbeat_at   TIMESTAMP;
ALTER TABLE login ADD COLUMN last_heartbeat_lat  DOUBLE PRECISION;
ALTER TABLE login ADD COLUMN last_heartbeat_lng  DOUBLE PRECISION;
```

---

## 8. Validação de Velocidade

### Fluxo de Decisão

```
Ponto chega com speed = 45.2
 │
 ├── Backend busca limite:
 │     getAgentSpeedLimit(agentId)
 │       → tracking_agent_config WHERE agent_id = 'AGT-042'
 │       → 70 km/h (se configurado)
 │       → fallback: getGlobalSpeedLimit() = 81.0 km/h
 │
 ├── Normalização da velocidade (heurística):
 │     Se speed > 50 AND speed < 150
 │       → Assume que veio em m/s, converte: speed * 3.6
 │     (45.2 não passa no filtro → mantido como km/h)
 │
 ├── speed (45.2) > speed_limit_applied (70)?
 │     → NÃO → is_speed_violation = FALSE
 │
 └── Ponto inserido em tracking_session_points normalmente
```

### Exemplo de violação

```
Ponto: speed = 92.0
Limite do agente: 81 km/h (default global)
92.0 > 81.0 → TRUE → is_speed_violation = TRUE, speed_limit_applied = 81.0
```

### Hierarquia de Limites

```
                                 ┌─────────────────────┐
                                 │ Limite por Agente   │ ← Maior prioridade
                                 │ tracking_agent_config│
                                 └──────────┬──────────┘
                                            │ se não existir
                                            ▼
                                 ┌─────────────────────┐
                                 │ Limite Global       │
                                 │ tracking_global_    │
                                 │ config              │
                                 └──────────┬──────────┘
                                            │ se não existir
                                            ▼
                                 ┌─────────────────────┐
                                 │ Hardcoded: 81 km/h  │ ← Fallback final
                                 └─────────────────────┘
```

---

## 9. Detecção de Quedas

### Máquina de Estados (4 fases)

```
        ┌─────────────────────────────────────────────────────────────┐
        │                   FALL DETECTION STATE MACHINE              │
        │                                                             │
        │   IDLE                                                     │
        │    │                                                       │
        │    │ magnitude < 3.0 m/s² por 80-600ms                     │
        │    ▼                                                       │
        │   FREEFALL_DETECTED                                        │
        │    │                                                       │
        │    │ pico de impacto > 45 m/s² (55 se ativo)               │
        │    │ + orientação mudou > 60°                              │
        │    ▼                                                       │
        │   IMPACT_DETECTED                                          │
        │    │                                                       │
        │    │ variância < 2 m/s² por 2.5s (parado no chão)          │
        │    ▼                                                       │
        │   MONITORING_STILLNESS → CONFIRMED 🚨                      │
        │                                                             │
        │   Qualquer timeout ou falha → volta para IDLE              │
        └─────────────────────────────────────────────────────────────┘
```

### Parâmetros da Detecção

| Fase | Sensor | Condição | Janela |
|------|--------|----------|--------|
| **Queda livre** | `accelerationIncludingGravity` | magnitude < 3 m/s² | 80–600ms contínuos |
| **Impacto** | `accelerationIncludingGravity` | pico > 45 m/s² (55 se ativo) | até 200ms após freefall |
| **Mudança orientação** | gravity vector (pitch/roll) | delta > 60° pré vs pós | comparação médias 500ms |
| **Imobilidade** | `accelerationIncludingGravity` | variância < 2 m/s² | 2.5s contínuos |

### Filtros Anti-Falso-Positivo

| Filtro | Mecanismo |
|--------|-----------|
| Freefall obrigatório | Elimina impactos sem queda livre prévia (sacudir, bater) |
| Duração mínima freefall | 80ms — elimina micro-variações de sensor |
| Orientation change | Elimina eventos sem mudança de posição corporal |
| Stillness prolongada | 2.5s imóvel — elimina atividade normal |
| Activity filter | Threshold de impacto sobe para 55 m/s² durante corrida/escada |
| Cooldown | 2 min entre detecções |

### Fluxo Pós-Detecção

```
QUEDA CONFIRMADA
 │
 ├── Tela vermelha fullscreen + vibração + som (countdown 15s)
 │     ┌─────────────┐
 │     │ 🆘 QUEDA!   │
 │     │ Cancelar em │
 │     │   12s       │
 │     │ [CANCELAR]  │
 │     └─────────────┘
 │
 ├── Cancelado (15s) → marca como falso positivo no IndexedDB
 │
 └── Não cancelado → salva no IndexedDB → sync para backend
       → Aparece em FallsTab no admin (status: pendente)
```

**Nota:** O algoritmo está atualmente **desabilitado** no código (`start()` é no-op). Toda a estrutura existe para ser ativada futuramente.

---

## 10. Heartbeat e Presença Online

### Fluxo

```
Sync bem-sucedido (200 OK)
 │
 └── sendHeartbeat(lat, lng)
       │
       └── POST /agent/tracking/heartbeat
             Body: { lat: -5.089, lng: -42.812 }
             │
             └── UPDATE login SET
                   last_heartbeat_at = NOW(),
                   last_heartbeat_lat = -5.089,
                   last_heartbeat_lng = -42.812
                 WHERE id = 'AGT-042'
```

### Regra de Online (no Admin Web)

```
last_heartbeat_at
 │
 ├── ≤ 5 minutos atrás ── 🟢 ONLINE
 │
 └── > 5 minutos atrás ── ⚪ OFFLINE
     (ou NULL)
```

---

## 11. Anti-Kill (Proteção 24/7)

### As 7 Camadas

```
 ┌────────────────────────────────────────────────────────────────┐
 │                       7 CAMADAS DE PROTEÇÃO                    │
 │                                                                │
 │  Força Stop                                                    │
 │     ↓                                                          │
 │  ┌──────────────────────────────────────────────────────────┐  │
 │  │ 1. START_STICKY ─── Android recria Service se morto     │  │
 │  │                   (imediato)                            │  │
 │  ├──────────────────────────────────────────────────────────┤  │
 │  │ 2. onTaskRemoved ─── Usuário limpou recentes            │  │
 │  │                   (imediato, só service, não activity)  │  │
 │  ├──────────────────────────────────────────────────────────┤  │
 │  │ 3. onDestroy ─── Auto-restart do service                │  │
 │  │               (imediato)                                │  │
 │  ├──────────────────────────────────────────────────────────┤  │
 │  │ 4. TrackingAlarmReceiver ─── setExactAndAllowWhileIdle  │  │
 │  │                         (1 min, funciona em Doze)       │  │
 │  ├──────────────────────────────────────────────────────────┤  │
 │  │ 5. TrackingWatchdogWorker ─── WorkManager               │  │
 │  │                         (1 min, auto-reschedule)        │  │
 │  ├──────────────────────────────────────────────────────────┤  │
 │  │ 6. BootReceiver ─── BOOT_COMPLETED + LOCKED_BOOT        │  │
 │  │                 (~3s após boot)                         │  │
 │  ├──────────────────────────────────────────────────────────┤  │
 │  │ 7. FcmRestartReceiver ─── Push 'restart_tracking'       │  │
 │  │                      (via Firebase)                     │  │
 │  └──────────────────────────────────────────────────────────┘  │
 │                                                                │
 │  ⚠️ NENHUMA camada protege contra Force Stop manual            │
 │  ⚠️ OEMs chinesas (Xiaomi, Huawei) podem bloquear BootReceiver │
 └────────────────────────────────────────────────────────────────┘
```

### Detalhamento das Camadas

| Camada | Disparo | Intervalo | Funciona em Doze |
|--------|---------|-----------|:----------------:|
| `START_STICKY` | Sistema recria Service | imediato | ✅ |
| `onTaskRemoved` | Usuário limpa recentes | imediato | ✅ |
| `onDestroy` | Service destruído | imediato | ✅ |
| `TrackingAlarmReceiver` | `setExactAndAllowWhileIdle` | 1 min | ✅ |
| `TrackingWatchdogWorker` | WorkManager | 1 min | ✅ (auto-reschedule) |
| `BootReceiver` | Boot do celular | ~3s após boot | N/A |
| `FcmRestartReceiver` | Push `restart_tracking` | push | ✅ |

### Eficácia por Cenário

| Cenário | Proteção | Eficácia |
|---------|----------|:--------:|
| App minimizado | Foreground Service + FusedLocationProviderClient | 100% |
| Tela desligada / bloqueada | GPS nativo independente do WebView | 100% |
| Removido dos recentes | onTaskRemoved + START_STICKY + AlarmManager + WorkManager | ~99% |
| Processo morto pelo SO | START_STICKY + AlarmManager + WorkManager | ~98% |
| Boot do celular | BootReceiver + `setAlarmClock` + alarme watchdog + WorkManager | ~99% |
| **Force Stop** | Nenhum app sobrevive. Solução: MDM | **0%** |
| OEM chinesa (Xiaomi, Huawei, Oppo) | AlarmManager + WorkManager + sync nativo sobrevivem | Parcial |

---

## 12. Matriz de Funcionalidades por Camada

| Funcionalidade | Nativo Java | JS/PWA (Web) | Backend | Admin Web |
|---|---|---|---|---|
| Coleta GPS (5s) | ✅ | ✅ | — | — |
| Filtro precisão (>30m rejeita) | ✅ | ✅ | — | — |
| Filtro distância (<5m ignora) | ✅ | ❌ | — | — |
| Buffer local (SQLite / IndexedDB) | ✅ | ✅ | — | — |
| Sync automático (30s, batch 50) | ✅ | ✅ | — | — |
| Validação de velocidade oficial | ⚠️ só notif local | ⚠️ só notif local | ✅ | — |
| Proximidade riscos (50m, cooldown 20min) | ✅ | ✅ | — | — |
| Notificações nativas de alerta | ✅ | ❌ | — | — |
| Heartbeat de presença | ✅ | ✅ | ✅ | ✅ |
| Cleanup automático (>7 dias) | ✅ | ✅ | — | — |
| Anti-kill (7 camadas) | ✅ | ❌ | — | — |
| Detecção de quedas | ❌ | ⏸️ (desativado) | — | — |
| Mapa agentes online/offline | — | — | ✅ | ✅ (LiveTab) |
| Histórico de trajeto | — | — | ✅ | ✅ (HistoryTab) |
| Infrações de velocidade | — | — | ✅ | ✅ (SpeedTab) |
| Gerenciar incidentes de queda | — | — | ✅ | ✅ (FallsTab) |
| Configuração de limites | — | ✅ (pelo agente) | ✅ | ✅ (SettingsTab) |
| Excluir infração (COMPANY_ADMIN) | — | — | ✅ | ✅ (SpeedTab) |

---

## 13. Referência de Endpoints

### Agente (Mobile → Backend)

| Método | Rota | Corpo / Params | Resposta | Descrição |
|--------|------|---------------|----------|-----------|
| **POST** | `/agent/tracking/sync-unified` | `{ points: [{ id, lat, lng, speed, accuracy, batteryLevel, isCharging, networkType, gpsEnabled, deviceModel, devicePlatform, osVersion, timestamp }] }` | `{ success, synced, violations, speedLimitApplied }` | Sync principal (v3) |
| **GET** | `/agent/tracking/config` | — | `{ speedLimit, globalSpeedLimit }` | Agente consulta seu limite |
| **PUT** | `/agent/tracking/config` | `{ speedLimitKmh: 70 }` | `{ success }` | Agente altera próprio limite |
| **POST** | `/agent/tracking/heartbeat` | `{ lat: -5.0, lng: -42.0 }` | `{ success }` | Presença online |

### Admin (Backend → Admin Web)

| Método | Rota | Params / Body | Descrição | Aba |
|--------|------|---------------|-----------|:---:|
| **GET** | `/admin/tracking/agents` | — | Todos agentes com última posição | LIVE |
| **GET** | `/admin/tracking/agents-v2` | — | Heartbeat (online/offline) | LIVE |
| **GET** | `/admin/tracking/agent/:id/trail` | `?from=&to=` | Pontos históricos do trajeto | HISTORY |
| **GET** | `/admin/tracking/agent/:id/trail-extended` | `?from=&to=` | Pontos + paradas detectadas (`{ points, stops }`) | HISTORY |
| **GET** | `/admin/tracking/agent/:id/alerts` | `?from=&to=` | Alertas de proximidade recebidos pelo agente na janela (`agent_proximity_alerts`) | HISTORY |
| **GET** | `/admin/tracking/speed_violations` | `?agent_id=&from=&to=` | Infrações de velocidade | SPEED |
| **DELETE** | `/admin/tracking/speed_violations/:id` | — | Excluir infração (só COMPANY_ADMIN) | SPEED |
| **GET** | `/admin/tracking/global-config` | — | Configuração global | SETTINGS |
| **PUT** | `/admin/tracking/global-config` | `{ key, value }` | Atualizar config global | SETTINGS |
| **GET** | `/admin/tracking/agent-config/:id` | — | Limite de velocidade por agente | — |
| **PUT** | `/admin/tracking/agent-config/:id` | `{ speedLimitKmh }` | Atualizar limite do agente | — |


### Removidos

| Método | Rota | Situação |
|--------|------|:--------:|
| **POST** | `/agent/tracking/sync` | ❌ Removido — usar sync-unified |
| **POST** | `/agent/tracking/sync-v2` | ❌ Removido — usar sync-unified |

---

## 14. Glossário

| Termo | Significado |
|-------|-------------|
| **v3 / Unified** | Arquitetura atual onde cada ponto GPS carrega tudo (localização + status do dispositivo) e a violação é marcada no backend |
| **tracking_session_points** | Tabela unificada que substitui `tracking_points` + `speed_violations` |
| **Heartbeat** | Sinal leve de presença (lat/lng) enviado após cada sync bem-sucedido. Define online/offline |
| **FusedLocationProviderClient** | API do Google Play Services que funde GPS + ERB + Wi-Fi para localização rápida e precisa |
| **START_STICKY** | Flag Android que faz o sistema recriar o Service automaticamente se ele for morto |
| **Doze Mode** | Modo de economia de bateria do Android que restringe background. `setExactAndAllowWhileIdle` fura esse bloqueio |
| **is_speed_violation** | Flag booleana em `tracking_session_points` que o backend seta como `true` quando `speed > speed_limit_applied` |
| **speed_limit_applied** | Qual limite de velocidade foi usado na validação (por agente ou global) no momento da inserção |
| **Security Reports** | Alertas de segurança georreferenciados. O nativo verifica proximidade a cada tick de GPS (50m, cooldown 20min) |
| **Foreground Service** | Serviço Android com notificação persistente que tem prioridade máxima para não ser morto pelo sistema |
| **WorkManager** | API Android para tarefas em background garantidas, mesmo após reboot ou app fechado |
| **Leaflet** | Biblioteca de mapas open-source usada no admin web para renderizar mapas e marcadores |
| **COMPANY_ADMIN** | Role de administrador da empresa com permissão para excluir infrações de velocidade |
| **isNative()** | Função que detecta se o app roda como APK nativo (vs PWA no navegador) |

---

> **Documento gerado em Junho/2026 — Arquitetura v3 (Unified Tracking)**
>
> Para documentação técnica detalhada dos componentes:
> - Backend: `back/docs/TRACKING.md`
> - Admin Web: `front/docs/ADMIN_SPEC.md`
> - Mobile Nativo: `mobile/docs/TRACKING.md` e `mobile/docs/ARCHITECTURE.md`
