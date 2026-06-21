# Crash Detection — Backend

Endpoint e lógica de persistência para接收 e processar incidentes de queda detectados pelo app nativo Android.

---

## 1. Arquitetura

```
[App Android]
    │
    │  TrackingForegroundService.saveLocation() — a cada GPS
    │  FallDetector.onAccidentDetected() — quando confirmAccident()
    │
    │  syncPendingPoints() — a cada 30s + no acidente detectado
    └──────────────────────────────────────────────────────────────────┐
                                                                         │
POST /agent/tracking/sync-unified                                        │
{ "points": [...], "crashIncidents": [...] }                             │
    │                                                                     │
    ▼                                                                     │
[app.js] ──→ /agent/tracking/sync-unified                                │
    │                                                                     │
    ▼                                                                     │
[tracking.js (routes)]                                                    │
    │  verifyTelegramToken()                                              │
    │  agent_id = login.id via Telegram init data                         │
    ▼                                                                     │
[functions/database/tracking.js]                                          │
    │                                                                     │
    ├── insertUnifiedPointBatch() — tracking_points                      │
    ├── insertSpeedViolationBatch() — speed_violations                   │
    └── insertFallIncident() — fall_incidents ← NOVO                     │
                                                                         │
                                                                         │
[Admin] ── GET /admin/crash-detection ── adminCrashDetection.js          │
    │                                                                     │
    ├── GET /                  — lista paginada com filtros              │
    ├── GET /stats             — estatísticas                             │
    ├── GET /:id               — detalhe                                  │
    └── PUT /:id/status        — atualizar (confirmed/false_positive)    │
```

---

## 2. Banco de Dados

### 2.1 Tabela `fall_incidents`

Criada pela migration `025_crash_detection.sql`:

```sql
CREATE TABLE fall_incidents (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id                VARCHAR(50) NOT NULL REFERENCES login(id) ON DELETE CASCADE,

    -- Coordenadas GPS no momento do acidente
    latitude                DECIMAL(10,7),
    longitude               DECIMAL(10,7),

    -- Status do incidente
    status                  VARCHAR(20) DEFAULT 'pending' CHECK (
        status IN ('pending', 'confirmed', 'false_positive')
    ),
    notes                   TEXT,

    -- Timestamps
    recorded_at             TIMESTAMP DEFAULT NOW(),
    updated_at              TIMESTAMP DEFAULT NOW(),
    resolved_at             TIMESTAMP,

    -- ══════════════════════════════════════════════
    -- Colunas do sensor (dados crus do CrashDetector)
    -- ══════════════════════════════════════════════

    -- Acelerômetro
    free_fall_gravity       DECIMAL(6,3),    -- gravidade medida na free-fall (m/s²)
    impact_gravity          DECIMAL(6,3),    -- pico de G no impacto (m/s²)

    -- Giroscópio
    gyro_rotation_x          DECIMAL(8,4),   -- rad/s
    gyro_rotation_y          DECIMAL(8,4),
    gyro_rotation_z          DECIMAL(8,4),
    gyro_rotation_total      DECIMAL(8,4),   -- magnitude total (rad/s)

    -- GPS no momento do acidente
    gps_speed_kmh            DECIMAL(8,2),
    gps_accuracy_m           DECIMAL(8,2),

    -- Fases completadas pelo detector
    phase_free_fall          BOOLEAN DEFAULT FALSE,
    phase_impact             BOOLEAN DEFAULT FALSE,
    phase_rotation           BOOLEAN DEFAULT FALSE,
    phase_immobility         BOOLEAN DEFAULT FALSE,

    -- Validação GPS
    speed_drop_confirmed     BOOLEAN DEFAULT FALSE,  -- velocidade GPS caiu na hora do impacto

    -- Timing
    free_fall_duration_ms    INTEGER,
    impact_latency_ms        INTEGER,

    -- Cancelamento pelo usuário
    user_cancelled           BOOLEAN DEFAULT FALSE,
    user_cancelled_at        TIMESTAMP,

    -- Device info
    device_model             VARCHAR(100),
    os_version               VARCHAR(20),
    battery_level            INTEGER,
    is_charging              BOOLEAN,
    network_type             VARCHAR(20),

    -- Dados crus do sensor (JSONB)
    sensor_raw               JSONB
);

CREATE INDEX idx_fall_incidents_agent_id  ON fall_incidents(agent_id);
CREATE INDEX idx_fall_incidents_status    ON fall_incidents(status);
CREATE INDEX idx_fall_incidents_recorded ON fall_incidents(recorded_at DESC);
CREATE INDEX idx_fall_incidents_speed_drop ON fall_incidents(speed_drop_confirmed) WHERE speed_drop_confirmed = TRUE;
```

### 2.2 Coluna `sensor_raw` (JSONB)

Armazena o payload completo do sensor para auditoria e reprocessamento:

```json
{
  "accelerometer": { "x": 0.3, "y": 0.5, "z": 9.2 },
  "gyroscope": { "x": 1.2, "y": -0.8, "z": 3.1, "total": 3.45 },
  "location": { "lat": -5.123, "lng": -42.456, "accuracy": 5.0 },
  "device": { "batteryLevel": 78, "isCharging": false, "networkType": "WIFI" },
  "phases": { "free_fall": true, "impact": true, "rotation": true, "immobility": true },
  "timing": { "freeFallDurationMs": 320, "impactLatencyMs": 180 }
}
```

---

## 3. Schemas Zod (tracking.js)

### 3.1 crashIncidentSyncSchema

```javascript
const crashIncidentSyncSchema = z.object({
    id: z.string().uuid(),
    lat: z.number().min(-90).max(90).optional().nullable(),
    lng: z.number().min(-180).max(180).optional().nullable(),
    timestamp: z.number().int().positive(),
    // Acelerômetro
    freeFallGravity: z.number().min(0).max(100).optional().nullable(),
    impactGravity: z.number().min(0).max(100).optional().nullable(),
    // Giroscópio
    gyroRotationX: z.number().optional().nullable(),
    gyroRotationY: z.number().optional().nullable(),
    gyroRotationZ: z.number().optional().nullable(),
    gyroRotationTotal: z.number().optional().nullable(),
    // GPS
    gpsSpeedKmh: z.number().optional().nullable(),
    gpsAccuracyM: z.number().optional().nullable(),
    // Fases
    phaseFreeFall: z.boolean().default(false),
    phaseImpact: z.boolean().default(false),
    phaseRotation: z.boolean().default(false),
    phaseImmobility: z.boolean().default(false),
    // Validação
    speedDropConfirmed: z.boolean().default(false),
    // Timing
    freeFallDurationMs: z.number().int().optional().nullable(),
    impactLatencyMs: z.number().int().optional().nullable(),
    // Cancelamento
    userCancelled: z.boolean().default(false),
    userCancelledAt: z.number().int().positive().optional().nullable(),
    // Device
    deviceModel: z.string().optional().nullable(),
    osVersion: z.string().optional().nullable(),
    batteryLevel: z.number().int().min(0).max(100).optional().nullable(),
    isCharging: z.boolean().optional().nullable(),
    networkType: z.string().optional().nullable(),
    sensorRaw: z.record(z.any()).optional().nullable(),
});
```

---

## 4. Funções de Database (functions/database/tracking.js)

### 4.1 insertFallIncident(agentId, incident)

```javascript
async function insertFallIncident(agentId, incident) {
    const validated = crashIncidentSyncSchema.parse({ ...incident, agent_id: agentId });
    // INSERT com todos os campos do schema
    // RETURNS a row inserida
}
```

### 4.2 getFallIncidents(filters)

```javascript
async function getFallIncidents(filters = {}) {
    // filters: { status, agentId, dateFrom, dateTo, speedDropConfirmed }
    // JOIN com login + colaboradores para agent_nome, agent_estado, agent_regional
    // ORDER BY recorded_at DESC LIMIT 200
    // Retorna array de fall_incidents com dados do agente
}
```

### 4.3 updateFallIncidentStatus(id, status, notes)

```javascript
async function updateFallIncidentStatus(id, status, notes) {
    // Atualiza status (confirmed / false_positive) e notes
    // Define resolved_at = NOW() quando status muda para confirmed ou false_positive
    // Retorna a row atualizada
}
```

---

## 5. Rotas — Agente

### 5.1 POST /agent/tracking/sync-unified

Recebe tracking points e crash incidents no mesmo payload:

```javascript
// Body
{
    "points": [ /* tracking_points (já existente) */ ],
    "crashIncidents": [ /* crashIncidentSyncSchema */ ]
}

// Para cada crash incident:
// 1. validate crashIncidentSyncSchema
// 2. INSERT INTO fall_incidents ON CONFLICT (id) DO UPDATE (synced=true)
// 3. Retorna counts
```

### 5.2 PUT /agent/tracking/fall-incident/:id/cancel

Permite ao agente cancelar um incidente detectado (falso positivo):

```javascript
// Body
{ "cancelled": true }

// Atualiza:
// fall_incidents.user_cancelled = TRUE
// fall_incidents.user_cancelled_at = NOW()
// fall_incidents.status = 'false_positive'
```

---

## 6. Rotas — Admin

### 6.1 GET /admin/crash-detection

Lista paginada com filtros:

| Query Param | Tipo | Descrição |
|------------|------|-----------|
| `status` | string | `pending` \| `confirmed` \| `false_positive` |
| `agentId` | string | Filtrar por agente específico |
| `dateFrom` | ISO date | Data inicial |
| `dateTo` | ISO date | Data final |
| `speedDropConfirmed` | boolean | Apenas com speed drop validado |
| `search` | string | Busca textual (nome, ID, device model) |
| `page` | number | Página (default 1) |
| `limit` | number | Itens por página (max 200, default 50) |

```json
// Response 200
{
  "incidents": [
    {
      "id": "uuid",
      "agent_id": "123",
      "agent_nome": "João Silva",
      "agent_estado": "PI",
      "agent_regional": "Norte",
      "latitude": -5.1234567,
      "longitude": -42.1234567,
      "status": "pending",
      "recorded_at": "2026-06-20T14:30:00Z",
      "free_fall_gravity": 0.5,
      "impact_gravity": 34.3,
      "gyro_rotation_total": 3.45,
      "gps_speed_kmh": 45.0,
      "speed_drop_confirmed": true,
      "phase_free_fall": true,
      "phase_impact": true,
      "phase_rotation": true,
      "phase_immobility": true,
      "device_model": "M2102J20SS",
      "os_version": "12",
      "battery_level": 78,
      "is_charging": false,
      "network_type": "WIFI"
    }
  ],
  "total": 142,
  "page": 1,
  "limit": 50
}
```

### 6.2 GET /admin/crash-detection/stats

Estatísticas resumidas:

```json
// Response 200
{
  "total": 142,
  "confirmed": 89,
  "falsePositive": 23,
  "pending": 30,
  "withSpeedDrop": 67
}
```

### 6.3 GET /admin/crash-detection/:id

Detalhe completo de um incidente (inclui agent_gestor):

```json
// Response 200
{
  "id": "uuid",
  "agent_id": "123",
  "agent_nome": "João Silva",
  "agent_estado": "PI",
  "agent_regional": "Norte",
  "agent_seccional": "Teresina",
  "agent_gestor": "Maria Oliveira",
  "latitude": -5.1234567,
  "longitude": -42.1234567,
  "status": "pending",
  "notes": null,
  "recorded_at": "2026-06-20T14:30:00Z",
  "free_fall_gravity": 0.5,
  "impact_gravity": 34.3,
  "gyro_rotation_x": 1.2,
  "gyro_rotation_y": -0.8,
  "gyro_rotation_z": 3.1,
  "gyro_rotation_total": 3.45,
  "gps_speed_kmh": 45.0,
  "gps_accuracy_m": 5.0,
  "phase_free_fall": true,
  "phase_impact": true,
  "phase_rotation": true,
  "phase_immobility": true,
  "speed_drop_confirmed": true,
  "free_fall_duration_ms": 320,
  "impact_latency_ms": 180,
  "user_cancelled": false,
  "device_model": "M2102J20SS",
  "os_version": "12",
  "battery_level": 78,
  "is_charging": false,
  "network_type": "WIFI",
  "sensor_raw": { ... }
}
```

### 6.4 PUT /admin/crash-detection/:id/status

Atualizar status de um incidente:

```json
// Request body
{
  "status": "confirmed" | "false_positive" | "pending",
  "notes": "Observação opcional do admin"
}

// Response 200
{ "id": "uuid", "status": "confirmed", "updated_at": "2026-06-20T15:00:00Z", "resolved_at": "2026-06-20T15:00:00Z" }

// Response 400 — status inválido
{ "error": "Status inválido. Use: confirmed, false_positive ou pending" }
```

### 6.5 Auth

Todas as rotas admin requerem:
1. `verifyToken()` — JWT válido
2. `verifyModule('security_reports')` — módulo de segurança habilitado para o admin

---

## 7. Algoritmo de Detecção (Referência)

O algoritmo de 4 fases roda 100% no device Android. O backend apenas persiste os dados. Para referência:

| Fase | Condição | Janela | Falso positivo comum |
|------|----------|--------|----------------------|
| `FREE_FALL` | `aTotal < 0.3g` | — | Celular solto no ar |
| `IMPACT` | `aTotal > 2.5g` (≤ 5g) | 500ms após FF | Batida leve sem free-fall |
| `ROTATION` | `gyroTotal ≥ 2.5 rad/s` | 1000ms após IMPACT | — |
| `IMMOBILITY` | Nenhum movimento | 5000ms | Pessoa levanta após queda |

**Validação GPS**: `speed_drop_confirmed = true` indica que a velocidade GPS caiu abruptamente na hora do impacto — forte indicativo de acidente real vs. buraco na rua.

---

## 8. Fluxo de Dados Completo

```
[Celular com Gedai em Moto]

0:05 — Celular cai da mão do agente
       FallDetector: Phase.IDLE → FREE_FALL (aTotal=1.2 m/s²)

0:05.2 — Celular atinge o asfalto
       FallDetector: FREE_FALL → IMPACT (aTotal=34.3 m/s² ≈ 3.5g)
       impactLatencyMs=180ms, freeFallDurationMs=320ms
       updateGpsData() → speedKmh=45.0

0:05.3 — Celular rola no chão
       FallDetector: IMPACT → ROTATION (gyroTotal=3.45 rad/s)

0:05.8 — Celular para de se mover
       FallDetector: ROTATION → IMMOBILITY

0:06.3 — Celular continua parado (5s de immobility)
       FallDetector: IMMOBILITY → DETECTED
       confirmAccident()

       ├→ INSERT crash_incidents (synced=0)
       ├→ emitCrashDetectedStatic() → JS
       ├→ SharedPreferences: pending_deep_link="/accidents/new?id=..."
       ├→ MainActivity traz app ao foreground
       └→ syncPendingPoints()

0:06.5 — syncPendingPoints()
       POST /agent/tracking/sync-unified
       Body: { points: [...], crashIncidents: [{ id, ... }] }

       Backend:
       ├→ INSERT INTO fall_incidents (status='pending')
       ├→ Response: { synced: 1, crashIncidents: [{ id, status: 'pending' }] }
       └→ onSuccess: UPDATE crash_incidents SET synced=1 WHERE id='...'

0:06.6 — App abre tela de acidente (/accidents/new?id=UUID)
       Agente confirma ou cancela o acidente

Later — Admin visualiza em /admin/crash-detection
       Admin marca como confirmed/false_positive
```
