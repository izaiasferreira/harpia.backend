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
const { getAgentSpeedLimit, getSpeedEligibleConfig } = require('../functions/database/trackingUnified');
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
    const parsed = unifiedPointSchema.safeParse(raw);
    if (!parsed.success) {
        const detail = parsed.error.issues.map(i => `${i.path.join('.') || 'root'}: ${i.message}`).join('; ');
        console.warn(`[TRACKING_WORKER] Ponto inválido ignorado (agent=${agentId}) — ${detail}`, JSON.stringify(raw).slice(0, 400));
        return null;
    }
    const point = parsed.data;

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
 * Agent Profile cache
 */
const agentProfileCache = {};
async function getAgentProfileCached(agentId) {
    const cached = agentProfileCache[agentId];
    if (cached && (Date.now() - cached.timestamp < 300000)) { // 5 mins cache
        return cached.profile;
    }
    // Busca do banco
    const { rows } = await cenos_pool.query(`SELECT estado, "Cargo" as cargo, regional, seccional FROM colaboradores WHERE lower("ID") = $1 LIMIT 1`, [agentId.toLowerCase()]);
    const profile = rows.length > 0 ? rows[0] : null;
    agentProfileCache[agentId] = { profile, timestamp: Date.now() };
    return profile;
}

let eligibleConfigCache = { timestamp: 0, config: null };
async function getEligibleConfigCached() {
    if (Date.now() - eligibleConfigCache.timestamp < 60000 && eligibleConfigCache.config) {
        return eligibleConfigCache.config;
    }
    const config = await getSpeedEligibleConfig();
    eligibleConfigCache = { config, timestamp: Date.now() };
    return config;
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

    const uniqueAgentIds = Object.keys(agentPoints);
    if (uniqueAgentIds.length > 0) {
        const params = uniqueAgentIds;
        const placeholders = params.map((_, i) => `lower($${i + 1})`).join(',');
        const { rows: validAgentsRows } = await cenos_pool.query(
            `SELECT id FROM login WHERE lower(id) IN (${placeholders})`,
            params
        );
        const validAgentIds = new Set(validAgentsRows.map(r => r.id.toLowerCase()));

        for (const agentId of uniqueAgentIds) {
            if (!validAgentIds.has(agentId.toLowerCase())) {
                console.warn(`[TRACKING_WORKER] Descartando pontos do staging para agente inexistente: ${agentId}`);
                delete agentPoints[agentId];
            }
        }
    }

    let totalInserted = 0;

    const allFences = await getActiveGeofences();
    const eligibleConfig = await getEligibleConfigCached();

    for (const [agentId, points] of Object.entries(agentPoints)) {
        const speedLimit = await getAgentSpeedLimitCached(agentId);
        const agentProfile = await getAgentProfileCached(agentId);
        const agentState = agentProfile?.estado || null;
        
        // Filtrar cercas do estado deste agente
        const agentFences = agentState ? allFences.filter(f => f.estado === agentState && f.polygon != null) : [];

        // Check speed eligibility
        let isEligibleForSpeed = true;
        if (agentProfile) {
            const matchCargo = eligibleConfig.cargos.length === 0 || eligibleConfig.cargos.some(c => c.toUpperCase() === (agentProfile.cargo || '').toUpperCase());
            const matchEstado = eligibleConfig.estados.length === 0 || eligibleConfig.estados.some(e => e.toUpperCase() === (agentProfile.estado || '').toUpperCase());
            const matchRegional = eligibleConfig.regionais.length === 0 || eligibleConfig.regionais.some(r => r.toUpperCase() === (agentProfile.regional || '').toUpperCase());
            const matchSeccional = eligibleConfig.seccionais.length === 0 || eligibleConfig.seccionais.some(s => s.toUpperCase() === (agentProfile.seccional || '').toUpperCase());
            
            // If any filter is defined but the agent doesn't match, they are not eligible
            isEligibleForSpeed = matchCargo && matchEstado && matchRegional && matchSeccional;
        }

        // 1. Ordenar pontos por tempo para garantir análise cronológica
        points.sort((a, b) => new Date(a.timestamp || a.recorded_at).getTime() - new Date(b.timestamp || b.recorded_at).getTime());

        const normalized = [];
        let lastValidPoint = null;

        for (const p of points) {
            const pt = normalizePoint(agentId, p, speedLimit);
            if (!pt) continue;

            if (!isEligibleForSpeed) {
                pt.isViolation = false;
            } // Ponto inválido: logado e descartado (não derruba o lote)
            
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
                // Geofence check can override speedLimitApplied and isViolation
                for (const fence of agentFences) {
                    if (fence.type === 'speed_limit' && fence.speed_limit != null) {
                        if (booleanPointInPolygon(turfPt, fence.polygon)) {
                            pt.speedLimitApplied = fence.speed_limit;
                            if (isEligibleForSpeed) {
                                pt.isViolation = pt.speed != null && pt.speed > pt.speedLimitApplied;
                            }
                            // Assume first matched fence overrides global (could prioritize by stricter limit if needed)
                            break;
                        }
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

module.exports = { start, normalizePoint };
