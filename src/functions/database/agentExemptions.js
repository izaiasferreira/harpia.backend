const { cenos_pool } = require('../../db');

/**
 * Verifica se um agente está isento no momento especificado.
 * Também verifica se a data alvo é um Domingo (dayOfWeek = 0).
 */
async function isAgentExempt(agentId, targetDate) {
  // Domingo = sem cobrança
  const d = new Date(targetDate + 'T12:00:00Z');
  if (d.getUTCDay() === 0) return true;

  const { rows } = await cenos_pool.query(
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

  const { rows } = await cenos_pool.query(
    `SELECT DISTINCT agent_id FROM agent_exemptions
     WHERE start_date <= $1::date
       AND end_date >= $1::date`,
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

  const { rows } = await cenos_pool.query(
    `SELECT COUNT(DISTINCT agent_id) AS total FROM agent_exemptions
     WHERE start_date <= $1::date
       AND end_date >= $1::date`,
    [targetDate]
  );
  return parseInt(rows[0]?.total || 0, 10);
}

/**
 * Lista o histórico de isenções de um agente específico.
 */
async function listAgentExemptions(agentId) {
  const { rows } = await cenos_pool.query(
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
  const { rows } = await cenos_pool.query(
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
  const { rows } = await cenos_pool.query(
    `DELETE FROM agent_exemptions
     WHERE id = $1 AND agent_id = $2
     RETURNING *`,
    [exemptionId, agentId]
  );
  if (!rows.length) return null;
  return rows[0];
}

module.exports = {
  isAgentExempt,
  getExemptAgentIds,
  countActiveExemptions,
  listAgentExemptions,
  createAgentExemption,
  deleteAgentExemption
};
