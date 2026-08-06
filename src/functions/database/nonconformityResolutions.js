const { sinergia_pool } = require('../../db');
const { processBase64Files } = require('./serviceNotes');

async function createResolution({ agent_id, question_label, resolved_date, photo_url, description }, userId) {
  let processedPhoto = photo_url;
  if (photo_url && photo_url.startsWith('data:')) {
    const proc = await processBase64Files({ url: photo_url }, agent_id);
    processedPhoto = proc.url;
  }

  const { rows } = await sinergia_pool.query(
    `INSERT INTO checklist_nonconformity_resolutions
       (agent_id, question_label, resolved_date, resolved_by, photo_url, description)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (agent_id, question_label, resolved_date) DO UPDATE
       SET photo_url = EXCLUDED.photo_url,
           description = EXCLUDED.description,
           resolved_by = EXCLUDED.resolved_by,
           resolved_at = NOW()
     RETURNING id, agent_id, question_label, resolved_date::text,
               resolved_by, resolved_at, photo_url, description`,
    [agent_id, question_label, resolved_date, userId, processedPhoto, description]
  );

  return rows[0];
}

async function deleteResolution(resolutionId) {
  const { rowCount } = await sinergia_pool.query(
    `DELETE FROM checklist_nonconformity_resolutions WHERE id = $1`,
    [resolutionId]
  );
  return rowCount > 0;
}

async function getResolutionsByAgentQuestion(agentId, questionLabels) {
  if (!questionLabels || questionLabels.length === 0) return [];

  const { rows } = await sinergia_pool.query(
    `SELECT id, agent_id, question_label, resolved_date::text as resolved_date,
            resolved_by, resolved_at, photo_url, description
     FROM checklist_nonconformity_resolutions
     WHERE agent_id = $1 AND question_label = ANY($2)`,
    [agentId, questionLabels]
  );

  return rows;
}

async function batchGetResolutions(groups) {
  if (groups.length === 0) return new Map();

  const agentIds = [...new Set(groups.map(g => g.agent_id))];
  const questionLabels = [...new Set(groups.map(g => g.question))];

  const { rows } = await sinergia_pool.query(
    `SELECT id, agent_id, question_label, resolved_date::text as resolved_date
     FROM checklist_nonconformity_resolutions
     WHERE agent_id = ANY($1) AND question_label = ANY($2)`,
    [agentIds, questionLabels]
  );

  const dateMap = new Map();
  const idMap = new Map();
  for (const row of rows) {
    const key = `${row.agent_id}||${row.question_label}`;
    if (!dateMap.has(key)) dateMap.set(key, []);
    dateMap.get(key).push(row.resolved_date);
    idMap.set(key + '||' + row.resolved_date, row.id);
  }

  return { dateMap, idMap };
}

async function batchGetResolutionsFull(groups) {
  if (groups.length === 0) return new Map();

  const agentIds = [...new Set(groups.map(g => g.agent_id))];
  const questionLabels = [...new Set(groups.map(g => g.question))];

  const { rows } = await sinergia_pool.query(
    `SELECT id, agent_id, question_label, resolved_date::text as resolved_date,
            resolved_by, resolved_at, photo_url, description
     FROM checklist_nonconformity_resolutions
     WHERE agent_id = ANY($1) AND question_label = ANY($2)`,
    [agentIds, questionLabels]
  );

  const map = new Map();
  for (const row of rows) {
    const key = `${row.agent_id}||${row.question_label}||${row.resolved_date}`;
    map.set(key, row);
  }

  return map;
}

module.exports = {
  createResolution,
  deleteResolution,
  getResolutionsByAgentQuestion,
  batchGetResolutions,
  batchGetResolutionsFull,
};
