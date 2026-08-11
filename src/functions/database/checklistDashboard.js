const { cenos_pool } = require('../../db');
const { getUserAllowedStatePools, getColaboradoresFilter, userIsAdmin, buildUserPermissionSQL } = require('./admin');
const { getExemptAgentIds, countActiveExemptions, listActiveExemptions } = require('./agentExemptions');
const { batchGetResolutions, batchGetResolutionsFull } = require('./nonconformityResolutions');

/** Returns today's date as 'YYYY-MM-DD' in local time. */
function getTodayStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Converte as permissões do usuário em condições SQL para filtrar a tabela `colaboradores col`.
 * Usa getColaboradoresFilter do admin.js para suportar múltiplas permissões
 * de estado, regional, seccional e gestor corretamente.
 * Retorna { conditions, params, idx }.
 */


async function getDashboardFilterOptions() {
  const regionais = await cenos_pool.query(
    `SELECT DISTINCT regional FROM colaboradores WHERE regional IS NOT NULL ORDER BY regional`
  );
  const seccionais = await cenos_pool.query(
    `SELECT DISTINCT seccional FROM colaboradores WHERE seccional IS NOT NULL ORDER BY seccional`
  );
  const estados = await cenos_pool.query(
    `SELECT DISTINCT estado FROM colaboradores WHERE estado IS NOT NULL ORDER BY estado`
  );
  const gestores = await cenos_pool.query(
    `SELECT DISTINCT "GESTOR IMEDIATO" as gestor FROM colaboradores WHERE "GESTOR IMEDIATO" IS NOT NULL ORDER BY gestor`
  );

  return {
    regionais: regionais.rows.map(r => r.regional),
    seccionais: seccionais.rows.map(r => r.seccional),
    estados: estados.rows.map(r => r.estado),
    gestores: gestores.rows.map(r => r.gestor),
  };
}

function buildDateFilter({ date_from, date_to, params, idx }) {
  const today = new Date().toISOString().split('T')[0];
  const from = date_from || today;
  const to = date_to || today;
  params.push(from, to);
  return { filters: [`c.date >= $${idx}`, `c.date <= $${idx + 1}`], nextIdx: idx + 2 };
}

function buildColaboradorJoins() {
  return `LEFT JOIN colaboradores col ON c.agent_id = col."ID" LEFT JOIN checklist_templates t ON c.template_id = t.id`;
}

function buildColaboradorFilters({ regional, sectional, estado, gestor, agent_name, params, idx, user }) {
  const filters = [];
  if (regional) { filters.push(`col.regional = $${idx}`); params.push(regional); idx++; }
  if (sectional) { filters.push(`col.seccional = $${idx}`); params.push(sectional); idx++; }
  if (estado) { filters.push(`col.estado = $${idx}`); params.push(estado); idx++; }
  if (gestor) { filters.push(`col."GESTOR IMEDIATO" = $${idx}`); params.push(gestor); idx++; }
  if (agent_name) { filters.push(`col."Nome" ILIKE $${idx}`); params.push(`%${agent_name}%`); idx++; }

  const perm = buildUserPermissionSQL(user, params, idx);
  if (perm.conditions.length > 0) {
    filters.push(...perm.conditions);
  }
  idx = perm.idx;

  return { filters, idx };
}

async function getDashboardStats({date_from, date_to, regional, sectional, estado, gestor, checklist_kind}, user) {
  const dParams = [];
  let dIdx = 1;
  const dateFilter = buildDateFilter({ date_from, date_to, params: dParams, idx: dIdx });
  const dateFilters = dateFilter.filters;
  dIdx = dateFilter.nextIdx;

  const colJoin = buildColaboradorJoins(checklist_kind || (typeof req !== "undefined" && req.query.checklist_kind) || undefined);
  const { filters: colFilters, idx: colIdx } = buildColaboradorFilters({
    regional, sectional, estado, gestor, params: dParams, idx: dIdx, user
      });
  dIdx = colIdx;

  const cFilters = [`c.status = 'submitted'${checklist_kind === 'gestor' ? " AND (COALESCE(t.is_gestor, false) = true OR c.type = 'gestor' OR c.target_agent_id IS NOT NULL)" : " AND COALESCE(t.is_gestor, false) = false AND c.type != 'gestor' AND c.target_agent_id IS NULL"}`, ...dateFilters, ...colFilters];
  const cWhere = `WHERE ${cFilters.join(' AND ')}`;

  const { agentIds } = await getV2TemplateAndAgentIds({ date_from, date_to, checklist_kind }, user);
  if (agentIds.length === 0) {
    return {
      activeAgents: 0,
      totalChecklists: 0,
      compliantChecklists: 0,
      nonCompliantChecklists: 0,
      complianceRate: 0,
      regionals: [],
      pendingList: []
    };
  }

  const [activeAgentsRes, totalRes, compliantRes, nonCompliantRes, regionalRes, pendingRes] = await Promise.all([
    cenos_pool.query(
      `SELECT COUNT(*) as total FROM colaboradores
       WHERE situacao = 'active' AND status = true
         AND "ID" = ANY($1::varchar[])`,
      [agentIds]
    ),
    cenos_pool.query(
      `SELECT COUNT(*) as total FROM checklists c ${colJoin} ${cWhere}`, dParams
    ),
    cenos_pool.query(
      `SELECT COUNT(*) as total FROM checklists c ${colJoin}
       ${cWhere} AND ((c.data->'compliance_summary'->>'non_compliant')::int) = 0`,
      dParams
    ),
    cenos_pool.query(
      `SELECT COUNT(*) as total FROM checklists c ${colJoin}
       ${cWhere} AND ((c.data->'compliance_summary'->>'non_compliant')::int) > 0`,
      dParams
    ),
    cenos_pool.query(
      `SELECT
         col.regional,
         COUNT(DISTINCT col."ID") as total_agents,
         COUNT(DISTINCT CASE WHEN c.id IS NOT NULL THEN col."ID" END) as submitted,
         COUNT(DISTINCT CASE WHEN c.id IS NULL THEN col."ID" END) as pending
       FROM colaboradores col
       LEFT JOIN checklists c ON c.agent_id = col."ID" AND c.date >= $1 AND c.date <= $2 AND c.status = 'submitted'
       WHERE col.situacao = 'active' AND col.status = true
         AND col.regional IS NOT NULL
         AND col."ID" = ANY($3::varchar[])
       GROUP BY col.regional
       ORDER BY col.regional`,
      [dParams[0], dParams[1], agentIds]
    ),
    cenos_pool.query(
      `SELECT col."ID" as agent_id, col."Nome" as nome, col.regional, col.seccional, col.estado, col."Cargo" as cargo
       FROM colaboradores col
       WHERE col.situacao = 'active' AND col.status = true
         AND col."ID" = ANY($3::varchar[])
         AND NOT EXISTS (
           SELECT 1 FROM checklists c
           WHERE c.agent_id = col."ID" AND c.date >= $1 AND c.date <= $2 AND c.status = 'submitted'
         )
       ORDER BY col."Nome"`,
      [dParams[0], dParams[1], agentIds]
    ),
  ]);

  const activeAgents = parseInt(activeAgentsRes.rows[0].total, 10);
  const totalChecklists = parseInt(totalRes.rows[0].total, 10);
  const compliantChecklists = parseInt(compliantRes.rows[0].total, 10);
  const nonCompliantChecklists = parseInt(nonCompliantRes.rows[0].total, 10);
  const complianceRate = totalChecklists > 0
    ? Math.round((compliantChecklists / totalChecklists) * 100)
    : 0;

  const regionalBreakdown = regionalRes.rows.map(r => ({
    regional: r.regional,
    total_agents: parseInt(r.total_agents, 10),
    submitted: parseInt(r.submitted, 10),
    pending: parseInt(r.pending, 10),
    percentage: r.total_agents > 0 ? Math.round((parseInt(r.pending, 10) / parseInt(r.total_agents, 10)) * 100) : 0,
  }));

  return {
    active_agents: activeAgents,
    total_checklists: totalChecklists,
    compliant: compliantChecklists,
    non_compliant: nonCompliantChecklists,
    compliance_rate: complianceRate,
    regional_breakdown: regionalBreakdown,
    pending_agents: pendingRes.rows,
  };
}

async function getDashboardNonCompliantItems({date_from, date_to, regional, sectional, estado, gestor, checklist_kind}, user) {
  const dParams = [];
  let dIdx = 1;
  const dateFilter = buildDateFilter({ date_from, date_to, params: dParams, idx: dIdx });
  const dateFilters = dateFilter.filters;
  dIdx = dateFilter.nextIdx;

  const colJoin = buildColaboradorJoins(checklist_kind || (typeof req !== "undefined" && req.query.checklist_kind) || undefined);
  const { filters: colFilters, idx: colIdx } = buildColaboradorFilters({
    regional, sectional, estado, gestor, params: dParams, idx: dIdx, user
      });
  dIdx = colIdx;

  const cFilters = [`c.status = 'submitted'${checklist_kind === 'gestor' ? " AND (COALESCE(t.is_gestor, false) = true OR c.type = 'gestor' OR c.target_agent_id IS NOT NULL)" : " AND COALESCE(t.is_gestor, false) = false AND c.type != 'gestor' AND c.target_agent_id IS NULL"}`, ...dateFilters, ...colFilters];
  const cWhere = `WHERE ${cFilters.join(' AND ')}`;

  const { rows } = await cenos_pool.query(
    `SELECT a.item->>'question_label' as label, COUNT(*) as count
     FROM checklists c
     ${colJoin},
     jsonb_array_elements(c.data->'answers') a(item)
     ${cWhere} AND a.item->>'is_compliant' = 'false'
     GROUP BY a.item->>'question_label'
     ORDER BY count DESC
     LIMIT 20`,
    dParams
  );

  return rows.map(r => ({ label: r.label, count: parseInt(r.count, 10) }));
}

async function getDashboardAlerts({date_from, date_to, regional, sectional, estado, gestor, checklist_kind}, user) {
  const dParams = [];
  let dIdx = 1;
  const dateFilter = buildDateFilter({ date_from, date_to, params: dParams, idx: dIdx });
  const dateFilters = dateFilter.filters;
  dIdx = dateFilter.nextIdx;

  const colJoin = buildColaboradorJoins(checklist_kind || (typeof req !== "undefined" && req.query.checklist_kind) || undefined);
  const { filters: colFilters, idx: colIdx } = buildColaboradorFilters({
    regional, sectional, estado, gestor, params: dParams, idx: dIdx, user
      });
  dIdx = colIdx;

  const cFilters = [`c.status = 'submitted'${checklist_kind === 'gestor' ? " AND (COALESCE(t.is_gestor, false) = true OR c.type = 'gestor' OR c.target_agent_id IS NOT NULL)" : " AND COALESCE(t.is_gestor, false) = false AND c.type != 'gestor' AND c.target_agent_id IS NULL"}`, ...dateFilters, ...colFilters];
  const cWhere = `WHERE ${cFilters.join(' AND ')}`;

  const { rows } = await cenos_pool.query(
    `SELECT c.id as checklist_id, c.agent_id, col."Nome" as agent_nome,
            a.item->>'question_label' as question, a.item->>'severity' as severity,
            c.date, a.item->>'observation' as observation,
            a.item->>'photo_url' as photo_url
     FROM checklists c
     ${colJoin},
     jsonb_array_elements(c.data->'answers') a(item)
     ${cWhere}
       AND a.item->>'is_compliant' = 'false'
       AND a.item->>'severity' IN ('critical', 'alert')
     ORDER BY c.date DESC, severity ASC
     LIMIT 50`,
    dParams
  );

  return rows;
}

async function listDashboardChecklists({
  page = 1, limit = 15, agent_name, date_from, date_to,
  type, compliance_filter, status,
  regional, sectional, estado, gestor, checklist_kind
}, user) {
  const offset = (page - 1) * limit;
  const params = [];
  let idx = 1;

  const dateFilter = buildDateFilter({ date_from, date_to, params, idx });
  const dateFilters = dateFilter.filters;
  idx = dateFilter.nextIdx;

  const colJoin = buildColaboradorJoins(checklist_kind || (typeof req !== "undefined" && req.query.checklist_kind) || undefined);
  const { filters: colFilters, idx: colIdx } = buildColaboradorFilters({
    regional, sectional, estado, gestor, agent_name, params, idx, user
      });
  idx = colIdx;

  const filters = [...dateFilters, ...colFilters];
  if (typeof checklist_kind !== 'undefined') { if (checklist_kind === 'gestor') { filters.push("(COALESCE(t.is_gestor, false) = true OR c.type = 'gestor' OR c.target_agent_id IS NOT NULL)"); } else { filters.push("COALESCE(t.is_gestor, false) = false AND c.type != 'gestor' AND c.target_agent_id IS NULL"); } }

  if (type) { filters.push(`c.type = $${idx}`); params.push(type); idx++; }
  if (status) { filters.push(`c.status = $${idx}`); params.push(status); idx++; }
  
  if (compliance_filter === 'compliant') {
    filters.push(`((c.data->'compliance_summary'->>'non_compliant')::int) = 0`);
  } else if (compliance_filter === 'non_compliant') {
    filters.push(`((c.data->'compliance_summary'->>'non_compliant')::int) > 0`);
    filters.push(`c.has_critical_non_compliant = false`);
    filters.push(`NOT EXISTS (SELECT 1 FROM jsonb_array_elements(c.data->'answers') a WHERE a->>'is_compliant' = 'false' AND a->>'severity' = 'alert')`);
  } else if (compliance_filter === 'attention') {
    filters.push(`((c.data->'compliance_summary'->>'non_compliant')::int) > 0`);
    filters.push(`EXISTS (SELECT 1 FROM jsonb_array_elements(c.data->'answers') a WHERE a->>'is_compliant' = 'false' AND a->>'severity' = 'alert')`);
  } else if (compliance_filter === 'critical') {
    filters.push(`c.has_critical_non_compliant = true`);
  }

  if (agent_name && !regional && !sectional && !estado && !gestor) {
    // If agent_name was given but no colJoin filter was added, add it here
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  const query = `
    SELECT c.id, c.agent_id, c.type, c.date, c.status, c.has_critical_non_compliant,
           c.submitted_at, c.local_id, c.parent_checklist_id, t.title as template_title,
           c.data->'compliance_summary' as compliance_summary,
           col."Nome" as agent_nome, col."Cargo" as agent_cargo,
           col.regional as agent_regional, col.seccional as agent_seccional,
           col.estado as agent_estado, col."GESTOR IMEDIATO" as agent_gestor
    FROM checklists c
    ${colJoin}
    ${whereClause}
    ORDER BY c.submitted_at DESC, c.date DESC
    LIMIT $${idx} OFFSET $${idx + 1}
  `;
  const countQuery = `SELECT count(1) as total FROM checklists c
    ${colJoin} ${whereClause}`;

  const { rows } = await cenos_pool.query(query, [...params, limit, offset]);
  const countRes = await cenos_pool.query(countQuery, params);
  const total = parseInt(countRes.rows[0].total, 10);

  const enriched = rows.map(r => {
    let summary = { total: 0, compliant: 0, non_compliant: 0, exempt: 0 };
    if (r.compliance_summary) {
      try {
        const parsed = typeof r.compliance_summary === 'string'
          ? JSON.parse(r.compliance_summary)
          : r.compliance_summary;
        summary = { ...summary, ...parsed };
      } catch {}
    }
    return {
      ...r,
      compliant_count: summary.compliant || 0,
      non_compliant_count: summary.non_compliant || 0,
      total_count: summary.total || 0,
    };
  });

  return { data: enriched, total, page, limit, totalPages: Math.ceil(total / limit) };
}

async function getDashboardPendingAgents({date_from, date_to, agent_name, regional, sectional, estado, gestor,
  page = 1, limit = 20, checklist_kind}, user) {
  const { agentIds } = await getV2TemplateAndAgentIds({ date_from, date_to, checklist_kind }, user);
  if (agentIds.length === 0) {
    return { data: [], total: 0, page, limit, totalPages: 0 };
  }

  const offset = (page - 1) * limit;
  const today = new Date().toISOString().split('T')[0];
  const from = date_from || today;
  const to = date_to || today;

  const params = [];
  let idx = 1;

  // $1 = array de IDs elegíveis
  params.push(agentIds);
  idx++;

  // $2 = date_from, $3 = date_to
  const dateIdx1 = idx;
  params.push(from);
  idx++;
  const dateIdx2 = idx;
  params.push(to);
  idx++;

  // Filtros adicionais (nome, regional, seccional, estado, gestor)
  const filters = [];
  if (typeof checklist_kind !== 'undefined') { if (checklist_kind === 'gestor') { filters.push("(COALESCE(t.is_gestor, false) = true OR c.type = 'gestor' OR c.target_agent_id IS NOT NULL)"); } else { filters.push("COALESCE(t.is_gestor, false) = false AND c.type != 'gestor' AND c.target_agent_id IS NULL"); } }
  if (agent_name) { filters.push(`col."Nome" ILIKE $${idx}`); params.push(`%${agent_name}%`); idx++; }
  if (regional) { filters.push(`col.regional = $${idx}`); params.push(regional); idx++; }
  if (sectional) { filters.push(`col.seccional = $${idx}`); params.push(sectional); idx++; }
  if (estado) { filters.push(`col.estado = $${idx}`); params.push(estado); idx++; }
  if (gestor) { filters.push(`col."GESTOR IMEDIATO" = $${idx}`); params.push(gestor); idx++; }

  // Aplica filtros de permissão do usuário
  const perm = buildUserPermissionSQL(user, params, idx);
  if (perm.conditions.length > 0) filters.push(...perm.conditions);
  idx = perm.idx;

  const filterWhere = filters.length > 0 ? `AND ${filters.join(' AND ')}` : '';
  const limitIdx = idx;
  params.push(limit, offset);

  const baseWhere = `
    col.situacao = 'active' AND col.status = true
    AND col."ID" = ANY($1::varchar[])
    AND NOT EXISTS (
      SELECT 1 FROM checklists c
      WHERE c.agent_id = col."ID"
        AND c.date >= $${dateIdx1} AND c.date <= $${dateIdx2}
        AND c.status = 'submitted'
    )
    ${filterWhere}
  `;

  const query = `
    SELECT col."ID" as agent_id, col."Nome" as nome, col.regional, col.seccional,
           col.estado, col."Cargo" as cargo, col."GESTOR IMEDIATO" as gestor
    FROM colaboradores col
    WHERE ${baseWhere} ${filterWhere}
    ORDER BY col."Nome"
    LIMIT $${limitIdx} OFFSET $${limitIdx + 1}
  `;

  const countQuery = `
    SELECT COUNT(*) as total
    FROM colaboradores col
    WHERE ${baseWhere} ${filterWhere}
  `;

  // countQuery não usa limit/offset
  const countParams = params.slice(0, -2);

  const [dataRes, countRes] = await Promise.all([
    cenos_pool.query(query, params),
    cenos_pool.query(countQuery, countParams),
  ]);

  return {
    data: dataRes.rows,
    total: parseInt(countRes.rows[0].total, 10),
    page,
    limit,
    totalPages: Math.ceil(parseInt(countRes.rows[0].total, 10) / limit),
  };
}

// ==========================================
// V2 — Dynamic Template-Based Dashboard
// ==========================================

/**
 * Returns all active templates for dashboard filter dropdown.
 * Respects admin state permissions.
 */
async function getDashboardTemplates(user, checklist_kind) {
  const allowedPools = getUserAllowedStatePools(user);
  const allowedStates = allowedPools.map(p => p.state.toUpperCase());

  const isMainAdmin = user && (user.role || '').toLowerCase().includes('admin') && allowedPools.length >= 2;

  if (isMainAdmin) {
    const { rows } = await cenos_pool.query(
      `SELECT id, title, estado FROM checklist_templates WHERE is_active = true${checklist_kind === 'gestor' ? ' AND COALESCE(is_gestor, false) = true' : ' AND COALESCE(is_gestor, false) = false'} ORDER BY title`
    );
    return rows;
  }

  const { rows } = await cenos_pool.query(
    `SELECT id, title, estado FROM checklist_templates
     WHERE is_active = true AND (estado IS NULL OR UPPER(estado) = ANY($1::varchar[]))
     ORDER BY title`,
    [allowedStates]
  );
  return rows;
}

/**
 * Helper: given a template's data.filters, return SQL WHERE conditions for matching colaboradores.
 * Returns { conditions: string[], params: any[], idx: number }
 */
function buildTemplateAgentMatchSQL(templateData, params, idx) {
  const conditions = [];
  const filters = templateData?.data?.filters;
  if (!filters) return { conditions, params, idx };

  if (filters.cargo?.length) {
    conditions.push(`UPPER(TRIM(col."Cargo")) = ANY($${idx}::varchar[])`);
    params.push(filters.cargo.map(c => c.toUpperCase()));
    idx++;
  }
  if (filters.regional?.length) {
    conditions.push(`col.regional = ANY($${idx}::varchar[])`);
    params.push(filters.regional);
    idx++;
  }
  if (filters.seccional?.length) {
    conditions.push(`col.seccional = ANY($${idx}::varchar[])`);
    params.push(filters.seccional);
    idx++;
  }
  if (filters.processo?.length) {
    conditions.push(`col."processo" = ANY($${idx}::varchar[])`);
    params.push(filters.processo);
    idx++;
  }
  return { conditions, params, idx };
}

/**
 * Helper: get all active agent IDs that match ANY of the given templates.
 * Returns a Set of agent ID strings.
 */
async function getAgentsMatchingTemplates(templates, user, date_from, date_to, onlyInactive = false, excludeGestores = false) {
  const from = date_from || getTodayStr();
  const to = date_to || getTodayStr();
  const allAgentIds = new Set();
  const gestorCond = excludeGestores ? " AND COALESCE(col.is_gestor, false) = false" : "";
  const statusCond = (onlyInactive
    ? "(col.situacao != 'active' OR col.status = false)"
    : "col.situacao = 'active' AND col.status = true") + gestorCond;

  for (const tmpl of templates) {
    const params = [];
    let idx = 1;
    const match = buildTemplateAgentMatchSQL(tmpl, params, idx);
    idx = match.idx;

    const perm = buildUserPermissionSQL(user, params, idx);
    idx = perm.idx;

    let estadoClause = '';
    if (tmpl.estado) {
      estadoClause = `AND UPPER(col.estado) = UPPER($${idx})`;
      params.push(tmpl.estado);
      idx++;
    }

    if (match.conditions.length === 0 && !estadoClause && perm.conditions.length === 0) {
      const { rows } = await cenos_pool.query(
        `SELECT col."ID" FROM colaboradores col WHERE ${statusCond}`
      );
      rows.forEach(r => allAgentIds.add(r.ID));
      continue;
    }

    const whereClause = [statusCond];
    if (match.conditions.length > 0) whereClause.push(match.conditions.join(' AND '));
    if (perm.conditions.length > 0) whereClause.push(perm.conditions.join(' AND '));
    if (estadoClause) whereClause.push(estadoClause.replace('AND ', ''));

    let extWhere = '';
    if (!onlyInactive) {
      params.push(from, to);
      const d1 = idx++;
      const d2 = idx++;
      extWhere = `
        AND NOT EXISTS (
          SELECT 1 FROM agent_exemptions ae
          WHERE ae.agent_id = col."ID"
            AND ae.start_date <= $${d2}::date AND ae.end_date >= $${d1}::date
        )
      `;
    }

    const { rows } = await cenos_pool.query(
      `SELECT col."ID" FROM colaboradores col WHERE ${whereClause.join(' AND ')} ${extWhere}`,
      params
    );
    rows.forEach(r => allAgentIds.add(r.ID));
  }

  return allAgentIds;
}

/**
 * Compute regional breakdown for V2: group template-matched agents by regional.
 */
async function computeV2RegionalBreakdown(templates, date_from, date_to, user) {
  const todayStr = new Date().toISOString().split('T')[0];
  const from = date_from || todayStr;
  const to = date_to || todayStr;

  const agentIdSet = await getAgentsMatchingTemplates(templates, user, from, to);
  if (agentIdSet.size === 0) return [];

  const agentIds = Array.from(agentIdSet);

  const { rows } = await cenos_pool.query(
    `SELECT
       col.regional,
       COUNT(DISTINCT col."ID") as total_agents,
       COUNT(DISTINCT CASE WHEN c.id IS NOT NULL THEN col."ID" END) as submitted,
       COUNT(DISTINCT CASE WHEN c.id IS NULL THEN col."ID" END) as pending
     FROM colaboradores col
     LEFT JOIN checklists c ON c.agent_id = col."ID"
       AND c.date >= $2 AND c.date <= $3
       AND c.status = 'submitted'
     WHERE col.situacao = 'active' AND col.status = true
       AND col.regional IS NOT NULL
       AND col."ID" = ANY($1::varchar[])
       AND NOT EXISTS (
         SELECT 1 FROM agent_exemptions ae
         WHERE ae.agent_id = col."ID"
           AND ae.start_date <= $3::date AND ae.end_date >= $2::date
       )
     GROUP BY col.regional
     ORDER BY col.regional`,
    [agentIds, from, to]
  );

  return rows.map(r => ({
    regional: r.regional,
    total_agents: parseInt(r.total_agents, 10),
    submitted: parseInt(r.submitted, 10),
    pending: parseInt(r.pending, 10),
    percentage: r.total_agents > 0
      ? Math.round((parseInt(r.pending, 10) / parseInt(r.total_agents, 10)) * 100)
      : 0,
  }));
}

/**
 * Get template IDs that the user is allowed to see.
 * Returns array of { id, title, data, estado }.
 */
async function getAllowedTemplates(user, checklist_kind) {
  // Admin users see all active templates regardless of estado
  if (user && (user.role || '').toLowerCase().includes('admin')) {
    const { rows } = await cenos_pool.query(
      `SELECT id, title, data, estado FROM checklist_templates WHERE is_active = true${checklist_kind === 'gestor' ? ' AND COALESCE(is_gestor, false) = true' : ' AND COALESCE(is_gestor, false) = false'}`
    );
    return rows;
  }

  // Non-admin users are filtered by their estado permissions
  const allowedPools = getUserAllowedStatePools(user);
  const allowedStates = allowedPools.map(p => p.state.toUpperCase());

  if (allowedStates.length === 0) return [];

  const { rows } = await cenos_pool.query(
    `SELECT id, title, data, estado FROM checklist_templates
     WHERE is_active = true AND (estado IS NULL OR UPPER(estado) = ANY($1::varchar[]))
     ORDER BY title`,
    [allowedStates]
  );
  return rows;
}

/**
 * V2 Stats — uses dynamic template filters instead of hardcoded cargos.
 * If template_id is provided, stats are per-template; otherwise aggregated.
 * Respects admin state permissions via getUserAllowedStatePools.
 */
async function getDashboardStatsV2({date_from, date_to, regional, sectional, estado, gestor, template_id, checklist_kind}, user) {
  let templateIds = [];
  let templatesMap = {};

  if (template_id) {
    const { rows } = await cenos_pool.query(
      `SELECT id, title, data, estado FROM checklist_templates WHERE id = $1 AND is_active = true`, [template_id]
    );
    if (rows.length === 0) return null;
    templateIds = [template_id];
    templatesMap[template_id] = rows[0];
  } else {
    const allowedTemplates = await getAllowedTemplates(user, checklist_kind);
    templateIds = allowedTemplates.map(r => r.id);
    allowedTemplates.forEach(r => { templatesMap[r.id] = r; });
  }

  if (templateIds.length === 0) {
    return { active_agents: 0, total_checklists: 0, compliant: 0, non_compliant: 0, compliance_rate: 0, templates_breakdown: [], regional_breakdown: [], pending_agents: [] };
  }

  // Build agent filter conditions (from admin panel filters)
  const dParams = [];
  let dIdx = 1;
  const dateFilter = buildDateFilter({ date_from, date_to, params: dParams, idx: dIdx });
  const dateFilters = dateFilter.filters;
  dIdx = dateFilter.nextIdx;

  const colJoin = buildColaboradorJoins(checklist_kind || (typeof req !== "undefined" && req.query.checklist_kind) || undefined);
  const { filters: colFilters, idx: colIdx } = buildColaboradorFilters({
    regional, sectional, estado, gestor, params: dParams, idx: dIdx, user
      });
  dIdx = colIdx;

  // Stats per template
  const templatesBreakdown = [];

  for (const tId of templateIds) {
    const tmpl = templatesMap[tId];

    // Create a copy of global params (which include dates, user permissions, and UI filters)
    const tParams = [...dParams];
    let tIdx = dIdx;

    // Append template specific match conditions
    const tMatch = buildTemplateAgentMatchSQL(tmpl, tParams, tIdx);
    tIdx = tMatch.idx;

    // Check if template has its own estado restriction
    let estadoCondition = '';
    if (tmpl.estado) {
      estadoCondition = `UPPER(col.estado) = UPPER($${tIdx})`;
      tParams.push(tmpl.estado);
      tIdx++;
    }

    // Combine all agent filtering conditions: Template matches + UI Filters + User Permissions + Template Estado
    const combinedColFilters = [...colFilters];
    if (tMatch.conditions.length > 0) combinedColFilters.push(...tMatch.conditions);
    if (estadoCondition) combinedColFilters.push(estadoCondition);
    if (checklist_kind === 'gestor') {
      combinedColFilters.push("COALESCE(col.is_gestor, false) = false");
    }

    const colWhereClause = combinedColFilters.length > 0 ? `AND ${combinedColFilters.join(' AND ')}` : '';

    // Active agents matching this template AND user permissions AND UI filters
    const activeRes = await cenos_pool.query(
      `SELECT COUNT(*) as total FROM colaboradores col
       WHERE col.situacao = 'active' AND col.status = true AND $1::text=$1::text AND $2::text=$2::text ${colWhereClause}
       AND NOT EXISTS (
         SELECT 1 FROM agent_exemptions ae
         WHERE ae.agent_id = col."ID"
           AND ae.start_date <= $2::date AND ae.end_date >= $1::date
       )`,
      tParams
    );
    const activeAgents = parseInt(activeRes.rows[0].total, 10);

    // Submitted checklists for this template (using colJoin so combinedColFilters can reference col.*)
    const combinedCFilters = [
      `c.template_id = $${tIdx}`,
      `c.status = 'submitted'${checklist_kind === 'gestor' ? " AND (COALESCE(t.is_gestor, false) = true OR c.type = 'gestor' OR c.target_agent_id IS NOT NULL)" : " AND COALESCE(t.is_gestor, false) = false AND c.type != 'gestor' AND c.target_agent_id IS NULL"}`,
      ...dateFilters,
      ...combinedColFilters
    ];
    tParams.push(tId);
    const templateIdIdx = tIdx;
    tIdx++;

    const submittedRes = await cenos_pool.query(
      `SELECT COUNT(c.id) as total FROM checklists c
       ${colJoin}
       WHERE ${combinedCFilters.join(' AND ')}`,
      tParams
    );
    const totalSubmitted = parseInt(submittedRes.rows[0].total, 10);

    // Compliant (zero non_compliant)
    const compliantRes = await cenos_pool.query(
      `SELECT COUNT(c.id) as total FROM checklists c
       ${colJoin}
       WHERE ${combinedCFilters.join(' AND ')}
       AND ((c.data->'compliance_summary'->>'non_compliant')::int) = 0`,
      tParams
    );
    const compliant = parseInt(compliantRes.rows[0].total, 10);
    const nonCompliant = totalSubmitted - compliant;

    templatesBreakdown.push({
      template_id: tId,
      template_title: tmpl.title,
      active_agents: activeAgents,
      total_checklists: totalSubmitted,
      compliant,
      non_compliant: nonCompliant,
      compliance_rate: totalSubmitted > 0 ? Math.round((compliant / totalSubmitted) * 100) : 0,
    });
  }

  // Aggregate across all templates for checklist stats
  const totalChecklists = templatesBreakdown.reduce((s, t) => s + t.total_checklists, 0);
  const totalCompliant = templatesBreakdown.reduce((s, t) => s + t.compliant, 0);
  const totalNonCompliant = templatesBreakdown.reduce((s, t) => s + t.non_compliant, 0);

  // Agent unique metrics: agents matched by any active template who have/haven't submitted all
  const todayStr = new Date().toISOString().split('T')[0];
  const pFrom = date_from || todayStr;
  const pTo = date_to || todayStr;

  let agentRequiredTemplates = {};

  for (const tId of templateIds) {
    const tmpl = templatesMap[tId];
    const params = [];
    let idx = 1;
    const match = buildTemplateAgentMatchSQL(tmpl, params, idx);
    idx = match.idx;

    const { filters: colFilters, idx: newIdx } = buildColaboradorFilters({
      regional, sectional, estado, gestor, agent_name: undefined, params, idx, user, checklist_kind
      });
    idx = newIdx;

    let estadoClause = '';
    if (tmpl.estado) {
      estadoClause = `UPPER(col.estado) = UPPER($${idx})`;
      params.push(tmpl.estado);
      idx++;
    }

    const combinedConditions = [...match.conditions, ...colFilters];
    if (estadoClause) combinedConditions.push(estadoClause);
    const whereClause = combinedConditions.length > 0 ? `AND ${combinedConditions.join(' AND ')}` : '';

    params.push(pFrom, pTo);
    const d1 = idx++;
    const d2 = idx++;
    const extWhere = `
      AND NOT EXISTS (
        SELECT 1 FROM agent_exemptions ae
        WHERE ae.agent_id = col."ID"
          AND ae.start_date <= $${d2}::date AND ae.end_date >= $${d1}::date
      )
    `;

    const isGestorFilter = checklist_kind === 'gestor' ? " AND COALESCE(col.is_gestor, false) = false" : "";
    const { rows } = await cenos_pool.query(
      `SELECT col."ID" as agent_id
       FROM colaboradores col
       WHERE col.situacao = 'active' AND col.status = true${isGestorFilter} ${whereClause} ${extWhere}`,
      params
    );

    for (const r of rows) {
      if (!agentRequiredTemplates[r.agent_id]) agentRequiredTemplates[r.agent_id] = [];
      agentRequiredTemplates[r.agent_id].push(tId);
    }
  }

  const agentIds = Object.keys(agentRequiredTemplates);
  let totalActive = agentIds.length;
  let totalCompleted = 0;
  let totalPending = 0;

  if (agentIds.length > 0) {
    const { rows: submittedRows } = await cenos_pool.query(
      `SELECT DISTINCT agent_id, template_id FROM checklists
       WHERE agent_id = ANY($1::varchar[])
         AND date >= $2 AND date <= $3
         AND status = 'submitted'
         AND template_id = ANY($4::uuid[])`,
      [agentIds, pFrom, pTo, templateIds]
    );

    let agentSubmittedTemplates = {};
    for (const r of submittedRows) {
      if (!agentSubmittedTemplates[r.agent_id]) agentSubmittedTemplates[r.agent_id] = new Set();
      agentSubmittedTemplates[r.agent_id].add(r.template_id);
    }

    for (const agentId of agentIds) {
      const required = agentRequiredTemplates[agentId];
      const submitted = agentSubmittedTemplates[agentId] || new Set();
      const missing = required.filter(tId => !submitted.has(tId));
      if (missing.length === 0) totalCompleted++;
      else totalPending++;
    }
  }

  // KPI: count of exempted agents considering UI filters and dates
  let exempted_count = 0;
  if (checklist_kind === 'gestor') {
    const inactiveAgentIdSet = await getAgentsMatchingTemplates(Object.values(templatesMap), user, pFrom, pTo, true, true);
    if (inactiveAgentIdSet.size > 0) {
      const inactiveAgentIds = Array.from(inactiveAgentIdSet);
      const paramsEx = [inactiveAgentIds];
      let idxEx = 2;
      const { filters: colFiltersEx } = buildColaboradorFilters({
        regional, sectional, estado, gestor, agent_name: undefined, params: paramsEx, idx: idxEx, user, checklist_kind
      });
      const exWhere = colFiltersEx.length > 0 ? `AND ${colFiltersEx.join(' AND ')}` : '';
      const exQuery = `SELECT COUNT(1) as total FROM colaboradores col WHERE col."ID" = ANY($1::varchar[]) AND COALESCE(col.is_gestor, false) = false ${exWhere}`;
      const exRes = await cenos_pool.query(exQuery, paramsEx);
      exempted_count = parseInt(exRes.rows[0].total || 0, 10);
    }
  } else {
    const exemptionsResult = await listActiveExemptions({
      date_from, date_to, regional, sectional, estado, gestor,
      page: 1, limit: 1
    }, user);
    exempted_count = exemptionsResult.total;
  }

  const refDate = date_to || new Date().toISOString().split('T')[0];
  const { isSunday } = await getExemptAgentIds(refDate);

  if (isSunday) {
    totalPending = 0;
    totalCompleted = 0; // Or whatever is appropriate for Sunday
  }

  return {
    active_agents: totalActive,
    pending_agents: totalPending,
    completed_agents: totalCompleted,
    exempted_agents: exempted_count,
    total_checklists: totalChecklists,
    compliant: totalCompliant,
    non_compliant: totalNonCompliant,
    compliance_rate: totalChecklists > 0 ? Math.round((totalCompliant / totalChecklists) * 100) : 0,
    templates_breakdown: templatesBreakdown,
  };
}

/**
 * V2 Pending Agents — uses template filter matching.
 * If template_id is provided, only finds agents matching that template.
 * Otherwise finds agents matching any active template.
 */
async function getDashboardPendingAgentsV2({date_from, date_to, agent_name, regional, sectional, estado, gestor,
  template_id, page = 1, limit = 20, checklist_kind}, user) {
  const offset = (page - 1) * limit;
  const today = new Date().toISOString().split('T')[0];
  const from = date_from || today;
  const to = date_to || today;

  // Get relevant template(s)
  let templates = [];
  if (template_id) {
    const { rows } = await cenos_pool.query(
      `SELECT id, title, data, estado FROM checklist_templates WHERE id = $1 AND is_active = true`, [template_id]
    );
    templates = rows;
  } else {
    templates = await getAllowedTemplates(user, checklist_kind);
  }

  if (templates.length === 0) {
    return { data: [], total: 0, page, limit, totalPages: 0 };
  }

  // For simplicity with complex SQL, fetch all matching agents in application code
  // Build unique constraint: agents matching ANY template's filters who haven't submitted
  const templateIds = templates.map(t => t.id);

  // First, get all active agents that match any template
  let agentDetails = {};
  // Track which templates each agent is required to answer
  let agentRequiredTemplates = {};
  // Track template titles for mapping later
  let templateTitles = {};

  for (const tmpl of templates) {
    templateTitles[tmpl.id] = tmpl.title;
    const params = [];
    let idx = 1;
    const match = buildTemplateAgentMatchSQL(tmpl, params, idx);
    idx = match.idx;

    const { filters: colFilters, idx: newIdx } = buildColaboradorFilters({
      regional, sectional, estado, gestor, agent_name, params, idx, user
      });
    idx = newIdx;

    let estadoClause = '';
    if (tmpl.data?.estado || tmpl.estado) {
      const est = tmpl.estado || tmpl.data?.estado;
      estadoClause = `UPPER(col.estado) = UPPER($${idx})`;
      params.push(est);
      idx++;
    }

    const combinedConditions = [...match.conditions, ...colFilters];
    if (estadoClause) combinedConditions.push(estadoClause);

    const whereClause = combinedConditions.length > 0 ? `AND ${combinedConditions.join(' AND ')}` : '';

    params.push(from, to);
    const d1 = idx++;
    const d2 = idx++;
    const extWhere = `
      AND NOT EXISTS (
        SELECT 1 FROM agent_exemptions ae
        WHERE ae.agent_id = col."ID"
          AND ae.start_date <= $${d2}::date AND ae.end_date >= $${d1}::date
      )
    `;

    const isGestorFilter = checklist_kind === 'gestor' ? " AND COALESCE(col.is_gestor, false) = false" : "";
    const { rows } = await cenos_pool.query(
      `SELECT col."ID" as agent_id, col."Nome" as nome, col.regional, col.seccional,
              col.estado, col."Cargo" as cargo, col."GESTOR IMEDIATO" as gestor
       FROM colaboradores col
       WHERE col.situacao = 'active' AND col.status = true${isGestorFilter} ${whereClause} ${extWhere}`,
      params
    );

    for (const r of rows) {
      agentDetails[r.agent_id] = r;
      if (!agentRequiredTemplates[r.agent_id]) {
        agentRequiredTemplates[r.agent_id] = [];
      }
      agentRequiredTemplates[r.agent_id].push(tmpl.id);
    }
  }

  // Now find which of these agents haven't submitted ALL their required templates
  const agentIds = Object.keys(agentRequiredTemplates);
  if (agentIds.length === 0) {
    return { data: [], total: 0, page, limit, totalPages: 0 };
  }

  const { rows: submittedRows } = await cenos_pool.query(
    `SELECT DISTINCT agent_id, template_id FROM checklists
     WHERE agent_id = ANY($1::varchar[])
       AND date >= $2 AND date <= $3
       AND status = 'submitted'
       AND template_id = ANY($4::uuid[])`,
    [agentIds, from, to, templateIds]
  );
  
  // Group submitted templates by agent
  let agentSubmittedTemplates = {};
  for (const r of submittedRows) {
    if (!agentSubmittedTemplates[r.agent_id]) {
      agentSubmittedTemplates[r.agent_id] = new Set();
    }
    agentSubmittedTemplates[r.agent_id].add(r.template_id);
  }

  const { isSunday } = await getExemptAgentIds(to);
  if (isSunday) {
    return { data: [], total: 0, page, limit, totalPages: 0, is_sunday: true };
  }

  let agentsList = [];

  for (const agentId of agentIds) {

    const required = agentRequiredTemplates[agentId];
    const submitted = agentSubmittedTemplates[agentId] || new Set();

    const missing = required.filter(tId => !submitted.has(tId));

    if (missing.length > 0) {
      const missingTitles = missing.map(tId => templateTitles[tId]);
      agentsList.push({
        ...agentDetails[agentId],
        status: 'pendente',
        missing_templates: missingTitles
      });
    }
  }

  // Apply additional text filters
  if (agent_name) {
    const q = agent_name.toLowerCase();
    agentsList = agentsList.filter(a => (a.nome || '').toLowerCase().includes(q));
  }
  if (regional) agentsList = agentsList.filter(a => a.regional === regional);
  if (sectional) agentsList = agentsList.filter(a => a.seccional === sectional);
  if (estado) agentsList = agentsList.filter(a => (a.estado || '').toUpperCase() === estado.toUpperCase());
  if (gestor) agentsList = agentsList.filter(a => a.gestor === gestor);

  const total = agentsList.length;
  const paged = agentsList.slice(offset, offset + limit);

  return {
    data: paged,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * V2 Completed Agents — Uses dynamic template filters.
 */
async function getDashboardCompletedAgentsV2({page = 1, limit = 20, agent_name, date_from, date_to,
  regional, sectional, estado, gestor, template_id, checklist_kind}, user) {
  const from = date_from || getTodayStr();
  const to = date_to || getTodayStr();
  const offset = (page - 1) * limit;

  let allowedTemplates = [];
  
  if (template_id) {
    const { rows } = await cenos_pool.query(
      `SELECT id, data, estado, title FROM checklist_templates WHERE id = $1 AND is_active = true`, [template_id]
    );
    if (rows.length > 0) allowedTemplates = rows;
  } else {
    allowedTemplates = await getAllowedTemplates(user, checklist_kind);
  }
  
  if (allowedTemplates.length === 0) {
    return { data: [], total: 0, page, limit, totalPages: 0 };
  }

  const { templateIds, agentIds: allowedAgentIds } = await getV2TemplateAndAgentIds({ template_id, date_from, date_to, checklist_kind }, user);

  if (templateIds.length === 0 || allowedAgentIds.length === 0) {
    return { data: [], total: 0, page, limit, totalPages: 0 };
  }

  const { rows: submittedRows } = await cenos_pool.query(
    `SELECT DISTINCT agent_id, template_id FROM checklists
     WHERE date >= $1 AND date <= $2
       AND status = 'submitted'
       AND template_id = ANY($3::uuid[])
       AND agent_id = ANY($4::varchar[])`,
    [from, to, templateIds, allowedAgentIds]
  );

  if (submittedRows.length === 0) {
    return { data: [], total: 0, page, limit, totalPages: 0 };
  }

  const agentSubmittedTemplates = {};
  const submittedAgentIdsSet = new Set();
  for (const r of submittedRows) {
    if (!agentSubmittedTemplates[r.agent_id]) {
      agentSubmittedTemplates[r.agent_id] = new Set();
    }
    agentSubmittedTemplates[r.agent_id].add(r.template_id);
    submittedAgentIdsSet.add(r.agent_id);
  }

  const submittedAgentIds = Array.from(submittedAgentIdsSet);

  const { rows: agentRows } = await cenos_pool.query(
    `SELECT col."ID" as agent_id, col."Nome" as nome, col.regional, col.seccional,
            col.estado, col."Cargo" as cargo, col."GESTOR IMEDIATO" as gestor
     FROM colaboradores col
     WHERE col."ID" = ANY($1::varchar[])
       ${checklist_kind === 'gestor' ? "AND COALESCE(col.is_gestor, false) = false" : ""}`,
    [submittedAgentIds]
  );

  const templateTitles = {};
  allowedTemplates.forEach(t => templateTitles[t.id] = t.title);

  let agentsList = agentRows.map(a => {
    const submitted = agentSubmittedTemplates[a.agent_id] || new Set();
    const submittedTitles = Array.from(submitted).map(tId => templateTitles[tId] || 'Checklist');
    return {
      ...a,
      status: 'completed',
      completed_templates: submittedTitles
    };
  });

  if (agent_name) {
    const q = agent_name.toLowerCase();
    agentsList = agentsList.filter(a => (a.nome || '').toLowerCase().includes(q));
  }
  if (regional) agentsList = agentsList.filter(a => a.regional === regional);
  if (sectional) agentsList = agentsList.filter(a => a.seccional === sectional);
  if (estado) agentsList = agentsList.filter(a => (a.estado || '').toUpperCase() === estado.toUpperCase());
  if (gestor) agentsList = agentsList.filter(a => a.gestor === gestor);

  const total = agentsList.length;
  const paged = agentsList.slice(offset, offset + limit);

  return {
    data: paged,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Helper: get template IDs and matching agent IDs for V2 queries.
 * Returns { templateIds, agentIds }.
 */
async function getV2TemplateAndAgentIds({template_id, date_from, date_to, checklist_kind}, user) {
  let templateIds = [];
  const excludeGestores = checklist_kind === 'gestor';

  if (template_id) {
    const { rows } = await cenos_pool.query(
      `SELECT id, data, estado FROM checklist_templates WHERE id = $1 AND is_active = true`, [template_id]
    );
    if (rows.length === 0) return { templateIds: [], agentIds: [] };
    templateIds = [template_id];
    const agentIdSet = await getAgentsMatchingTemplates(rows, user, date_from, date_to, false, excludeGestores);
    return { templateIds, agentIds: Array.from(agentIdSet) };
  }

  const allowedTemplates = await getAllowedTemplates(user, checklist_kind);
  if (allowedTemplates.length === 0) return { templateIds: [], agentIds: [] };

  templateIds = allowedTemplates.map(r => r.id);
  const agentIdSet = await getAgentsMatchingTemplates(allowedTemplates, user, date_from, date_to, false, excludeGestores);
  return { templateIds, agentIds: Array.from(agentIdSet) };
}

/**
 * V2 Non-Compliant Items — uses dynamic template filters.
 */
async function getDashboardNonCompliantItemsV2({date_from, date_to, regional, sectional, estado, gestor, agent_name, template_id, export_raw, checklist_kind}, user) {
  const { templateIds, agentIds } = await getV2TemplateAndAgentIds({ template_id, date_from, date_to, checklist_kind }, user);
  if (templateIds.length === 0 || agentIds.length === 0) return [];

  const dParams = [];
  let dIdx = 1;
  const dateFilter = buildDateFilter({ date_from, date_to, params: dParams, idx: dIdx });
  const dateFilters = dateFilter.filters;
  dIdx = dateFilter.nextIdx;

  const colJoin = buildColaboradorJoins(checklist_kind || (typeof req !== "undefined" && req.query.checklist_kind) || undefined);
  const { filters: colFilters, idx: colIdx } = buildColaboradorFilters({
    regional, sectional, estado, gestor, agent_name, params: dParams, idx: dIdx, user
      });
  dIdx = colIdx;

  const cFilters = [
    `c.status = 'submitted'${checklist_kind === 'gestor' ? " AND (COALESCE(t.is_gestor, false) = true OR c.type = 'gestor' OR c.target_agent_id IS NOT NULL)" : " AND COALESCE(t.is_gestor, false) = false AND c.type != 'gestor' AND c.target_agent_id IS NULL"}`,
    `c.template_id = ANY($${dIdx})`,
    `c.agent_id = ANY($${dIdx + 1})`,
    ...dateFilters,
    ...colFilters,
  ];
  dParams.push(templateIds, agentIds);
  dIdx += 2;
  const cWhere = `WHERE ${cFilters.join(' AND ')}`;

  if (export_raw) {
    const { rows } = await cenos_pool.query(
      `SELECT c.agent_id as "Agente",
              col."MAT" as "Matrícula",
              col."Nome" as "Nome",
              col.estado as "Estado",
              col.seccional as "Seccional",
              col.regional as "Regional",
              col."GESTOR IMEDIATO" as "Gestor",
              a.item->>'question_label' as "Item",
              COALESCE(a.item->>'severity', 'critical') as "Nível",
              TO_CHAR(c.date, 'DD/MM/YY') as "Data",
              TO_CHAR(c.submitted_at, 'DD/MM/YY "às" HH24:MI:SS') as "Enviado em",
              a.item->>'observation' as "Observação",
              CASE WHEN (a.item->>'photo_url') IS NOT NULL AND (a.item->>'photo_url') != '' THEN 'HYPERLINK|' || (a.item->>'photo_url') ELSE NULL END as "Foto",
              CASE WHEN r.id IS NOT NULL THEN 'Resolvido' ELSE 'Não resolvido' END as "Resolução",
              r.description as "Descrição da resolução",
              TO_CHAR(r.resolved_at, 'DD/MM/YY "às" HH24:MI:SS') as "Resolvido em"
       FROM checklists c
       ${colJoin}
       CROSS JOIN LATERAL jsonb_array_elements(c.data->'answers') a(item)
       LEFT JOIN checklist_nonconformity_resolutions r
         ON r.agent_id = c.agent_id
         AND r.question_label = a.item->>'question_label'
         AND r.resolved_date = c.date
       ${cWhere}
         AND (a.item->>'is_compliant' = 'false' OR (a.item->>'is_compliant')::boolean = false)
         AND COALESCE(a.item->>'severity', 'critical') IN ('critical', 'alert')
       ORDER BY COALESCE(c.submitted_at, c.date) DESC, "Nível" ASC
       LIMIT 5000`,
      dParams
    );

    let finalRows = rows;
    if (typeof export_mode !== 'undefined' && export_mode === 'compact') {
      const grouped = {};
      for (const row of rows) {
        const key = `${row.Agente}-${row.Item}-${row.Nível}`;
        if (!grouped[key]) {
          grouped[key] = { ...row, _dates: [row.Data] };
        } else {
          grouped[key]._dates.push(row.Data);
          if (!grouped[key].Foto && row.Foto) grouped[key].Foto = row.Foto;
          if (grouped[key].Resolução === 'Não resolvido' && row.Resolução === 'Resolvido') {
             grouped[key].Resolução = row.Resolução;
             grouped[key]['Descrição da resolução'] = row['Descrição da resolução'];
             grouped[key]['Resolvido em'] = row['Resolvido em'];
          }
        }
      }
      finalRows = Object.values(grouped).map(g => {
        const parsed = g._dates.map(d => {
           const [dd, mm, yy] = d.split('/');
           return new Date(`20${yy}-${mm}-${dd}T00:00:00Z`);
        }).sort((a,b) => a - b);
        const minD = parsed[0];
        const maxD = parsed[parsed.length - 1];
        
        const format = (d) => {
          const dd = String(d.getUTCDate()).padStart(2, '0');
          const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
          const yy = String(d.getUTCFullYear()).slice(2);
          return `${dd}/${mm}/${yy}`;
        };

        if (minD.getTime() === maxD.getTime()) {
           g.Data = format(minD);
        } else {
           g.Data = `Início: ${format(minD)}, Fim: ${format(maxD)}`;
        }
        delete g._dates;
        return g;
      });
    }

    finalRows = finalRows.map(row => {
       if (row.Nível === 'alert') row.Nível = 'Alerta';
       if (row.Nível === 'critical') row.Nível = 'Urgente';
       return row;
    });

    return finalRows;
  }

  const { rows } = await cenos_pool.query(
    `SELECT a.item->>'question_label' as label, COUNT(*) as count
     FROM checklists c
     ${colJoin},
     jsonb_array_elements(c.data->'answers') a(item)
     ${cWhere} AND a.item->>'is_compliant' = 'false'
     GROUP BY a.item->>'question_label'
     ORDER BY count DESC
     LIMIT 20`,
    dParams
  );

  return rows.map(r => ({ label: r.label, count: parseInt(r.count, 10) }));
}

/**
 * Splits an array of date strings into consecutive streaks,
 * treating Saturday and Sunday as non-breaking (Fri+Sat+Mon = consecutive).
 * When resolutionDates are provided, a resolved date acts as a "wall" —
 * even if the next date is consecutive, the streak breaks after a resolved date.
 * Returns an array of streaks, each with { dates, consecutive_days, resolved }.
 * Streaks are ordered chronologically (oldest first).
 */
function splitIntoStreaks(allDates, resolutionDates = []) {
  if (!allDates || allDates.length === 0) return [];

  const toStr = (d) => {
    if (typeof d === 'string') return d;
    if (d instanceof Date) return d.toISOString().split('T')[0];
    return String(d);
  };

  const sorted = allDates.map(toStr).sort();
  const unique = sorted.filter((d, i) => i === 0 || d !== sorted[i - 1]);
  if (unique.length === 0) return [];

  const resolvedSet = new Set(resolutionDates.map(toStr));

  function weekendDaysBetween(d1Str, d2Str) {
    const d1 = new Date(d1Str + 'T00:00:00');
    const d2 = new Date(d2Str + 'T00:00:00');
    const diffMs = d2 - d1;
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    let count = 0;
    for (let i = 1; i < diffDays; i++) {
      const d = new Date(d1.getTime() + i * 86400000);
      if (d.getDay() === 0 || d.getDay() === 6) count++;
    }
    return count;
  }

  function isConsecutive(d1Str, d2Str) {
    const d1 = new Date(d1Str + 'T00:00:00');
    const d2 = new Date(d2Str + 'T00:00:00');
    const rawDiff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    const we = weekendDaysBetween(d1Str, d2Str);
    return (rawDiff - we) <= 1;
  }

  const streaks = [];
  let current = [unique[0]];

  for (let i = 1; i < unique.length; i++) {
    const prevDate = unique[i - 1];
    const thisDate = unique[i];

    if (isConsecutive(prevDate, thisDate)) {
      if (resolvedSet.has(prevDate)) {
        const lastDate = current[current.length - 1];
        streaks.push({ dates: [...current], consecutive_days: current.length, resolved: resolvedSet.has(lastDate) });
        current = [thisDate];
      } else {
        current.push(thisDate);
      }
    } else {
      const lastDate = current[current.length - 1];
      streaks.push({ dates: [...current], consecutive_days: current.length, resolved: resolvedSet.has(lastDate) });
      current = [thisDate];
    }
  }
  const lastDate = current[current.length - 1];
  streaks.push({ dates: [...current], consecutive_days: current.length, resolved: resolvedSet.has(lastDate) });

  return streaks;
}

/**
 * V2 Alerts — uses dynamic template filters.
 * In normal mode: groups by agent+question+severity and calculates consecutive days.
 *   The date range filters which items appear, but ALL historical dates are fetched.
 * In export_raw mode: returns individual entries for Excel export.
 */
async function getDashboardAlertsV2({date_from, date_to, regional, sectional, estado, gestor, agent_name, template_id, export_raw, checklist_kind}, user) {
  const { templateIds, agentIds } = await getV2TemplateAndAgentIds({ template_id, date_from, date_to, checklist_kind }, user);
  if (templateIds.length === 0 || agentIds.length === 0) return [];

  const dParams = [];
  let dIdx = 1;
  const dateFilter = buildDateFilter({ date_from, date_to, params: dParams, idx: dIdx });
  const dateFilters = dateFilter.filters;
  dIdx = dateFilter.nextIdx;

  const colJoin = buildColaboradorJoins(checklist_kind || (typeof req !== "undefined" && req.query.checklist_kind) || undefined);
  const { filters: colFilters, idx: colIdx } = buildColaboradorFilters({
    regional, sectional, estado, gestor, agent_name, params: dParams, idx: dIdx, user
      });
  dIdx = colIdx;

  const cFilters = [
    `c.status = 'submitted'${checklist_kind === 'gestor' ? " AND (COALESCE(t.is_gestor, false) = true OR c.type = 'gestor' OR c.target_agent_id IS NOT NULL)" : " AND COALESCE(t.is_gestor, false) = false AND c.type != 'gestor' AND c.target_agent_id IS NULL"}`,
    `c.template_id = ANY($${dIdx})`,
    `c.agent_id = ANY($${dIdx + 1})`,
    ...dateFilters,
    ...colFilters,
  ];
  dParams.push(templateIds, agentIds);
  dIdx += 2;
  const cWhere = `WHERE ${cFilters.join(' AND ')}`;

  if (export_raw) {
    const { rows } = await cenos_pool.query(
      `SELECT c.agent_id as "Agente",
              col."MAT" as "Matrícula",
              col."Nome" as "Nome",
              col.estado as "Estado",
              col.seccional as "Seccional",
              col.regional as "Regional",
              col."GESTOR IMEDIATO" as "Gestor",
              a.item->>'question_label' as "Item",
              COALESCE(a.item->>'severity', 'critical') as "Nível",
              TO_CHAR(c.date, 'DD/MM/YY') as "Data",
              TO_CHAR(c.submitted_at, 'DD/MM/YY "às" HH24:MI:SS') as "Enviado em",
              a.item->>'observation' as "Observação",
              CASE WHEN (a.item->>'photo_url') IS NOT NULL AND (a.item->>'photo_url') != '' THEN 'HYPERLINK|' || (a.item->>'photo_url') ELSE NULL END as "Foto",
              CASE WHEN r.id IS NOT NULL THEN 'Resolvido' ELSE 'Não resolvido' END as "Resolução",
              r.description as "Descrição da resolução",
              TO_CHAR(r.resolved_at, 'DD/MM/YY "às" HH24:MI:SS') as "Resolvido em"
       FROM checklists c
       ${colJoin}
       CROSS JOIN LATERAL jsonb_array_elements(c.data->'answers') a(item)
       LEFT JOIN checklist_nonconformity_resolutions r
         ON r.agent_id = c.agent_id
         AND r.question_label = a.item->>'question_label'
         AND r.resolved_date = c.date
       ${cWhere}
         AND (a.item->>'is_compliant' = 'false' OR (a.item->>'is_compliant')::boolean = false)
         AND COALESCE(a.item->>'severity', 'critical') IN ('critical', 'alert')
       ORDER BY COALESCE(c.submitted_at, c.date) DESC, "Nível" ASC
       LIMIT 5000`,
      dParams
    );

    let finalRows = rows;
    if (typeof export_mode !== 'undefined' && export_mode === 'compact') {
      const grouped = {};
      for (const row of rows) {
        const key = `${row.Agente}-${row.Item}-${row.Nível}`;
        if (!grouped[key]) {
          grouped[key] = { ...row, _dates: [row.Data] };
        } else {
          grouped[key]._dates.push(row.Data);
          if (!grouped[key].Foto && row.Foto) grouped[key].Foto = row.Foto;
          if (grouped[key].Resolução === 'Não resolvido' && row.Resolução === 'Resolvido') {
             grouped[key].Resolução = row.Resolução;
             grouped[key]['Descrição da resolução'] = row['Descrição da resolução'];
             grouped[key]['Resolvido em'] = row['Resolvido em'];
          }
        }
      }
      finalRows = Object.values(grouped).map(g => {
        const parsed = g._dates.map(d => {
           const [dd, mm, yy] = d.split('/');
           return new Date(`20${yy}-${mm}-${dd}T00:00:00Z`);
        }).sort((a,b) => a - b);
        const minD = parsed[0];
        const maxD = parsed[parsed.length - 1];
        
        const format = (d) => {
          const dd = String(d.getUTCDate()).padStart(2, '0');
          const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
          const yy = String(d.getUTCFullYear()).slice(2);
          return `${dd}/${mm}/${yy}`;
        };

        if (minD.getTime() === maxD.getTime()) {
           g.Data = format(minD);
        } else {
           g.Data = `Início: ${format(minD)}, Fim: ${format(maxD)}`;
        }
        delete g._dates;
        return g;
      });
    }

    finalRows = finalRows.map(row => {
       if (row.Nível === 'alert') row.Nível = 'Alerta';
       if (row.Nível === 'critical') row.Nível = 'Urgente';
       return row;
    });

    return finalRows;
  }

  // Step 1: Find which agent+question+severity combinations exist in the date range
  const { rows: groups } = await cenos_pool.query(
    `SELECT c.agent_id, col."Nome" as agent_nome,
            col."MAT" as agent_matricula, col.estado, col.regional, col.seccional, col."GESTOR IMEDIATO" as gestor,
            a.item->>'question_label' as question, COALESCE(a.item->>'severity', 'critical') as severity,
            COUNT(DISTINCT c.date) as filtered_days
     FROM checklists c
     ${colJoin},
     jsonb_array_elements(c.data->'answers') a(item)
     ${cWhere}
       AND (a.item->>'is_compliant' = 'false' OR (a.item->>'is_compliant')::boolean = false)
       AND COALESCE(a.item->>'severity', 'critical') IN ('critical', 'alert')
     GROUP BY c.agent_id, col."Nome", col."MAT", col.estado, col.regional, col.seccional, col."GESTOR IMEDIATO",
              a.item->>'question_label', COALESCE(a.item->>'severity', 'critical')
     ORDER BY filtered_days DESC, severity ASC
     LIMIT 50`,
    dParams
  );

  if (groups.length === 0) return [];

  // Step 2: Batch fetch resolutions for all groups
  const resolutionMap = await batchGetResolutions(groups);

  // Step 2b: Fetch full resolution details for resolved items
  const fullResolutionMap = await batchGetResolutionsFull(groups);

  // Step 3: For each group, fetch ALL historical dates + checklist_id map (no date filter)
  const results = await Promise.all(groups.map(async (g) => {
    const histParams = [g.agent_id, g.question, templateIds];
    const { rows: histRows } = await cenos_pool.query(
      `SELECT array_agg(DISTINCT sub.date ORDER BY sub.date) as all_dates,
              CASE WHEN count(*) = 0 THEN '{}'::jsonb
              ELSE jsonb_object_agg(sub.date::text, sub.id) END as date_checklist_map
       FROM (
         SELECT DISTINCT ON (c.date) c.date, c.id
         FROM checklists c
         ${colJoin}
         WHERE c.status = 'submitted'${checklist_kind === 'gestor' ? " AND (COALESCE(t.is_gestor, false) = true OR c.type = 'gestor' OR c.target_agent_id IS NOT NULL)" : " AND COALESCE(t.is_gestor, false) = false AND c.type != 'gestor' AND c.target_agent_id IS NULL"}
           AND c.template_id = ANY($3::uuid[])
           AND c.agent_id = $1
           AND col."ID" = $1
           AND EXISTS (
             SELECT 1 FROM jsonb_array_elements(c.data->'answers') a(item)
             WHERE a.item->>'question_label' = $2
               AND (a.item->>'is_compliant' = 'false' OR (a.item->>'is_compliant')::boolean = false)
           )
         ORDER BY c.date, c.submitted_at DESC NULLS LAST
         LIMIT 1000
       ) sub`,
      histParams
    );

    const allDates = (histRows[0]?.all_dates || []);
    const dateChecklistMap = histRows[0]?.date_checklist_map || {};
    const resKey = `${g.agent_id}||${g.question}`;
    const streaks = splitIntoStreaks(allDates, resolutionMap.dateMap.get(resKey) || []);

    return streaks.map((streak) => {
      const lastDate = streak.dates[streak.dates.length - 1] || null;
      const resolutionId = streak.resolved && lastDate ? (resolutionMap.idMap.get(resKey + '||' + lastDate) || null) : null;
      const checklistId = lastDate ? (dateChecklistMap[lastDate] || null) : null;

      let resolution_detail = null;
      if (resolutionId && lastDate) {
        const fullRes = fullResolutionMap.get(`${g.agent_id}||${g.question}||${lastDate}`);
        if (fullRes) {
          resolution_detail = {
            id: fullRes.id,
            photo_url: fullRes.photo_url,
            description: fullRes.description,
            resolved_at: fullRes.resolved_at,
            resolved_by: fullRes.resolved_by,
          };
        }
      }

      return {
        checklist_id: checklistId,
        agent_id: g.agent_id,
        agent_nome: g.agent_nome,
        agent_matricula: g.agent_matricula,
        regional: g.regional,
        seccional: g.seccional,
        gestor: g.gestor,
        question: g.question,
        severity: g.severity,
        date: lastDate,
        submitted_at: null,
        observation: null,
        photo_url: null,
        resolved: streak.resolved,
        resolution_id: resolutionId,
        resolution_detail,
        consecutive_days: streak.consecutive_days,
        dates: streak.dates,
      };
    });
  }));

  return results.flat();
}

/**
 * V2 Non-Conformities — non-compliant items that are NOT critical or alert.
 * In normal mode: groups by agent+question and calculates consecutive days.
 *   The date range filters which items appear, but ALL historical dates are fetched.
 * In export_raw mode: returns individual entries for Excel export.
 */
async function getDashboardNonConformitiesV2({date_from, date_to, regional, sectional, estado, gestor, agent_name, template_id, export_raw, checklist_kind}, user) {
  const { templateIds, agentIds } = await getV2TemplateAndAgentIds({ template_id, date_from, date_to, checklist_kind }, user);
  if (templateIds.length === 0 || agentIds.length === 0) return [];

  const dParams = [];
  let dIdx = 1;
  const dateFilter = buildDateFilter({ date_from, date_to, params: dParams, idx: dIdx });
  const dateFilters = dateFilter.filters;
  dIdx = dateFilter.nextIdx;

  const colJoin = buildColaboradorJoins(checklist_kind || (typeof req !== "undefined" && req.query.checklist_kind) || undefined);
  const { filters: colFilters, idx: colIdx } = buildColaboradorFilters({
    regional, sectional, estado, gestor, agent_name, params: dParams, idx: dIdx, user
      });
  dIdx = colIdx;

  const cFilters = [
    `c.status = 'submitted'${checklist_kind === 'gestor' ? " AND (COALESCE(t.is_gestor, false) = true OR c.type = 'gestor' OR c.target_agent_id IS NOT NULL)" : " AND COALESCE(t.is_gestor, false) = false AND c.type != 'gestor' AND c.target_agent_id IS NULL"}`,
    `c.template_id = ANY($${dIdx})`,
    `c.agent_id = ANY($${dIdx + 1})`,
    ...dateFilters,
    ...colFilters,
  ];
  dParams.push(templateIds, agentIds);
  dIdx += 2;
  const cWhere = `WHERE ${cFilters.join(' AND ')}`;

  if (export_raw) {
    const { rows } = await cenos_pool.query(
      `SELECT c.agent_id as "Agente",
              col."MAT" as "Matrícula",
              col."Nome" as "Nome",
              col.estado as "Estado",
              col.seccional as "Seccional",
              col.regional as "Regional",
              col."GESTOR IMEDIATO" as "Gestor",
              a.item->>'question_label' as "Item",
              COALESCE(a.item->>'severity', 'critical') as "Nível",
              TO_CHAR(c.date, 'DD/MM/YY') as "Data",
              TO_CHAR(c.submitted_at, 'DD/MM/YY "às" HH24:MI:SS') as "Enviado em",
              a.item->>'observation' as "Observação",
              CASE WHEN (a.item->>'photo_url') IS NOT NULL AND (a.item->>'photo_url') != '' THEN 'HYPERLINK|' || (a.item->>'photo_url') ELSE NULL END as "Foto",
              CASE WHEN r.id IS NOT NULL THEN 'Resolvido' ELSE 'Não resolvido' END as "Resolução",
              r.description as "Descrição da resolução",
              TO_CHAR(r.resolved_at, 'DD/MM/YY "às" HH24:MI:SS') as "Resolvido em"
       FROM checklists c
       ${colJoin}
       CROSS JOIN LATERAL jsonb_array_elements(c.data->'answers') a(item)
       LEFT JOIN checklist_nonconformity_resolutions r
         ON r.agent_id = c.agent_id
         AND r.question_label = a.item->>'question_label'
         AND r.resolved_date = c.date
       ${cWhere}
         AND (a.item->>'is_compliant' = 'false' OR (a.item->>'is_compliant')::boolean = false)
         AND COALESCE(a.item->>'severity', 'critical') IN ('critical', 'alert')
       ORDER BY COALESCE(c.submitted_at, c.date) DESC, "Nível" ASC
       LIMIT 5000`,
      dParams
    );

    let finalRows = rows;
    if (typeof export_mode !== 'undefined' && export_mode === 'compact') {
      const grouped = {};
      for (const row of rows) {
        const key = `${row.Agente}-${row.Item}-${row.Nível}`;
        if (!grouped[key]) {
          grouped[key] = { ...row, _dates: [row.Data] };
        } else {
          grouped[key]._dates.push(row.Data);
          if (!grouped[key].Foto && row.Foto) grouped[key].Foto = row.Foto;
          if (grouped[key].Resolução === 'Não resolvido' && row.Resolução === 'Resolvido') {
             grouped[key].Resolução = row.Resolução;
             grouped[key]['Descrição da resolução'] = row['Descrição da resolução'];
             grouped[key]['Resolvido em'] = row['Resolvido em'];
          }
        }
      }
      finalRows = Object.values(grouped).map(g => {
        const parsed = g._dates.map(d => {
           const [dd, mm, yy] = d.split('/');
           return new Date(`20${yy}-${mm}-${dd}T00:00:00Z`);
        }).sort((a,b) => a - b);
        const minD = parsed[0];
        const maxD = parsed[parsed.length - 1];
        
        const format = (d) => {
          const dd = String(d.getUTCDate()).padStart(2, '0');
          const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
          const yy = String(d.getUTCFullYear()).slice(2);
          return `${dd}/${mm}/${yy}`;
        };

        if (minD.getTime() === maxD.getTime()) {
           g.Data = format(minD);
        } else {
           g.Data = `Início: ${format(minD)}, Fim: ${format(maxD)}`;
        }
        delete g._dates;
        return g;
      });
    }

    finalRows = finalRows.map(row => {
       if (row.Nível === 'alert') row.Nível = 'Alerta';
       if (row.Nível === 'critical') row.Nível = 'Urgente';
       return row;
    });

    return finalRows;
  }

  // Step 1: Find which agent+question+severity combinations exist in the date range
  const { rows: groups } = await cenos_pool.query(
    `SELECT c.agent_id, col."Nome" as agent_nome,
            col."MAT" as agent_matricula, col.estado, col.regional, col.seccional, col."GESTOR IMEDIATO" as gestor,
            a.item->>'question_label' as question, COALESCE(a.item->>'severity', 'normal') as severity,
            COUNT(DISTINCT c.date) as filtered_days
     FROM checklists c
     ${colJoin},
     jsonb_array_elements(c.data->'answers') a(item)
     ${cWhere}
       AND (a.item->>'is_compliant' = 'false' OR (a.item->>'is_compliant')::boolean = false)
       AND COALESCE(a.item->>'severity', 'normal') NOT IN ('critical', 'alert')
     GROUP BY c.agent_id, col."Nome", col."MAT", col.estado, col.regional, col.seccional, col."GESTOR IMEDIATO",
              a.item->>'question_label', COALESCE(a.item->>'severity', 'normal')
     ORDER BY filtered_days DESC
     LIMIT 50`,
    dParams
  );

  if (groups.length === 0) return [];

  // Step 2: Batch fetch resolutions for all groups
  const resolutionMap = await batchGetResolutions(groups);

  // Step 2b: Fetch full resolution details for resolved items
  const fullResolutionMap = await batchGetResolutionsFull(groups);

  // Step 3: For each group, fetch ALL historical dates + checklist_id map (no date filter)
  const results = await Promise.all(groups.map(async (g) => {
    const histParams = [g.agent_id, g.question, templateIds];
    const { rows: histRows } = await cenos_pool.query(
      `SELECT array_agg(DISTINCT sub.date ORDER BY sub.date) as all_dates,
              CASE WHEN count(*) = 0 THEN '{}'::jsonb
              ELSE jsonb_object_agg(sub.date::text, sub.id) END as date_checklist_map
       FROM (
         SELECT DISTINCT ON (c.date) c.date, c.id
         FROM checklists c
         ${colJoin}
         WHERE c.status = 'submitted'${checklist_kind === 'gestor' ? " AND (COALESCE(t.is_gestor, false) = true OR c.type = 'gestor' OR c.target_agent_id IS NOT NULL)" : " AND COALESCE(t.is_gestor, false) = false AND c.type != 'gestor' AND c.target_agent_id IS NULL"}
           AND c.template_id = ANY($3::uuid[])
           AND c.agent_id = $1
           AND col."ID" = $1
           AND EXISTS (
             SELECT 1 FROM jsonb_array_elements(c.data->'answers') a(item)
             WHERE a.item->>'question_label' = $2
               AND (a.item->>'is_compliant' = 'false' OR (a.item->>'is_compliant')::boolean = false)
           )
         ORDER BY c.date, c.submitted_at DESC NULLS LAST
         LIMIT 1000
       ) sub`,
      histParams
    );

    const allDates = (histRows[0]?.all_dates || []);
    const dateChecklistMap = histRows[0]?.date_checklist_map || {};
    const resKey = `${g.agent_id}||${g.question}`;
    const streaks = splitIntoStreaks(allDates, resolutionMap.dateMap.get(resKey) || []);

    return streaks.map((streak) => {
      const lastDate = streak.dates[streak.dates.length - 1] || null;
      const resolutionId = streak.resolved && lastDate ? (resolutionMap.idMap.get(resKey + '||' + lastDate) || null) : null;
      const checklistId = lastDate ? (dateChecklistMap[lastDate] || null) : null;

      let resolution_detail = null;
      if (resolutionId && lastDate) {
        const fullRes = fullResolutionMap.get(`${g.agent_id}||${g.question}||${lastDate}`);
        if (fullRes) {
          resolution_detail = {
            id: fullRes.id,
            photo_url: fullRes.photo_url,
            description: fullRes.description,
            resolved_at: fullRes.resolved_at,
            resolved_by: fullRes.resolved_by,
          };
        }
      }

      return {
        checklist_id: checklistId,
        agent_id: g.agent_id,
        agent_nome: g.agent_nome,
        agent_matricula: g.agent_matricula,
        regional: g.regional,
        seccional: g.seccional,
        gestor: g.gestor,
        question: g.question,
        severity: g.severity,
        date: lastDate,
        submitted_at: null,
        observation: null,
        photo_url: null,
        resolved: streak.resolved,
        resolution_id: resolutionId,
        resolution_detail,
        consecutive_days: streak.consecutive_days,
        dates: streak.dates,
      };
    });
  }));

  return results.flat();
}

module.exports = {
  getDashboardFilterOptions,
  getDashboardStats,
  getDashboardNonCompliantItems,
  getDashboardAlerts,
  listDashboardChecklists,
  getDashboardPendingAgents,
  getDashboardTemplates,
  getDashboardStatsV2,
  getDashboardPendingAgentsV2,
  getDashboardNonCompliantItemsV2,
  getDashboardAlertsV2,
  getDashboardCompletedAgentsV2,
  getDashboardNonConformitiesV2,
};

