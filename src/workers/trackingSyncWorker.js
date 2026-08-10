/**
 * trackingSyncWorker.js
 *
 * Worker responsável por processar a tabela de staging do tracking de forma assíncrona.
 */

const { cenos_pool } = require('../db');
const {
    claimPendingBatch,
    markBatchDone,
    markBatchFailed,
    cleanOldStaging,
} = require('../functions/database/trackingStaging');
const { getAgentSpeedLimit } = require('../functions/database/trackingUnified');
const { updateHeartbeat } = require('../functions/database/heartbeat');
const { unifiedPointSchema } = require('../db/schemas/tracking');
const { point: turfPoint, polygon: turfPolygon } = require('@turf/helpers');
const booleanPointInPolygon = require('@turf/boolean-point-in-polygon').default;

const BATCH_SIZE = 5000;
const POLL_INTERVAL_MS = 5000;
const CLEAN_INTERVAL_MS = 60000; // 1 minuto para limpeza de logs antigos do staging

let isRunning = false;
let lastCleanAt = 0;
const speedLimitCache = {};

/**
 * Normaliza um ponto bruto do staging para o formato da tabela final.
 */
function normalizePoint(agentId, raw, speedLimit) {
    const speedLimitNum = Number(speedLimit) || 81;

    // Backwards compatibility for legacy offline payloads from mobile app
    if (raw.lat === undefined && raw.latitude !== undefined) raw.lat = raw.latitude;
    if (raw.lng === undefined && raw.longitude !== undefined) raw.lng = raw.longitude;
    if (raw.timestamp === undefined) {
        if (raw.recorded_at) raw.timestamp = new Date(raw.recorded_at).getTime();
        else raw.timestamp = Date.now();
    }
    if (raw.batteryLevel === undefined && raw.battery_level !== undefined) raw.batteryLevel = raw.battery_level;
    if (raw.isCharging === undefined && raw.is_charging !== undefined) raw.isCharging = raw.is_charging;
    if (raw.networkType === undefined && raw.network_type !== undefined) raw.networkType = raw.network_type;
    if (raw.gpsEnabled === undefined && raw.gps_enabled !== undefined) raw.gpsEnabled = raw.gps_enabled;
    if (raw.deviceModel === undefined && raw.device_model !== undefined) raw.deviceModel = raw.device_model;
    if (raw.devicePlatform === undefined && raw.device_platform !== undefined) raw.devicePlatform = raw.device_platform;
    if (raw.osVersion === undefined && raw.os_version !== undefined) raw.osVersion = raw.os_version;

    const point = unifiedPointSchema.parse(raw);

    // Normalizar battery
    let batteryLevel = point.batteryLevel ?? null;
    if (batteryLevel != null && batteryLevel <= 1) {
        batteryLevel = Math.round(batteryLevel * 100);
    }

    // Normalizar velocidade: GPS e Web enviam em m/s (metros por segundo) -> converter para km/h (* 3.6)
    let speedKmh = point.speed ?? null;
    if (speedKmh != null && speedKmh > 0) {
        speedKmh = Math.round(speedKmh * 3.6);
    }

    const isViolation = speedKmh != null && speedKmh > speedLimitNum;

    return {
        agentId,
        lat: point.lat,
        lng: point.lng,
        speed: speedKmh,
        accuracy: point.accuracy ?? null,
        batteryLevel,
        isCharging: point.isCharging ?? false,
        networkType: point.networkType ?? null,
        gpsEnabled: point.gpsEnabled ?? true,
        deviceModel: point.deviceModel ?? null,
        devicePlatform: point.devicePlatform ?? null,
        osVersion: point.osVersion ?? null,
        timestamp: point.timestamp ? (isNaN(new Date(point.timestamp).getTime()) ? new Date().toISOString() : new Date(point.timestamp).toISOString()) : new Date().toISOString(),
        speedLimitApplied: speedLimitNum, // isso pode ser sobrescrito pelo geofence
        isViolation,
        // Dead Reckoning
        isEstimated: point.isEstimated ?? false,
        estimatedFromLat: point.estimatedFromLat ?? null,
        estimatedFromLng: point.estimatedFromLng ?? null,
        deadReckonDrift: point.deadReckonDrift ?? null,
        deltaTSeconds: point.deltaTSeconds ?? null,
    };
}

/**
 * Calcula a distância em metros entre duas coordenadas.
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
    if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 0;
    const R = 6371e3; // Raio da Terra em metros
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Multi-row INSERT na tabela final tracking_session_points.
 */
async function batchInsertPoints(points) {
    const values = [];
    const params = [];
    let paramIdx = 1;

    for (const p of points) {
        values.push(`($${paramIdx},$${paramIdx+1},$${paramIdx+2},$${paramIdx+3},$${paramIdx+4},$${paramIdx+5},$${paramIdx+6},$${paramIdx+7},$${paramIdx+8},$${paramIdx+9},$${paramIdx+10},$${paramIdx+11},$${paramIdx+12},$${paramIdx+13},$${paramIdx+14},$${paramIdx+15},$${paramIdx+16},$${paramIdx+17},$${paramIdx+18})`);
        params.push(
            p.agentId, p.lat, p.lng, p.speed, p.accuracy,
            p.batteryLevel, p.isCharging, p.networkType, p.gpsEnabled,
            p.deviceModel, p.devicePlatform, p.osVersion,
            p.timestamp, p.speedLimitApplied, p.isViolation,
            p.isEstimated, p.estimatedFromLat, p.estimatedFromLng, p.deadReckonDrift
        );
        paramIdx += 19;
    }

    await cenos_pool.query(`
        INSERT INTO tracking_session_points
            (agent_id, latitude, longitude, speed, accuracy,
             battery_level, is_charging, network_type, gps_enabled,
             device_model, device_platform, os_version, recorded_at,
             speed_limit_applied, is_speed_violation,
             is_estimated, estimated_from_lat, estimated_from_lng, dead_reckon_drift)
        VALUES ${values.join(', ')}
        ON CONFLICT (agent_id, recorded_at) DO NOTHING
    `, params);
}

/**
 * Speed limit cache com TTL simples em memória.
 */
async function getAgentSpeedLimitCached(agentId) {
    const cached = speedLimitCache[agentId];
    if (cached && (Date.now() - cached.timestamp < 30000)) {
        return cached.limit;
    }

    const limit = await getAgentSpeedLimit(agentId);
    speedLimitCache[agentId] = {
        limit,
        timestamp: Date.now()
    };
    return limit;
}

/**
 * Geofences cache com TTL em memória.
 */
let geofencesCache = { timestamp: 0, fences: [] };

async function getActiveGeofences() {
    if (Date.now() - geofencesCache.timestamp < 60000) {
        return geofencesCache.fences;
    }
    const { rows } = await cenos_pool.query(`
        SELECT id, name, type, estado, geometry, speed_limit
        FROM tracking_fences
        WHERE is_active = true
    `);
    
    // Preparar os poligonos turf para nao reprocessar
    const fences = rows.map(f => {
        let polygon = null;
        if (f.geometry && Array.isArray(f.geometry) && f.geometry.length > 2) {
            try {
                const coords = f.geometry.map(pt => [pt.lng, pt.lat]);
                // Close the polygon if not closed
                if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
                    coords.push([...coords[0]]);
                }
                polygon = turfPolygon([coords]);
            } catch (err) {
                console.error('Erro ao montar poligono turf:', err);
            }
        }
        return { ...f, polygon };
    });

    geofencesCache = { timestamp: Date.now(), fences };
    return fences;
}

/**
 * Agent State cache
 */
const agentStateCache = {};
async function getAgentStateCached(agentId) {
    const cached = agentStateCache[agentId];
    if (cached && (Date.now() - cached.timestamp < 300000)) { // 5 mins cache
        return cached.estado;
    }
    // Busca do banco
    const { rows } = await cenos_pool.query(`SELECT estado FROM colaboradores WHERE lower("ID") = $1 LIMIT 1`, [agentId.toLowerCase()]);
    const estado = rows.length > 0 ? rows[0].estado : null;
    agentStateCache[agentId] = { estado, timestamp: Date.now() };
    return estado;
}

/**
 * Processa um lote de pontos do staging.
 */
async function processBatch(rows) {
    if (rows.length === 0) return { processed: 0, inserted: 0 };

    const agentPoints = {};
    const stagingIds = rows.map(r => r.id);

    for (const row of rows) {
        const agentId = row.agent_id;
        if (!agentPoints[agentId]) {
            agentPoints[agentId] = [];
        }
        agentPoints[agentId].push(row.payload);
    }

    let totalInserted = 0;

    const allFences = await getActiveGeofences();

    for (const [agentId, points] of Object.entries(agentPoints)) {
        const speedLimit = await getAgentSpeedLimitCached(agentId);
        const agentState = await getAgentStateCached(agentId);
        
        // Filtrar cercas do estado deste agente
        const agentFences = agentState ? allFences.filter(f => f.estado === agentState && f.polygon != null) : [];

        // 1. Ordenar pontos por tempo para garantir análise cronológica
        points.sort((a, b) => new Date(a.timestamp || a.recorded_at).getTime() - new Date(b.timestamp || b.recorded_at).getTime());

        const normalized = [];
        let lastValidPoint = null;

        for (const p of points) {
            const pt = normalizePoint(agentId, p, speedLimit);
            
            // FILTRO 1: Peneira de Precisão (Spider Webbing)
            if (pt.accuracy != null && pt.accuracy > 50) {
                continue; // Descarta o ponto se a precisão for terrível
            }

            // FILTRO 2: Salto Anômalo (Velocidade Impossível)
            if (lastValidPoint && pt.lat != null && pt.lng != null && lastValidPoint.lat != null && lastValidPoint.lng != null) {
                const distMeters = haversineDistance(lastValidPoint.lat, lastValidPoint.lng, pt.lat, pt.lng);
                const timeDiffSeconds = (new Date(pt.timestamp).getTime() - new Date(lastValidPoint.timestamp).getTime()) / 1000;
                
                if (timeDiffSeconds > 0) {
                    const speedKmh = (distMeters / timeDiffSeconds) * 3.6;
                    // Salto > 150 km/h é anomalia física e deve ser droppado
                    if (speedKmh > 150) {
                        continue;
                    }
                }
            }

            // Verificação de Geofencing
            if (agentFences.length > 0 && pt.lat != null && pt.lng != null) {
                const turfPt = turfPoint([pt.lng, pt.lat]);
                for (const fence of agentFences) {
                    if (booleanPointInPolygon(turfPt, fence.polygon)) {
                        if (fence.type === 'speed' && fence.speed_limit != null) {
                            pt.speedLimitApplied = fence.speed_limit;
                            pt.isViolation = pt.speed != null && pt.speed > fence.speed_limit;
                        }
                        // Pode expandir para min_speed, enter, exit...
                        break; // Aplicou a primeira cerca encontrada (ordem não garantida)
                    }
                }
            }
            
            normalized.push(pt);
            lastValidPoint = pt;
        }

        if (normalized.length > 0) {
            await batchInsertPoints(normalized);
            totalInserted += normalized.length;

            // Atualiza heartbeat assincronamente com a data/hora do dispositivo do último ponto do lote
            const last = normalized[normalized.length - 1];
            await updateHeartbeat(agentId, last.lat, last.lng, last.timestamp);
        }
    }

    // Sucesso completo: marca no staging
    await markBatchDone(stagingIds);

    return { processed: rows.length, inserted: totalInserted };
}

/**
 * Loop principal do worker.
 */
async function workerLoop() {
    if (isRunning) return;
    isRunning = true;

    let claimedIds = [];
    try {
        const rows = await claimPendingBatch(BATCH_SIZE);
        if (rows.length > 0) {
            claimedIds = rows.map(r => r.id);
            const result = await processBatch(rows);
            console.log(`[TRACKING_WORKER] Processados ${result.processed} do staging (${result.inserted} finais inseridos).`);
        }

        // Limpeza periódica do staging (registros done/failed > 24h)
        const now = Date.now();
        if (now - lastCleanAt > CLEAN_INTERVAL_MS) {
            await cleanOldStaging();
            lastCleanAt = now;
        }
    } catch (err) {
        console.error('[TRACKING_WORKER] Erro crítico no ciclo do worker:', err);
        // Em caso de erro, tenta marcar o lote reivindicado como falho para reprocessamento posterior
        if (claimedIds.length > 0) {
            try {
                await markBatchFailed(claimedIds, err);
            } catch (failErr) {
                console.error('[TRACKING_WORKER] Falha ao marcar lote como erro:', failErr);
            }
        }
    } finally {
        isRunning = false;
    }
}

/**
 * Inicia o polling do worker.
 */
function start() {
    console.log('[TRACKING_WORKER] Inicializado. Polling a cada', POLL_INTERVAL_MS / 1000, 'segundos.');
    setInterval(workerLoop, POLL_INTERVAL_MS);
    // Executa imediatamente o primeiro ciclo
    workerLoop();
}

module.exports = { start };
