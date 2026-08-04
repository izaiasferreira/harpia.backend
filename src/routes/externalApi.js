const express = require('express');
const router = express.Router();
const { checkToken } = require('../functions/middlewares');
const { cenos_pool } = require('../db');
const { listChecklistsAdmin, getChecklistsStats } = require('../functions/database/checklists');
const { get_users_agents_admin_paginated } = require('../functions/database/admin');
const { getAgentsLastPositionUnified } = require('../functions/database/trackingUnified');
const { createNotification } = require('../functions/database/notifications');
const { sendToMultiple } = require('../functions/firebase');
const { getTokensByAgent, removeFcmToken } = require('../functions/database/fcmTokens');
const { get_or_create_support_room, save_chat_message } = require('../functions/database/chat');
const {
    pendencias,
    pendenciasJson,
    cnl,
    c12Json,
    e02Json,
    c16Json,
    perdas,
    perdasJson,
    notStartServices,
    completedServices,
    CNLToLidoJson,
    firstCNLJson,
    C12ToLidoJson,
    incompletedServices,
    lastUpdate,
    getAgentTelegramId,
    pontualidade,
    pontualidadeJson,
    firstC12Json,
    fastC12Json,
    licacaoNovaC12Json,
    pre_create_pending_justify
} = require('../functions/postgresFunctions');

// Helper para parse de inteiros seguros
function parseIntDef(val, def = 1) {
    const parsed = parseInt(val, 10);
    return isNaN(parsed) || parsed < 1 ? def : parsed;
}

function today() {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

// ============================================================================
// 1. REPORTES DE SEGURANÇA (com busca por raio / perímetro)
// GET /security-reports ou /api/v1/security-reports
// ============================================================================
router.get('/security-reports', async (req, res) => {
    if (!await checkToken(req, res)) return;

    try {
        console.log(req.query);
        const page = parseIntDef(req.query.page, 1);
        const limit = Math.min(parseIntDef(req.query.limit, 20), 100);
        const offset = (page - 1) * limit;

        const {
            estado,
            tipo,
            motivo,
            date_from,
            date_to,
            agent_id,
            autor,
            regional,
            seccional,
            latitude,
            longitude,
            radius_km,
            radius_m
        } = req.query;

        const params = [];
        const whereClauses = [];

        if (estado) {
            params.push(estado.toUpperCase());
            whereClauses.push(`UPPER(COALESCE(sr.estado, c.estado)) = $${params.length}`);
        }

        const categoryFilter = tipo || motivo;
        if (categoryFilter) {
            params.push(`%${categoryFilter.trim()}%`);
            whereClauses.push(`(sr.motivo ILIKE $${params.length} OR sr.observacao ILIKE $${params.length})`);
        }

        if (date_from) {
            params.push(date_from);
            whereClauses.push(`sr.created_at >= $${params.length}`);
        }
        if (date_to) {
            params.push(date_to);
            whereClauses.push(`sr.created_at <= $${params.length}`);
        }

        const agentFilter = agent_id || autor;
        if (agentFilter) {
            params.push(`%${agentFilter.trim()}%`);
            whereClauses.push(`(sr.autor ILIKE $${params.length} OR c."Nome" ILIKE $${params.length})`);
        }

        if (regional) {
            params.push(`%${regional.trim()}%`);
            whereClauses.push(`c.regional ILIKE $${params.length}`);
        }
        if (seccional) {
            params.push(`%${seccional.trim()}%`);
            whereClauses.push(`c.seccional ILIKE $${params.length}`);
        }

        let selectDistanceField = '';
        let radiusFilterClause = '';

        const latVal = parseFloat(latitude);
        const lngVal = parseFloat(longitude);
        const maxRadiusKm = parseFloat(radius_km) || (parseFloat(radius_m) ? parseFloat(radius_m) / 1000 : null);

        if (!isNaN(latVal) && !isNaN(lngVal)) {
            params.push(latVal, lngVal);
            const latIdx = params.length - 1;
            const lngIdx = params.length;

            selectDistanceField = `,
                ROUND(
                    (6371 * acos(
                        LEAST(1.0, GREATEST(-1.0,
                            cos(radians($${latIdx})) * cos(radians(sr.latitude)) *
                            cos(radians(sr.longitude) - radians($${lngIdx})) +
                            sin(radians($${latIdx})) * sin(radians(sr.latitude))
                        ))
                    ))::numeric, 3
                ) as distance_km`;

            if (maxRadiusKm && maxRadiusKm > 0) {
                params.push(maxRadiusKm);
                radiusFilterClause = ` AND (
                    6371 * acos(
                        LEAST(1.0, GREATEST(-1.0,
                            cos(radians($${latIdx})) * cos(radians(sr.latitude)) *
                            cos(radians(sr.longitude) - radians($${lngIdx})) +
                            sin(radians($${latIdx})) * sin(radians(sr.latitude))
                        ))
                    )
                ) <= $${params.length}`;
            }
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
        const fullWhereSql = whereSql + radiusFilterClause;

        const countQuery = `
            SELECT COUNT(1) as total
            FROM security_report sr
            LEFT JOIN colaboradores c ON UPPER(c."ID") = UPPER(sr.autor)
            ${fullWhereSql}
        `;
        const countRes = await cenos_pool.query(countQuery, params);
        const total = parseInt(countRes.rows[0]?.total || 0, 10);

        const orderBySql = (!isNaN(latVal) && !isNaN(lngVal)) ? 'ORDER BY distance_km ASC, sr.created_at DESC' : 'ORDER BY sr.created_at DESC';

        const dataQuery = `
            SELECT sr.id, sr.autor as agent_id, c."Nome" as agent_nome, c.regional, c.seccional,
                   c."Cargo" as agent_cargo, c."GESTOR IMEDIATO" as agent_gestor,
                   COALESCE(sr.estado, c.estado) as estado,
                   sr.motivo, sr.observacao, sr.latitude, sr.longitude, sr.foto as photo_url, sr.created_at
                   ${selectDistanceField}
            FROM security_report sr
            LEFT JOIN colaboradores c ON UPPER(c."ID") = UPPER(sr.autor)
            ${fullWhereSql}
            ${orderBySql}
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;

        const { rows } = await cenos_pool.query(dataQuery, [...params, limit, offset]);

        const data = rows.map(r => {
            if (r.distance_km !== undefined && r.distance_km !== null) {
                r.distance_m = Math.round(parseFloat(r.distance_km) * 1000);
            }
            return r;
        });

        res.json({
            data,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        });

    } catch (err) {
        console.error('[API_EXTERNAL] Erro em /security-reports:', err);
        res.status(500).json({ error: 'Erro ao consultar reportes de segurança' });
    }
});

// ============================================================================
// 2. LIMITES DE VELOCIDADE (com busca por raio / perímetro)
// GET /speed-violations
// ============================================================================
router.get('/speed-violations', async (req, res) => {
    if (!await checkToken(req, res)) return;

    try {
        console.log(req.query);
        const page = parseIntDef(req.query.page, 1);
        const limit = Math.min(parseIntDef(req.query.limit, 20), 100);
        const offset = (page - 1) * limit;

        const {
            estado,
            date_from,
            date_to,
            agent_id,
            agent_name,
            regional,
            seccional,
            latitude,
            longitude,
            radius_km,
            radius_m,
            min_speed,
            max_speed
        } = req.query;

        const params = [];
        const whereClauses = ['tsp.is_speed_violation = TRUE'];

        if (estado) {
            params.push(estado.toUpperCase());
            whereClauses.push(`UPPER(c.estado) = $${params.length}`);
        }
        if (date_from) {
            params.push(date_from);
            whereClauses.push(`tsp.recorded_at >= $${params.length}`);
        }
        if (date_to) {
            params.push(date_to);
            whereClauses.push(`tsp.recorded_at <= $${params.length}`);
        }

        const agentFilter = agent_id || agent_name;
        if (agentFilter) {
            params.push(`%${agentFilter.trim()}%`);
            whereClauses.push(`(tsp.agent_id ILIKE $${params.length} OR c."Nome" ILIKE $${params.length})`);
        }
        if (regional) {
            params.push(`%${regional.trim()}%`);
            whereClauses.push(`c.regional ILIKE $${params.length}`);
        }
        if (seccional) {
            params.push(`%${seccional.trim()}%`);
            whereClauses.push(`c.seccional ILIKE $${params.length}`);
        }
        if (min_speed) {
            params.push(parseFloat(min_speed));
            whereClauses.push(`tsp.speed >= $${params.length}`);
        }
        if (max_speed) {
            params.push(parseFloat(max_speed));
            whereClauses.push(`tsp.speed <= $${params.length}`);
        }

        let selectDistanceField = '';
        let radiusFilterClause = '';

        const latVal = parseFloat(latitude);
        const lngVal = parseFloat(longitude);
        const maxRadiusKm = parseFloat(radius_km) || (parseFloat(radius_m) ? parseFloat(radius_m) / 1000 : null);

        if (!isNaN(latVal) && !isNaN(lngVal)) {
            params.push(latVal, lngVal);
            const latIdx = params.length - 1;
            const lngIdx = params.length;

            selectDistanceField = `,
                ROUND(
                    (6371 * acos(
                        LEAST(1.0, GREATEST(-1.0,
                            cos(radians($${latIdx})) * cos(radians(tsp.latitude)) *
                            cos(radians(tsp.longitude) - radians($${lngIdx})) +
                            sin(radians($${latIdx})) * sin(radians(tsp.latitude))
                        ))
                    ))::numeric, 3
                ) as distance_km`;

            if (maxRadiusKm && maxRadiusKm > 0) {
                params.push(maxRadiusKm);
                radiusFilterClause = ` AND (
                    6371 * acos(
                        LEAST(1.0, GREATEST(-1.0,
                            cos(radians($${latIdx})) * cos(radians(tsp.latitude)) *
                            cos(radians(tsp.longitude) - radians($${lngIdx})) +
                            sin(radians($${latIdx})) * sin(radians(tsp.latitude))
                        ))
                    )
                ) <= $${params.length}`;
            }
        }

        const whereSql = `WHERE ${whereClauses.join(' AND ')}${radiusFilterClause}`;

        const countQuery = `
            SELECT COUNT(1) as total
            FROM tracking_session_points tsp
            INNER JOIN colaboradores c ON UPPER(c."ID") = UPPER(tsp.agent_id)
            ${whereSql}
        `;
        const countRes = await cenos_pool.query(countQuery, params);
        const total = parseInt(countRes.rows[0]?.total || 0, 10);

        const orderBySql = (!isNaN(latVal) && !isNaN(lngVal)) ? 'ORDER BY distance_km ASC, tsp.recorded_at DESC' : 'ORDER BY tsp.recorded_at DESC';

        const dataQuery = `
            SELECT tsp.id, tsp.agent_id, c."Nome" as agent_nome, c.regional, c.seccional,
                   c.estado as agent_estado, c."Cargo" as agent_cargo, c."GESTOR IMEDIATO" as agent_gestor,
                   tsp.latitude, tsp.longitude, tsp.speed, tsp.speed_limit_applied as speed_limit,
                   tsp.recorded_at
                   ${selectDistanceField}
            FROM tracking_session_points tsp
            INNER JOIN colaboradores c ON UPPER(c."ID") = UPPER(tsp.agent_id)
            ${whereSql}
            ${orderBySql}
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;

        const { rows } = await cenos_pool.query(dataQuery, [...params, limit, offset]);

        const data = rows.map(r => {
            if (r.distance_km !== undefined && r.distance_km !== null) {
                r.distance_m = Math.round(parseFloat(r.distance_km) * 1000);
            }
            return r;
        });

        res.json({
            data,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        });

    } catch (err) {
        console.error('[API_EXTERNAL] Erro em /speed-violations:', err);
        res.status(500).json({ error: 'Erro ao consultar infrações de velocidade' });
    }
});

// ============================================================================
// 3. HEARTBEATS / RASTREAMENTO VIVO
// GET /heartbeats
// ============================================================================
router.get('/heartbeats', async (req, res) => {
    if (!await checkToken(req, res)) return;

    try {
        const { estado, agent_id, period, inactive_period, active_period, date, regional, seccional, latest_only } = req.query;

        // MODO ÚLTIMA POSIÇÃO: retorna apenas 1 ponto por agente (o mais recente)
        if (latest_only === 'true' || inactive_period || active_period || (!agent_id && !date && !period)) {
            const { getAgentsLastPositionUnified } = require('../functions/database/trackingUnified');
            const allAgents = await getAgentsLastPositionUnified(null);
            
            let filtered = allAgents;
            if (estado) {
                filtered = filtered.filter(a => (a.agent_estado || '').toUpperCase() === estado.toUpperCase());
            }
            if (regional) {
                filtered = filtered.filter(a => (a.regional || '').toLowerCase().includes(regional.toLowerCase()));
            }
            if (seccional) {
                filtered = filtered.filter(a => (a.seccional || '').toLowerCase().includes(seccional.toLowerCase()));
            }
            if (agent_id) {
                filtered = filtered.filter(a => (a.agent_id || '').toUpperCase() === agent_id.toUpperCase());
            }

            const nowMs = Date.now();
            
            // Filtro para quem envio nas ÚLTIMAS X horas (ativo recentemente)
            if (active_period && active_period !== 'all') {
                let maxAgeMs = 15 * 60 * 1000;
                if (active_period === '1h') maxAgeMs = 1 * 60 * 60 * 1000;
                else if (active_period === '5h') maxAgeMs = 5 * 60 * 60 * 1000;
                else if (active_period === '12h') maxAgeMs = 12 * 60 * 60 * 1000;
                else if (active_period === '24h') maxAgeMs = 24 * 60 * 60 * 1000;
                
                filtered = filtered.filter(a => {
                    if (!a.recorded_at) return false;
                    const recTime = new Date(a.recorded_at).getTime();
                    return (nowMs - recTime) <= maxAgeMs;
                });
            }

            // Filtro para quem NÃO envia há pelo menos X horas (inativo)
            if (inactive_period && inactive_period !== 'all') {
                let minAgeMs = 15 * 60 * 1000;
                if (inactive_period === '1h') minAgeMs = 1 * 60 * 60 * 1000;
                else if (inactive_period === '5h') minAgeMs = 5 * 60 * 60 * 1000;
                else if (inactive_period === '12h') minAgeMs = 12 * 60 * 60 * 1000;
                else if (inactive_period === '24h') minAgeMs = 24 * 60 * 60 * 1000;

                filtered = filtered.filter(a => {
                    if (!a.recorded_at) return true; // se nunca enviou, está inativo
                    const recTime = new Date(a.recorded_at).getTime();
                    return (nowMs - recTime) >= minAgeMs;
                });
            }

            const page = parseIntDef(req.query.page, 1);
            const limit = Math.min(parseIntDef(req.query.limit, 100), 1000);
            const offset = (page - 1) * limit;

            const paginated = filtered.slice(offset, offset + limit);

            return res.json({ 
                data: paginated, 
                total: filtered.length,
                page,
                limit,
                totalPages: Math.ceil(filtered.length / limit)
            });
        }

        // MODO HISTÓRICO: Retorna a trilha de coordenadas no período (vários pontos por agente)
        const page = parseIntDef(req.query.page, 1);
        const limit = Math.min(parseIntDef(req.query.limit, 100), 1000);
        const offset = (page - 1) * limit;

        const params = [];
        const whereClauses = [];

        if (agent_id) {
            params.push(agent_id);
            whereClauses.push(`tsp.agent_id = $${params.length}`);
        }
        if (estado) {
            params.push(estado.toUpperCase());
            whereClauses.push(`UPPER(c.estado) = $${params.length}`);
        }
        if (regional) {
            params.push(`%${regional.trim()}%`);
            whereClauses.push(`c.regional ILIKE $${params.length}`);
        }
        if (seccional) {
            params.push(`%${seccional.trim()}%`);
            whereClauses.push(`c.seccional ILIKE $${params.length}`);
        }
        if (date) {
            params.push(`${date} 00:00:00`, `${date} 23:59:59`);
            whereClauses.push(`tsp.recorded_at BETWEEN $${params.length - 1} AND $${params.length}`);
        } else if (period && period !== 'all') {
            let hours = 0;
            if (period === 'now') hours = 0.25; // 15 mins
            else if (period === '1h') hours = 1;
            else if (period === '5h') hours = 5;
            else if (period === '12h') hours = 12;
            else if (period === '24h') hours = 24;
            
            if (hours > 0) {
                whereClauses.push(`tsp.recorded_at >= NOW() - INTERVAL '${hours} hours'`);
            }
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        const countQuery = `
            SELECT COUNT(1) as total
            FROM tracking_session_points tsp
            LEFT JOIN colaboradores c ON UPPER(c."ID") = UPPER(tsp.agent_id)
            ${whereSql}
        `;
        const countRes = await cenos_pool.query(countQuery, params);
        const total = parseInt(countRes.rows[0]?.total || 0, 10);

        const query = `
            SELECT tsp.id, tsp.agent_id, c."Nome" as agent_nome, c.regional, c.seccional, c.estado as agent_estado,
                   tsp.latitude, tsp.longitude, tsp.speed, tsp.accuracy, tsp.battery_level,
                   tsp.is_charging, tsp.network_type, tsp.gps_enabled, tsp.device_model,
                   tsp.recorded_at
            FROM tracking_session_points tsp
            LEFT JOIN colaboradores c ON UPPER(c."ID") = UPPER(tsp.agent_id)
            ${whereSql}
            ORDER BY tsp.recorded_at DESC
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;

        const { rows } = await cenos_pool.query(query, [...params, limit, offset]);
        res.json({ 
            data: rows, 
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            period 
        });

    } catch (err) {
        console.error('[API_EXTERNAL] Erro em /heartbeats:', err);
        res.status(500).json({ error: 'Erro ao consultar heartbeats / posições', details: err.message, stack: err.stack });
    }
});

// ============================================================================
// 4. CHECKLISTS DE SEGURANÇA
// GET /checklists
// ============================================================================
router.get('/checklists', async (req, res) => {
    if (!await checkToken(req, res)) return;

    try {
        const page = parseIntDef(req.query.page, 1);
        const limit = Math.min(parseIntDef(req.query.limit, 20), 100);

        const {
            estado,
            regional_id,
            regional,
            sectional_id,
            seccional,
            agent_name,
            agent_id,
            date_from,
            date_to,
            type,
            status
        } = req.query;

        const result = await listChecklistsAdmin({
            page,
            limit,
            regional_id: regional_id || regional || null,
            sectional_id: sectional_id || seccional || null,
            agent_name: agent_name || agent_id || null,
            date_from: date_from || null,
            date_to: date_to || null,
            type: type || null,
            status: status || null,
            severity_alert: false
        }, null);

        if (estado && result.data) {
            const estadoUpper = estado.toUpperCase();
            result.data = result.data.filter(c => (c.agent_estado || '').toUpperCase() === estadoUpper);
            result.total = result.data.length;
            result.totalPages = Math.ceil(result.total / limit);
        }

        res.json(result);

    } catch (err) {
        console.error('[API_EXTERNAL] Erro em /checklists:', err);
        res.status(500).json({ error: 'Erro ao listar checklists de segurança' });
    }
});

// ============================================================================
// 5. CHECKLISTS DE SEGURANÇA — ALERTAS CRÍTICOS
// GET /checklists/alerts
// ============================================================================
router.get('/checklists/alerts', async (req, res) => {
    if (!await checkToken(req, res)) return;

    try {
        const page = parseIntDef(req.query.page, 1);
        const limit = Math.min(parseIntDef(req.query.limit, 20), 100);

        const {
            estado,
            regional_id,
            regional,
            sectional_id,
            seccional,
            agent_name,
            agent_id,
            date_from,
            date_to,
            type,
            status
        } = req.query;

        const result = await listChecklistsAdmin({
            page,
            limit,
            regional_id: regional_id || regional || null,
            sectional_id: sectional_id || seccional || null,
            agent_name: agent_name || agent_id || null,
            date_from: date_from || null,
            date_to: date_to || null,
            type: type || null,
            status: status || null,
            severity_alert: true
        }, null);

        if (estado && result.data) {
            const estadoUpper = estado.toUpperCase();
            result.data = result.data.filter(c => (c.agent_estado || '').toUpperCase() === estadoUpper);
            result.total = result.data.length;
            result.totalPages = Math.ceil(result.total / limit);
        }

        res.json(result);

    } catch (err) {
        console.error('[API_EXTERNAL] Erro em /checklists/alerts:', err);
        res.status(500).json({ error: 'Erro ao listar alertas de checklists' });
    }
});

// ============================================================================
// 6. CHECKLISTS DE SEGURANÇA — NÃO CONFORMIDADES (Questões Reprovadas)
// GET /checklists/non-conformities
// ============================================================================
router.get('/checklists/non-conformities', async (req, res) => {
    if (!await checkToken(req, res)) return;

    try {
        const page = parseIntDef(req.query.page, 1);
        const limit = Math.min(parseIntDef(req.query.limit, 20), 100);
        const offset = (page - 1) * limit;

        const {
            estado,
            regional,
            seccional,
            agent_id,
            agent_name,
            date_from,
            date_to
        } = req.query;

        const params = [];
        const whereClauses = ["ans->>'is_compliant' = 'false'"];

        if (estado) {
            params.push(estado.toUpperCase());
            whereClauses.push(`UPPER(c.estado) = $${params.length}`);
        }
        if (date_from) {
            params.push(date_from);
            whereClauses.push(`chk.date >= $${params.length}`);
        }
        if (date_to) {
            params.push(date_to);
            whereClauses.push(`chk.date <= $${params.length}`);
        }

        const agentFilter = agent_id || agent_name;
        if (agentFilter) {
            params.push(`%${agentFilter.trim()}%`);
            whereClauses.push(`(chk.agent_id ILIKE $${params.length} OR c."Nome" ILIKE $${params.length})`);
        }
        if (regional) {
            params.push(`%${regional.trim()}%`);
            whereClauses.push(`c.regional ILIKE $${params.length}`);
        }
        if (seccional) {
            params.push(`%${seccional.trim()}%`);
            whereClauses.push(`c.seccional ILIKE $${params.length}`);
        }

        const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

        const countQuery = `
            SELECT COUNT(1) as total
            FROM checklists chk
            INNER JOIN colaboradores c ON UPPER(c."ID") = UPPER(chk.agent_id),
            jsonb_array_elements(chk.data->'answers') as ans
            ${whereSql}
        `;
        const countRes = await cenos_pool.query(countQuery, params);
        const total = parseInt(countRes.rows[0]?.total || 0, 10);

        const dataQuery = `
            SELECT chk.id as checklist_id, chk.agent_id, c."Nome" as agent_nome,
                   c.regional, c.seccional, c.estado as agent_estado, chk.date, chk.submitted_at,
                   t.title as template_title,
                   ans->>'question_uuid' as question_uuid,
                   ans->>'question_label' as question_label,
                   ans->>'section_title' as section_title,
                   ans->>'observation' as observation,
                   ans->>'photo_url' as photo_url,
                   ans->>'severity' as severity
            FROM checklists chk
            INNER JOIN colaboradores c ON UPPER(c."ID") = UPPER(chk.agent_id)
            LEFT JOIN checklist_templates t ON chk.template_id = t.id,
            jsonb_array_elements(chk.data->'answers') as ans
            ${whereSql}
            ORDER BY chk.submitted_at DESC
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;

        const { rows } = await cenos_pool.query(dataQuery, [...params, limit, offset]);

        res.json({
            data: rows,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        });

    } catch (err) {
        console.error('[API_EXTERNAL] Erro em /checklists/non-conformities:', err);
        res.status(500).json({ error: 'Erro ao consultar não conformidades de checklists' });
    }
});

// ============================================================================
// 7. CHECKLISTS DE SEGURANÇA — RESUMO ESTATÍSTICO
// GET /checklists/summary
// ============================================================================
router.get('/checklists/summary', async (req, res) => {
    if (!await checkToken(req, res)) return;

    try {
        const { date_from, date_to } = req.query;
        const stats = await getChecklistsStats({ date_from, date_to }, null);
        res.json(stats);
    } catch (err) {
        console.error('[API_EXTERNAL] Erro em /checklists/summary:', err);
        res.status(500).json({ error: 'Erro ao consultar resumo estatístico de checklists' });
    }
});

// ============================================================================
// 8. AGENTES / COLABORADORES
// GET /agents
// ============================================================================
router.get('/agents', async (req, res) => {
    if (!await checkToken(req, res)) return;

    try {
        const page = parseIntDef(req.query.page, 1);
        const limit = Math.min(parseIntDef(req.query.limit, 20), 100);

        const {
            estado,
            regional,
            seccional,
            processo,
            cargo,
            gestor,
            search,
            status,
            situacao,
            login_status
        } = req.query;

        const result = await get_users_agents_admin_paginated({
            page,
            limit,
            estado: estado || null,
            regional: regional || null,
            seccional: seccional || null,
            processo: processo || null,
            cargo: cargo || null,
            gestor: gestor || null,
            search: search || null,
            status: status !== undefined ? status : null,
            situacao: situacao || null,
            login_status: login_status || null,
            user: null
        });

        res.json(result);

    } catch (err) {
        console.error('[API_EXTERNAL] Erro em /agents:', err);
        res.status(500).json({ error: 'Erro ao consultar lista de agentes' });
    }
});

// ============================================================================
// 9. CONSULTAS OPERACIONAIS E RELATÓRIOS (Migrados de consultas.js)
// ============================================================================
router.get('/last_update', async (req, res) => {
    if (!await checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const result = await lastUpdate(state);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/pendencias', async (req, res) => {
    if (!await checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const regional = req.query.regional || 'all';
        const result = await pendencias(state, regional);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/pontualidade', async (req, res) => {
    if (!await checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const regional = req.query.regional || 'all';
        const result = await pontualidade(state, regional);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/pendencias_json', async (req, res) => {
    if (!await checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const regional = req.query.regional || 'all';
        const result = await pendenciasJson(state, regional);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/cnl', async (req, res) => {
    if (!await checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const regional = req.query.regional || 'all';
        const dateinit = (req.query.dateinit || today()).replace('/', '.');
        const dateend = (req.query.dateend || today()).replace('/', '.');
        const result = await cnl(state, regional, dateinit, dateend);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/pontualidade_json', async (req, res) => {
    if (!await checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const regional = req.query.regional || 'all';
        const result = await pontualidadeJson(state, regional);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/cnl_to_lido_json', async (req, res) => {
    if (!await checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const regional = req.query.regional || 'all';
        const dateinit = (req.query.dateinit || today()).replace('/', '.');
        const result = await CNLToLidoJson(state, regional, dateinit);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/first_cnl_json', async (req, res) => {
    if (!await checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const regional = req.query.regional || 'all';
        const dateinit = (req.query.dateinit || today()).replace('/', '.');
        const dateend = (req.query.dateend || today()).replace('/', '.');
        const result = await firstCNLJson(state, regional, dateinit, dateend);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/c12_json', async (req, res) => {
    if (!await checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const regional = req.query.regional || 'all';
        const dateinit = (req.query.dateinit || today()).replace('/', '.');
        const dateend = (req.query.dateend || today()).replace('/', '.');
        const result = await c12Json(state, regional, dateinit, dateend);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/c12_to_lido_json', async (req, res) => {
    if (!await checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const regional = req.query.regional || 'all';
        const dateinit = (req.query.dateinit || today()).replace('/', '.');
        const result = await C12ToLidoJson(state, regional, dateinit);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/first_c12_json', async (req, res) => {
    if (!await checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const regional = req.query.regional || 'all';
        const dateinit = (req.query.dateinit || today()).replace('/', '.');
        const dateend = (req.query.dateend || today()).replace('/', '.');
        const result = await firstC12Json(state, regional, dateinit, dateend);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/fast_c12_json', async (req, res) => {
    if (!await checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const regional = req.query.regional || 'all';
        const dateinit = (req.query.dateinit || today()).replace('/', '.');
        const dateend = (req.query.dateend || today()).replace('/', '.');
        const result = await fastC12Json(state, regional, dateinit, dateend);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/licacao_nova_c12_json', async (req, res) => {
    if (!await checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const regional = req.query.regional || 'all';
        const dateinit = (req.query.dateinit || today()).replace('/', '.');
        const dateend = (req.query.dateend || today()).replace('/', '.');
        const result = await licacaoNovaC12Json(state, regional, dateinit, dateend);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/e02_json', async (req, res) => {
    if (!await checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const regional = req.query.regional || 'all';
        const dateinit = (req.query.dateinit || today()).replace('/', '.');
        const dateend = (req.query.dateend || today()).replace('/', '.');
        const result = await e02Json(state, regional, dateinit, dateend);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/c16_json', async (req, res) => {
    if (!await checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const regional = req.query.regional || 'all';
        const dateinit = (req.query.dateinit || today()).replace('/', '.');
        const dateend = (req.query.dateend || today()).replace('/', '.');
        const result = await c16Json(state, regional, dateinit, dateend);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/perdas', async (req, res) => {
    if (!await checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const regional = req.query.regional || 'all';
        const dateinit = (req.query.dateinit || today()).replace('/', '.');
        const dateend = (req.query.dateend || today()).replace('/', '.');
        const result = await perdas(state, regional, dateinit, dateend);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/perdas_json', async (req, res) => {
    if (!await checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const regional = req.query.regional || 'all';
        const dateinit = (req.query.dateinit || today()).replace('/', '.');
        const dateend = (req.query.dateend || today()).replace('/', '.');
        const result = await perdasJson(state, regional, dateinit, dateend);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/not_start_services', async (req, res) => {
    if (!await checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const result = await notStartServices(state);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/completed_services', async (req, res) => {
    if (!await checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const result = await completedServices(state);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/incompleted_services', async (req, res) => {
    if (!await checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const result = await incompletedServices(state);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/agent_telegram_id', async (req, res) => {
    if (!await checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const id = req.query.id;
        const result = await getAgentTelegramId({ state, id });
        if (result.length === 0) {
            res.json({ telegram_id: null });
            return;
        }
        res.json({ telegram_id: result[0].telegram_id });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/justification_codes', async (req, res) => {
    if (!await checkToken(req, res)) return;
    try {
        const state = req.query.state || 'pi';
        const id = req.query.id;
        const result = await getAgentTelegramId({ state, id });
        if (result.length === 0) {
            res.json({ telegram_id: null });
            return;
        }
        res.json({ telegram_id: result[0].telegram_id });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================================
// 10. JUSTIFICATIVA DE PENDÊNCIA (Migrado de agentDefaultAuth.js)
// POST /justify_pending
// ============================================================================
router.post('/justify_pending', async (req, res) => {
    try {
        if (!await checkToken(req, res)) return;

        const { autor, estado, quantidade, tipo, unidade_leitura, instalacao, foto } = req.body;

        if (!autor || !estado) {
            return res.status(400).json({ error: 'Autor e estado são obrigatórios' });
        }
        if (!quantidade || quantidade < 1) {
            return res.status(400).json({ error: 'Quantidade é obrigatória' });
        }

        const result = await pre_create_pending_justify({
            state: estado,
            autor,
            quantidade,
            tipo,
            unidade_leitura,
            instalacao,
            foto
        });

        res.status(201).json(result);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================================
// 11. TELEGRAM WEBHOOK (Migrado de telegramWebhook.js)
// POST /telegram-webhook
// ============================================================================
router.post('/telegram-webhook', async (req, res) => {
    if (!await checkToken(req, res)) return;

    try {
        const payload = req.body;

        if (payload.direction !== 'inbound') {
            return res.json({ ok: true });
        }

        if (!['message.received', 'web_app_data'].includes(payload.event)) {
            return res.json({ ok: true });
        }

        const telegramId = String(payload.from?.id || payload.chatId);
        const senderName = [payload.from?.firstName, payload.from?.lastName].filter(Boolean).join(' ') || 'Agente';

        const { rows: loginRows } = await cenos_pool.query(
            'SELECT id FROM login WHERE telegram_id = $1',
            [telegramId]
        );

        if (loginRows.length === 0) {
            console.log(`[TELEGRAM WEBHOOK] telegram_id ${telegramId} não encontrado na tabela login`);
            return res.json({ ok: true, ignored: 'user_not_found' });
        }

        const agentId = loginRows[0].id;
        const textMsg = payload.message?.text || payload.data || '';

        if (!textMsg) {
            return res.json({ ok: true });
        }

        const room = await get_or_create_support_room(agentId, agentId);

        const savedMsg = await save_chat_message(
            room.id,
            agentId,
            'agent',
            senderName,
            textMsg,
            'text',
            null, null, null, null,
            'telegram',
            payload
        );

        if (global.io) {
            global.io.to(`room_${room.id}`).emit('receive_message', savedMsg);
            global.io.emit('admin_new_chat_message', {
                roomId: room.id,
                agentId,
                message: savedMsg
            });
        }

        res.json({ ok: true, messageId: savedMsg.id });
    } catch (err) {
        console.error('[TELEGRAM WEBHOOK] Erro ao processar:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================================
// 12. NOTIFICAÇÕES PÚBLICAS / PUSH (Migrado de publicNotify.js)
// POST /notify
// ============================================================================
router.post('/notify', async (req, res) => {
    if (!await checkToken(req, res)) return;

    try {
        const { sender, to, title, body, type, method, webAppButtonText, webAppButtonUrl } = req.body;

        if (!sender) return res.status(400).json({ error: 'sender é obrigatório' });
        if (!to) return res.status(400).json({ error: 'to é obrigatório' });
        if (!body) return res.status(400).json({ error: 'body é obrigatório' });

        const methods = Array.isArray(method) ? method : (method ? [method] : ['push']);
        const notificationType = type || 'success';
        const agentIds = Array.isArray(to) ? to.map(id => String(id).toUpperCase()) : [String(to).toUpperCase()];

        const allResults = { agents: {} };
        let firstNotificationId = null;

        for (const agentId of agentIds) {
            const notification = await createNotification(
                agentId,
                title || 'Mensagem do Sistema',
                body,
                notificationType,
                '/support'
            );

            if (!firstNotificationId) firstNotificationId = notification.id;

            const agentRes = { push: null, telegram: null, chat: null };

            if (methods.includes('push')) {
                try {
                    const tokens = await getTokensByAgent(agentId);
                    if (tokens.length > 0) {
                        const pushPayload = {
                            title: title || 'Notificação',
                            body,
                            type: notificationType,
                            deepLink: '/support',
                            webAppButtonText,
                            webAppButtonUrl
                        };
                        const sendRes = await sendToMultiple(tokens, pushPayload);
                        agentRes.push = { sent: true, count: tokens.length, successCount: sendRes.successCount };
                    } else {
                        agentRes.push = { sent: false, reason: 'Sem tokens FCM cadastrados' };
                    }
                } catch (e) {
                    agentRes.push = { sent: false, error: e.message };
                }
            }

            if (methods.includes('chat')) {
                try {
                    const savedMsg = await get_or_create_support_room(agentId, agentId).then(room =>
                        save_chat_message(
                            room.id, sender, 'admin', sender,
                            title ? `[${title}] ${body}` : body,
                            'text', null, null, null, null, 'push_notify', null
                        )
                    );
                    agentRes.chat = { sent: true, messageId: savedMsg.id };
                } catch (e) {
                    agentRes.chat = { sent: false, error: e.message };
                }
            }

            allResults.agents[agentId] = agentRes;
        }

        res.json({
            success: true,
            id: firstNotificationId,
            totalAgents: agentIds.length,
            results: allResults
        });
    } catch (err) {
        console.error('[API_EXTERNAL] Erro em /notify:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
