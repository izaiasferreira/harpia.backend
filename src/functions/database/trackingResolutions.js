const { cenos_pool } = require('../../db');
const { userIsAdmin, getColaboradoresFilter, checkAgentPermission } = require('./admin');

async function ensureTable() {
    await cenos_pool.query(`
        CREATE TABLE IF NOT EXISTS speed_violation_resolutions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            agent_id VARCHAR(50) NOT NULL REFERENCES login(id) ON DELETE CASCADE,
            resolved_date DATE NOT NULL,
            is_valid BOOLEAN NOT NULL,
            description TEXT NOT NULL,
            photo_url TEXT NOT NULL,
            violation_ids INTEGER[] NOT NULL DEFAULT '{}',
            resolved_by INTEGER REFERENCES users(id),
            resolved_by_nome TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_by INTEGER REFERENCES users(id),
            updated_at TIMESTAMP
        )
    `);
    await cenos_pool.query(`
        ALTER TABLE speed_violation_resolutions
        ADD COLUMN IF NOT EXISTS violation_ids INTEGER[] NOT NULL DEFAULT '{}'
    `);
    await cenos_pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_speed_resolutions_agent_date
            ON speed_violation_resolutions(agent_id, resolved_date)
    `);
    await cenos_pool.query(`
        CREATE INDEX IF NOT EXISTS idx_speed_resolutions_date
            ON speed_violation_resolutions(resolved_date)
    `);
}

// ─── Criar resolução (resolve) ────────────────────────────────────────────────

async function resolveSpeedViolation({ agentId, date, isValid, description, photoUrl, violationIds = [], user }) {
    await ensureTable();
    const { rows } = await cenos_pool.query(`
        INSERT INTO speed_violation_resolutions
            (agent_id, resolved_date, is_valid, description, photo_url, violation_ids, resolved_by, resolved_by_nome)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, agent_id, resolved_date::text as resolved_date, is_valid,
                  description, photo_url, violation_ids, resolved_by, resolved_by_nome,
                  created_at, updated_by, updated_at
    `, [
        agentId,
        date,
        isValid,
        description,
        photoUrl,
        violationIds,
        user?.id ?? null,
        user?.nome || user?.name || user?.login || String(user?.id || ''),
    ]);
    return rows[0];
}

// ─── Editar resolução ─────────────────────────────────────────────────────────

async function updateSpeedViolationResolution({ id, isValid, description, photoUrl, violationIds, user }) {
    await ensureTable();
    const { rows } = await cenos_pool.query(`
        UPDATE speed_violation_resolutions
        SET is_valid = $1,
            description = $2,
            photo_url = $3,
            violation_ids = COALESCE($4, violation_ids),
            updated_by = $5,
            updated_at = NOW()
        WHERE id = $6
        RETURNING id, agent_id, resolved_date::text as resolved_date, is_valid,
                  description, photo_url, violation_ids, resolved_by, resolved_by_nome,
                  created_at, updated_by, updated_at
    `, [
        isValid,
        description,
        photoUrl,
        violationIds || null,
        user?.id ?? null,
        id,
    ]);
    return rows[0] || null;
}

// ─── Excluir resolução ────────────────────────────────────────────────────────

async function deleteSpeedViolationResolution(id) {
    await ensureTable();
    const { rows } = await cenos_pool.query(`
        DELETE FROM speed_violation_resolutions WHERE id = $1 RETURNING id
    `, [id]);
    return rows[0] || null;
}

// ─── Listar resoluções (histórico) ────────────────────────────────────────────

async function listSpeedViolationResolutions(filters = {}, user = null) {
    await ensureTable();
    const params = [];
    let query = `
        SELECT r.id, r.agent_id, r.resolved_date::text as resolved_date,
               r.is_valid, r.description, r.photo_url, r.violation_ids,
               r.resolved_by, r.resolved_by_nome,
               r.created_at, r.updated_by, r.updated_at,
               c."Nome" as nome,
               c.estado as agent_estado,
               c.regional as regional,
               c.seccional as seccional,
               c."GESTOR IMEDIATO" as gestor
        FROM speed_violation_resolutions r
        INNER JOIN colaboradores c ON UPPER(c."ID") = UPPER(r.agent_id)
        WHERE 1=1`;

    if (user && !userIsAdmin(user)) {
        const filter = getColaboradoresFilter(user, { includeAllStates: true });
        if (filter.allowedStates.length > 0) {
            params.push(filter.allowedStates);
            query += ` AND c.estado = ANY($${params.length})`;
        } else {
            return [];
        }
    }

    if (filters.agentId) {
        params.push(filters.agentId);
        query += ` AND r.agent_id = $${params.length}`;
    }
    if (filters.dateFrom) {
        params.push(filters.dateFrom);
        query += ` AND r.resolved_date >= $${params.length}`;
    }
    if (filters.dateTo) {
        params.push(filters.dateTo);
        query += ` AND r.resolved_date <= $${params.length}`;
    }

    query += ' ORDER BY r.resolved_date DESC, r.created_at DESC';

    const { rows } = await cenos_pool.query(query, params);

    let result = rows;

    if (user && !userIsAdmin(user)) {
        result = result.filter(r => {
            const agentData = {
                id: r.agent_id,
                nome: r.nome,
                regional: r.regional,
                seccional: r.seccional,
                gestor: r.gestor,
                estado: r.agent_estado,
            };
            return checkAgentPermission(agentData, user);
        });
    }

    return result;
}

// ─── Todas as violações de um intervalo com status de resolução ───────────────
// Espelha getSpeedViolationsFromUnified, porém SEM limite de 500 e com o
// LEFT JOIN de resolução embutido (uma resolução cobre agente + data).

async function getSpeedViolationsResolvable(filters = {}, user = null) {
    await ensureTable();
    const params = [];
    let query = `
        SELECT tsp.*,
               c.estado as agent_estado,
               c."Nome" as nome,
               c.regional as regional,
               c.seccional as seccional,
               c."GESTOR IMEDIATO" as gestor,
               tsp.speed_limit_applied as speed_limit,
               r.id as resolution_id,
               r.is_valid as resolution_is_valid,
               r.description as resolution_description,
               r.photo_url as resolution_photo_url,
               r.violation_ids as resolution_violation_ids,
               r.resolved_by as resolution_resolved_by,
               r.resolved_by_nome as resolution_resolved_by_nome,
               r.created_at as resolution_created_at,
               r.updated_at as resolution_updated_at
        FROM tracking_session_points tsp
        INNER JOIN colaboradores c ON UPPER(c."ID") = UPPER(tsp.agent_id)
        LEFT JOIN speed_violation_resolutions r
            ON r.agent_id = tsp.agent_id
           AND r.resolved_date = tsp.recorded_at::date
        WHERE tsp.is_speed_violation = TRUE
          AND (tsp.speed IS NULL OR tsp.speed <= 120)`;

    if (user && !userIsAdmin(user)) {
        const filter = getColaboradoresFilter(user, { includeAllStates: true });
        if (filter.allowedStates.length > 0) {
            params.push(filter.allowedStates);
            query += ` AND c.estado = ANY($${params.length})`;
        } else {
            return [];
        }
    }

    if (filters.agentId) {
        params.push(filters.agentId);
        query += ` AND tsp.agent_id = $${params.length}`;
    }
    if (filters.dateFrom) {
        params.push(filters.dateFrom);
        query += ` AND tsp.recorded_at >= $${params.length}`;
    }
    if (filters.dateTo) {
        params.push(filters.dateTo);
        query += ` AND tsp.recorded_at <= $${params.length}`;
    }

    query += ' ORDER BY tsp.recorded_at DESC';

    const { rows } = await cenos_pool.query(query, params);

    let result = rows;

    if (user && !userIsAdmin(user)) {
        result = result.filter(r => {
            const agentData = {
                id: r.agent_id,
                nome: r.nome,
                regional: r.regional,
                seccional: r.seccional,
                gestor: r.gestor,
                estado: r.agent_estado,
            };
            return checkAgentPermission(agentData, user);
        });
    }

    return result;
}

// ─── Estatísticas mensais (visão de mês) ─────────────────────────────────────
// "1 infração" = 1 par [agente + data]. Agrega os pontos de velocidade agrupados
// por agente e dia, com o status de resolução embutido.

async function getSpeedViolationMonthlyStats({ month, user = null }) {
    await ensureTable();

    const [y, m] = month.split('-').map(Number);
    const from = `${month}-01`;
    const to = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;

    const params = [from, to];
    let query = `
        SELECT
            tsp.agent_id,
            DATE(tsp.recorded_at)::text AS day,
            c."Nome" AS nome,
            c.regional AS regional,
            c.seccional AS seccional,
            c.estado AS estado,
            c."GESTOR IMEDIATO" AS gestor,
            COUNT(*)::int AS points,
            BOOL_OR(r.id IS NOT NULL) AS resolved,
            COALESCE(BOOL_OR(r.is_valid), FALSE) AS valid_resolution
        FROM tracking_session_points tsp
        INNER JOIN colaboradores c ON UPPER(c."ID") = UPPER(tsp.agent_id)
        LEFT JOIN speed_violation_resolutions r
            ON r.agent_id = tsp.agent_id
           AND r.resolved_date = tsp.recorded_at::date
        WHERE tsp.is_speed_violation = TRUE
          AND tsp.recorded_at >= $1
          AND tsp.recorded_at < $2
          AND (tsp.speed IS NULL OR tsp.speed <= 120)
        GROUP BY tsp.agent_id, day, c."Nome", c.regional, c.seccional, c.estado, c."GESTOR IMEDIATO"
        ORDER BY day ASC`;

    if (user && !userIsAdmin(user)) {
        const filter = getColaboradoresFilter(user, { includeAllStates: true });
        if (filter.allowedStates.length > 0) {
            params.push(filter.allowedStates);
            query += ` AND c.estado = ANY($${params.length})`;
        } else {
            return {
                month,
                summary: { total: 0, resolved: 0, pending: 0, resolutionRate: 0 },
                perDay: [],
                perRegional: [],
                perState: [],
                perSeccional: [],
                topAgents: [],
                daysTracked: 0,
                avgPerDay: 0,
            };
        }
    }

    const { rows } = await cenos_pool.query(query, params);

    let units = rows;

    if (user && !userIsAdmin(user)) {
        units = rows.filter(r => {
            const agentData = {
                id: r.agent_id,
                nome: r.nome,
                regional: r.regional,
                seccional: r.seccional,
                gestor: r.gestor,
                estado: r.estado,
            };
            return checkAgentPermission(agentData, user);
        });
    }

    const total = units.length;
    const resolvedCount = units.filter(u => u.resolved).length;
    const pendingCount = total - resolvedCount;

    const groupBy = (key) => {
        const map = new Map();
        for (const u of units) {
            const k = u[key] || 'Sem ' + key;
            const e = map.get(k) || { total: 0, resolved: 0, pending: 0 };
            e.total += 1;
            if (u.resolved) e.resolved += 1;
            else e.pending += 1;
            map.set(k, e);
        }
        return Array.from(map.entries()).map(([name, v]) => ({ name, ...v }));
    };

    const dayMap = new Map();
    for (const u of units) {
        const e = dayMap.get(u.day) || { day: u.day, total: 0, resolved: 0, pending: 0 };
        e.total += 1;
        if (u.resolved) e.resolved += 1;
        else e.pending += 1;
        dayMap.set(u.day, e);
    }
    const perDay = Array.from(dayMap.values()).sort((a, b) => a.day.localeCompare(b.day));

    const perRegional = groupBy('regional').sort((a, b) => b.total - a.total);
    const perState = groupBy('estado').sort((a, b) => b.total - a.total);
    const perSeccional = groupBy('seccional').sort((a, b) => b.total - a.total);

    const agentMap = new Map();
    for (const u of units) {
        const e = agentMap.get(u.agent_id) || { agent_id: u.agent_id, nome: u.nome || u.agent_id, total: 0, resolved: 0, pending: 0, points: 0 };
        e.total += 1;
        if (u.resolved) e.resolved += 1;
        else e.pending += 1;
        e.points += u.points;
        agentMap.set(u.agent_id, e);
    }
    const topAgents = Array.from(agentMap.values())
        .sort((a, b) => b.points - a.points || b.total - a.total)
        .slice(0, 10);

    const daysTracked = dayMap.size;

    return {
        month,
        summary: {
            total,
            resolved: resolvedCount,
            pending: pendingCount,
            resolutionRate: total > 0 ? Math.round((resolvedCount / total) * 1000) / 10 : 0,
        },
        perDay,
        perRegional,
        perState,
        perSeccional,
        topAgents,
        daysTracked,
        avgPerDay: total > 0 ? Math.round((total / daysTracked) * 10) / 10 : 0,
    };
}

module.exports = {
    ensureTable,
    resolveSpeedViolation,
    updateSpeedViolationResolution,
    deleteSpeedViolationResolution,
    listSpeedViolationResolutions,
    getSpeedViolationsResolvable,
    getSpeedViolationMonthlyStats,
};
