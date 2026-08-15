const { cenos_pool } = require('../../db');
const { booleanPointInPolygon } = require('@turf/boolean-point-in-polygon');
const { point, polygon: turfPolygon } = require('@turf/helpers');
const { userIsAdmin, getColaboradoresFilter, checkAgentPermission } = require('./admin');
const { getAgentTrailWithStops } = require('./trackingUnified');
const { get_agent_proximity_alerts } = require('./trackingAlerts');

const MAX_AREA_AGENTS = 100;

/**
 * Busca agentes que passaram por uma área (polígono) em um dia.
 *
 * Pontos estimados (is_estimated = TRUE) NÃO contam para a detecção de
 * passagem pela área, mas permanecem visíveis nos trails retornados.
 * Alertas de proximidade são retornados do dia todo por agente.
 *
 * @param {Object} args
 * @param {Array<{lat:number,lng:number}>} args.polygon - Vértices do polígono (>= 3)
 * @param {string} args.dateFrom - Início da janela (timestamp)
 * @param {string} args.dateTo - Fim da janela (timestamp)
 * @param {Object} args.user - Usuário admin (req.user)
 * @returns {Promise<{agents:Array, total_agents:number, truncated:boolean}>}
 */
async function getAgentsTrailInArea({ polygon, dateFrom, dateTo, user }) {
    const lats = polygon.map(p => p.lat);
    const lngs = polygon.map(p => p.lng);

    // 1) Pré-filtro por bounding box (sem PostGIS) — candidatos por agente
    const params = [
        dateFrom,
        dateTo,
        Math.min(...lats),
        Math.max(...lats),
        Math.min(...lngs),
        Math.max(...lngs),
    ];
    let query = `
        SELECT DISTINCT tsp.agent_id, c.estado AS agent_estado, c.regional, c.seccional,
               c."GESTOR IMEDIATO" AS gestor
        FROM tracking_session_points tsp
        JOIN colaboradores c ON UPPER(c."ID") = UPPER(tsp.agent_id)
        WHERE tsp.recorded_at >= $1
          AND tsp.recorded_at <= $2
          AND tsp.is_estimated = FALSE
          AND tsp.latitude BETWEEN $3 AND $4
          AND tsp.longitude BETWEEN $5 AND $6
    `;

    if (user && !userIsAdmin(user)) {
        const filter = getColaboradoresFilter(user, { includeAllStates: true });
        if (filter.allowedStates.length > 0) {
            params.push(filter.allowedStates);
            query += ` AND c.estado = ANY($${params.length})`;
        } else {
            return { agents: [], total_agents: 0, truncated: false };
        }
    }

    query += ` ORDER BY tsp.agent_id`;

    const { rows } = await cenos_pool.query(query, params);
    if (rows.length === 0) return { agents: [], total_agents: 0, truncated: false };

    // Turf exige anel fechado (primeiro == último ponto)
    const ring = polygon.map(p => [p.lng, p.lat]);
    ring.push(ring[0]);
    const polygonTurf = turfPolygon([ring]);

    // 2) Confirma passagem real pelo polígono (não apenas pelo bbox)
    const inArea = [];
    for (const r of rows) {
        if (await agentHasPointInsidePolygon(r.agent_id, dateFrom, dateTo, polygonTurf)) {
            inArea.push(r);
        }
    }
    if (inArea.length === 0) return { agents: [], total_agents: 0, truncated: false };

    // 3) Filtro de permissão em memória (regional/seccional/gestor)
    let matches = inArea;
    if (user && !userIsAdmin(user)) {
        matches = matches.filter(r => checkAgentPermission({
            id: r.agent_id,
            nome: null,
            regional: r.regional,
            seccional: r.seccional,
            gestor: r.gestor,
            estado: r.agent_estado,
        }, user));
    }

    const total_agents = matches.length;
    const truncated = total_agents > MAX_AREA_AGENTS;
    const selected = matches.slice(0, MAX_AREA_AGENTS);

    // 4) Nomes + trails completos (pontos + paradas) + alertas do dia
    const names = await getColaboradoresNames(selected.map(r => r.agent_id));

    const agents = [];
    for (const row of selected) {
        const [trail, alerts] = await Promise.all([
            getAgentTrailWithStops(row.agent_id, dateFrom, dateTo),
            get_agent_proximity_alerts(row.agent_id, dateFrom, dateTo),
        ]);
        agents.push({
            agent_id: row.agent_id,
            agent_nome: names[row.agent_id.toUpperCase()] || row.agent_id,
            points: trail.points,
            stops: trail.stops,
            alerts,
        });
    }

    return { agents, total_agents, truncated };
}

// Verifica se o agente possui ao menos um ponto NÃO estimado dentro do polígono na janela
async function agentHasPointInsidePolygon(agentId, dateFrom, dateTo, polygonTurf) {
    const { rows } = await cenos_pool.query(
        `SELECT latitude, longitude
         FROM tracking_session_points
         WHERE agent_id = $1 AND recorded_at >= $2 AND recorded_at <= $3 AND is_estimated = FALSE
         ORDER BY recorded_at ASC LIMIT 10000`,
        [agentId, dateFrom, dateTo]
    );
    for (const r of rows) {
        const lat = Number(r.latitude);
        const lng = Number(r.longitude);
        if (booleanPointInPolygon(point([lng, lat]), polygonTurf)) return true;
    }
    return false;
}

async function getColaboradoresNames(agentIds) {
    const ids = [...new Set(agentIds.map(id => id.toUpperCase()))];
    if (ids.length === 0) return {};
    const { rows } = await cenos_pool.query(
        `SELECT "ID", "Nome" FROM colaboradores WHERE "ID" = ANY($1)`,
        [ids]
    );
    const map = {};
    rows.forEach(c => { map[c.ID.toUpperCase()] = c.Nome; });
    return map;
}

module.exports = {
    getAgentsTrailInArea,
    MAX_AREA_AGENTS,
};
