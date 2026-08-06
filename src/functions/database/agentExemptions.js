const { sinergia_pool } = require('../../db');
const { getUserAllowedStatePools, userIsAdmin, getColaboradoresFilter, checkAgentPermission, buildUserPermissionSQL } = require('./admin');

/**
 * Verifica se um agente está isento no momento especificado.
 * Também verifica se a data alvo é um Domingo (dayOfWeek = 0).
 */
async function isAgentExempt(agentId, targetDate) {
  // Domingo = sem cobrança
  const d = new Date(targetDate + 'T12:00:00Z');
  if (d.getUTCDay() === 0) return true;

  const { rows } = await sinergia_pool.query(
    `SELECT 1 FROM agent_exemptions
     WHERE agent_id = $1
       AND start_date <= $2::date
       AND end_date >= $2::date
     LIMIT 1`,
    [agentId, targetDate]
  );
  return rows.length > 0;
}

/**
 * Retorna a lista de agent_ids isentos em uma data específica.
 */
async function getExemptAgentIds(targetDate) {
  // Domingo = todos estão isentos (chamador deve tratar)
  const d = new Date(targetDate + 'T12:00:00Z');
  if (d.getUTCDay() === 0) return { isSunday: true, ids: [] };

  const { rows } = await sinergia_pool.query(
    `SELECT DISTINCT col."ID" as agent_id
     FROM colaboradores col
     LEFT JOIN agent_exemptions ae ON ae.agent_id = col."ID" 
       AND ae.start_date <= $1::date AND ae.end_date >= $1::date
     WHERE (ae.id IS NOT NULL OR col.situacao != 'active' OR col.status = false)`,
    [targetDate]
  );
  return { isSunday: false, ids: rows.map(r => r.agent_id) };
}

/**
 * Conta quantos agentes únicos têm isenção ativa em uma data.
 */
async function countActiveExemptions(targetDate) {
  const d = new Date(targetDate + 'T12:00:00Z');
  if (d.getUTCDay() === 0) return 0;

  const { rows } = await sinergia_pool.query(
    `SELECT COUNT(DISTINCT col."ID") AS total
     FROM colaboradores col
     LEFT JOIN agent_exemptions ae ON ae.agent_id = col."ID" 
       AND ae.start_date <= $1::date AND ae.end_date >= $1::date
     WHERE (ae.id IS NOT NULL OR col.situacao != 'active' OR col.status = false)`,
    [targetDate]
  );
  return parseInt(rows[0]?.total || 0, 10);
}

/**
 * Lista o histórico de isenções de um agente específico.
 */
async function listAgentExemptions(agentId) {
  const { rows } = await sinergia_pool.query(
    `SELECT
       ae.id,
       ae.agent_id,
       ae.start_date,
       ae.end_date,
       ae.reason,
       ae.created_at,
       u.nome AS created_by_name
     FROM agent_exemptions ae
     LEFT JOIN users u ON u.id = ae.created_by
     WHERE ae.agent_id = $1
     ORDER BY ae.created_at DESC`,
    [agentId]
  );
  return rows;
}

/**
 * Cria uma nova isenção para o agente. Registrado para auditoria.
 */
async function createAgentExemption({ agentId, startDate, endDate, reason, createdBy }) {
  const { rows } = await sinergia_pool.query(
    `INSERT INTO agent_exemptions (agent_id, start_date, end_date, reason, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [agentId, startDate, endDate, reason || null, createdBy || null]
  );
  return rows[0];
}

/**
 * Remove uma isenção pelo ID (e valida que pertence ao agente).
 */
async function deleteAgentExemption({ exemptionId, agentId }) {
  const { rows } = await sinergia_pool.query(
    `DELETE FROM agent_exemptions
     WHERE id = $1 AND agent_id = $2
     RETURNING *`,
    [exemptionId, agentId]
  );
  if (!rows.length) return null;
  return rows[0];
}

/**
 * Retorna lista paginada de agentes isentos (com dados do colaborador e motivo),
 * filtrando isenções ativas em QUALQUER DIA dentro do período [date_from, date_to].
 */
async function listActiveExemptions({
  date_from, date_to, agent_name, regional, sectional, estado, gestor,
  page = 1, limit = 20,
}, user = null) {
  const offset = (page - 1) * limit;
  const today = new Date().toISOString().split('T')[0];
  const from = date_from || today;
  const to = date_to || today;

  const params = [];
  let idx = 1;

  params.push(to, from);
  idx += 2;

  const filters = [];
  if (agent_name) { filters.push(`UPPER(col."Nome") ILIKE UPPER($${idx})`); params.push(`%${agent_name}%`); idx++; }
  if (regional) { filters.push(`col.regional = $${idx}`); params.push(regional); idx++; }
  if (sectional) { filters.push(`col.seccional = $${idx}`); params.push(sectional); idx++; }
  if (estado) { filters.push(`UPPER(col.estado) = UPPER($${idx})`); params.push(estado); idx++; }
  if (gestor) { filters.push(`col."GESTOR IMEDIATO" = $${idx}`); params.push(gestor); idx++; }

  // Aplica filtro de permissão
  const permSQL = buildUserPermissionSQL(user, params, idx, 'col');
  if (permSQL.conditions.length > 0) {
    filters.push(...permSQL.conditions);
  }
  idx = permSQL.idx;

  const whereFilters = filters.length > 0 ? `AND ${filters.join(' AND ')}` : '';

  const countQuery = `
    SELECT COUNT(*) as total
    FROM colaboradores col
    LEFT JOIN agent_exemptions ae ON ae.agent_id = col."ID" 
      AND ae.start_date <= $1::date AND ae.end_date >= $2::date
    WHERE (ae.id IS NOT NULL OR col.situacao != 'active' OR col.status = false)
      ${whereFilters}
  `;

  const dataQuery = `
    SELECT ae.id, col."ID" as agent_id, ae.start_date, ae.end_date, ae.reason, ae.created_at,
           col."Nome" as nome, col.regional, col.seccional, col.estado,
           col."Cargo" as cargo, col."GESTOR IMEDIATO" as gestor,
           col.situacao, col.status
    FROM colaboradores col
    LEFT JOIN agent_exemptions ae ON ae.agent_id = col."ID" 
      AND ae.start_date <= $1::date AND ae.end_date >= $2::date
    WHERE (ae.id IS NOT NULL OR col.situacao != 'active' OR col.status = false)
      ${whereFilters}
    ORDER BY ae.created_at DESC NULLS LAST, col."Nome" ASC
    LIMIT $${idx} OFFSET $${idx + 1}
  `;

  const paramsWithPagination = [...params, limit, offset];

  const [countRes, dataRes] = await Promise.all([
    sinergia_pool.query(countQuery, params),
    sinergia_pool.query(dataQuery, paramsWithPagination),
  ]);

  const SITUACAO_LABEL = {
    active: 'Ativo',
    vocation: 'Férias',
    inactive: 'Desligado',
    away: 'Afastado',
  };

  const enrichedData = dataRes.rows.map(r => {
    const motivos = [];
    if (r.reason) motivos.push(r.reason);
    if (r.situacao !== 'active') motivos.push(SITUACAO_LABEL[r.situacao] || r.situacao);
    if (r.status === false) motivos.push('Inativo');
    
    return {
      ...r,
      reason: motivos.join('; ')
    };
  });

  const total = parseInt(countRes.rows[0]?.total || 0, 10);

  return {
    data: enrichedData,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

module.exports = {
  isAgentExempt,
  getExemptAgentIds,
  countActiveExemptions,
  listAgentExemptions,
  createAgentExemption,
  deleteAgentExemption,
  listActiveExemptions,
};
