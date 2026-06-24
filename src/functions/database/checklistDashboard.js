const { cenos_pool } = require('../../db');

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
  return `LEFT JOIN colaboradores col ON c.agent_id = col."ID"`;
}

function buildColaboradorFilters({ regional, sectional, estado, gestor, agent_name, params, idx }) {
  const filters = [];
  if (regional) { filters.push(`col.regional = $${idx}`); params.push(regional); idx++; }
  if (sectional) { filters.push(`col.seccional = $${idx}`); params.push(sectional); idx++; }
  if (estado) { filters.push(`col.estado = $${idx}`); params.push(estado); idx++; }
  if (gestor) { filters.push(`col."GESTOR IMEDIATO" = $${idx}`); params.push(gestor); idx++; }
  if (agent_name) { filters.push(`col."Nome" ILIKE $${idx}`); params.push(`%${agent_name}%`); idx++; }
  return { filters, idx };
}

async function getDashboardStats({ date_from, date_to, regional, sectional, estado, gestor }) {
  const dParams = [];
  let dIdx = 1;
  const dateFilter = buildDateFilter({ date_from, date_to, params: dParams, idx: dIdx });
  const dateFilters = dateFilter.filters;
  dIdx = dateFilter.nextIdx;

  const colJoin = buildColaboradorJoins();
  const { filters: colFilters, idx: colIdx } = buildColaboradorFilters({
    regional, sectional, estado, gestor, params: dParams, idx: dIdx
  });
  dIdx = colIdx;

  const cFilters = [`c.status = 'submitted'`, ...dateFilters, ...colFilters];
  const cWhere = `WHERE ${cFilters.join(' AND ')}`;

  const CHECKLIST_REQUIRED_CARGOS = [
    'LEITURISTA A PÉ',
    'NEGOCIADOR MOTOCICLISTA',
    'LEITURISTA MOTOCICLISTA',
    'COBRADOR MOTOCICLISTA',
  ];

  const [activeAgentsRes, totalRes, compliantRes, nonCompliantRes, regionalRes, pendingRes] = await Promise.all([
    cenos_pool.query(
      `SELECT COUNT(*) as total FROM colaboradores
       WHERE situacao = 'active'
         AND UPPER(TRIM("Cargo")) = ANY($1)`,
      [CHECKLIST_REQUIRED_CARGOS]
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
       WHERE col.situacao = 'active'
         AND col.regional IS NOT NULL
         AND UPPER(TRIM(col."Cargo")) = ANY($3)
       GROUP BY col.regional
       ORDER BY col.regional`,
      [dParams[0], dParams[1], CHECKLIST_REQUIRED_CARGOS]
    ),
    cenos_pool.query(
      `SELECT col."ID" as agent_id, col."Nome" as nome, col.regional, col.seccional, col.estado, col."Cargo" as cargo
       FROM colaboradores col
       WHERE col.situacao = 'active'
         AND UPPER(TRIM(col."Cargo")) = ANY($3)
         AND NOT EXISTS (
           SELECT 1 FROM checklists c
           WHERE c.agent_id = col."ID" AND c.date >= $1 AND c.date <= $2 AND c.status = 'submitted'
         )
       ORDER BY col."Nome"`,
      [dParams[0], dParams[1], CHECKLIST_REQUIRED_CARGOS]
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

async function getDashboardNonCompliantItems({ date_from, date_to, regional, sectional, estado, gestor }) {
  const dParams = [];
  let dIdx = 1;
  const dateFilter = buildDateFilter({ date_from, date_to, params: dParams, idx: dIdx });
  const dateFilters = dateFilter.filters;
  dIdx = dateFilter.nextIdx;

  const colJoin = buildColaboradorJoins();
  const { filters: colFilters, idx: colIdx } = buildColaboradorFilters({
    regional, sectional, estado, gestor, params: dParams, idx: dIdx
  });
  dIdx = colIdx;

  const cFilters = [`c.status = 'submitted'`, ...dateFilters, ...colFilters];
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

async function getDashboardAlerts({ date_from, date_to, regional, sectional, estado, gestor }) {
  const dParams = [];
  let dIdx = 1;
  const dateFilter = buildDateFilter({ date_from, date_to, params: dParams, idx: dIdx });
  const dateFilters = dateFilter.filters;
  dIdx = dateFilter.nextIdx;

  const colJoin = buildColaboradorJoins();
  const { filters: colFilters, idx: colIdx } = buildColaboradorFilters({
    regional, sectional, estado, gestor, params: dParams, idx: dIdx
  });
  dIdx = colIdx;

  const cFilters = [`c.status = 'submitted'`, ...dateFilters, ...colFilters];
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
  type, severity_alert, status,
  regional, sectional, estado, gestor
}) {
  const offset = (page - 1) * limit;
  const params = [];
  let idx = 1;

  const dateFilter = buildDateFilter({ date_from, date_to, params, idx });
  const dateFilters = dateFilter.filters;
  idx = dateFilter.nextIdx;

  const colJoin = buildColaboradorJoins();
  const { filters: colFilters, idx: colIdx } = buildColaboradorFilters({
    regional, sectional, estado, gestor, agent_name, params, idx
  });
  idx = colIdx;

  const filters = [...dateFilters, ...colFilters];

  if (type) { filters.push(`c.type = $${idx}`); params.push(type); idx++; }
  if (status) { filters.push(`c.status = $${idx}`); params.push(status); idx++; }
  if (severity_alert === 'true' || severity_alert === true) {
    filters.push('c.has_critical_non_compliant = true');
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
    LEFT JOIN checklist_templates t ON c.template_id = t.id
    ${colJoin}
    ${whereClause}
    ORDER BY c.submitted_at DESC, c.date DESC
    LIMIT $${idx} OFFSET $${idx + 1}
  `;
  const countQuery = `SELECT count(1) as total FROM checklists c ${colJoin} ${whereClause}`;

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

async function getDashboardPendingAgents({
  date_from, date_to, agent_name, regional, sectional, estado, gestor,
  page = 1, limit = 20,
}) {
  const CHECKLIST_REQUIRED_CARGOS = [
    'LEITURISTA A PÉ',
    'NEGOCIADOR MOTOCICLISTA',
    'LEITURISTA MOTOCICLISTA',
    'COBRADOR MOTOCICLISTA',
  ];

  const offset = (page - 1) * limit;
  const today = new Date().toISOString().split('T')[0];
  const from = date_from || today;
  const to = date_to || today;

  const params = [];
  let idx = 1;

  // $1 = array de cargos obrigatórios
  params.push(CHECKLIST_REQUIRED_CARGOS);
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
  if (agent_name) { filters.push(`col."Nome" ILIKE $${idx}`); params.push(`%${agent_name}%`); idx++; }
  if (regional) { filters.push(`col.regional = $${idx}`); params.push(regional); idx++; }
  if (sectional) { filters.push(`col.seccional = $${idx}`); params.push(sectional); idx++; }
  if (estado) { filters.push(`col.estado = $${idx}`); params.push(estado); idx++; }
  if (gestor) { filters.push(`col."GESTOR IMEDIATO" = $${idx}`); params.push(gestor); idx++; }

  const filterWhere = filters.length > 0 ? `AND ${filters.join(' AND ')}` : '';
  const limitIdx = idx;
  params.push(limit, offset);

  const baseWhere = `
    col.situacao = 'active'
    AND UPPER(TRIM(col."Cargo")) = ANY($1)
    AND NOT EXISTS (
      SELECT 1 FROM checklists c
      WHERE c.agent_id = col."ID"
        AND c.date >= $${dateIdx1} AND c.date <= $${dateIdx2}
        AND c.status = 'submitted'
    )
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

module.exports = {
  getDashboardFilterOptions,
  getDashboardStats,
  getDashboardNonCompliantItems,
  getDashboardAlerts,
  listDashboardChecklists,
  getDashboardPendingAgents,
};
