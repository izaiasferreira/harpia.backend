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
    const point = unifiedPointSchema.parse(raw);

    // Normalizar battery
    let batteryLevel = point.batteryLevel ?? null;
    if (batteryLevel != null && batteryLevel <= 1) {
        batteryLevel = Math.round(batteryLevel * 100);
    }

    // Normalizar velocidade
    let speedKmh = point.speed ?? null;
    if (speedKmh != null) {
        if (speedKmh > 50 && speedKmh < 150 && Number.isInteger(speedKmh)) {
            speedKmh = Math.round(speedKmh * 3.6);
        }
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
        timestamp: new Date(point.timestamp),
        speedLimitApplied: speedLimitNum,
        isViolation,
    };
}

/**
 * Multi-row INSERT na tabela final tracking_session_points.
 */
async function batchInsertPoints(points) {
    const values = [];
    const params = [];
    let paramIdx = 1;

    for (const p of points) {
        values.push(`($${paramIdx},$${paramIdx+1},$${paramIdx+2},$${paramIdx+3},$${paramIdx+4},$${paramIdx+5},$${paramIdx+6},$${paramIdx+7},$${paramIdx+8},$${paramIdx+9},$${paramIdx+10},$${paramIdx+11},$${paramIdx+12},$${paramIdx+13},$${paramIdx+14})`);
        params.push(
            p.agentId, p.lat, p.lng, p.speed, p.accuracy,
            p.batteryLevel, p.isCharging, p.networkType, p.gpsEnabled,
            p.deviceModel, p.devicePlatform, p.osVersion,
            p.timestamp, p.speedLimitApplied, p.isViolation
        );
        paramIdx += 15;
    }

    await cenos_pool.query(`
        INSERT INTO tracking_session_points
            (agent_id, latitude, longitude, speed, accuracy,
             battery_level, is_charging, network_type, gps_enabled,
             device_model, device_platform, os_version, recorded_at,
             speed_limit_applied, is_speed_violation)
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

    for (const [agentId, points] of Object.entries(agentPoints)) {
        const speedLimit = await getAgentSpeedLimitCached(agentId);
        const normalized = points.map(p => normalizePoint(agentId, p, speedLimit));

        if (normalized.length > 0) {
            await batchInsertPoints(normalized);
            totalInserted += normalized.length;

            // Atualiza heartbeat assincronamente com o último ponto do agente no lote
            const last = normalized[normalized.length - 1];
            await updateHeartbeat(agentId, last.lat, last.lng);
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
