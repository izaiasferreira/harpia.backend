const crypto = require('crypto');
const { cenos_pool } = require('../../db');
const { processBase64Files } = require('./serviceNotes');

// ==========================================
// TEMPLATES (Admin)
// ==========================================

async function listTemplatesAdmin() {
  const { rows } = await cenos_pool.query(
    'SELECT id, title, is_active, estado, created_by, data, created_at, updated_at FROM checklist_templates WHERE is_deleted = false ORDER BY created_at DESC'
  );
  return rows;
}

async function listTemplatesForAgent(agentEstado) {
  const { rows } = await cenos_pool.query(
    `SELECT id, title, data FROM checklist_templates
     WHERE is_active = true AND (estado IS NULL OR UPPER(estado) = UPPER($1))
     ORDER BY created_at DESC`,
    [agentEstado]
  );
  return rows;
}

async function listTemplatesForAgentWithProfile(agentEstado, agentProfile) {
  const templates = await listTemplatesForAgent(agentEstado);
  return templates.filter(t => {
    const f = t.data?.filters;
    if (!f) return true;
    const matchCargo = !f.cargo?.length || f.cargo.some(c => (agentProfile.cargo || '').toUpperCase() === c.toUpperCase());
    const matchRegional = !f.regional?.length || f.regional.some(r => (agentProfile.regional || '').toUpperCase() === r.toUpperCase());
    const matchSeccional = !f.seccional?.length || f.seccional.some(s => (agentProfile.seccional || '').toUpperCase() === s.toUpperCase());
    const matchProcesso = !f.processo?.length || f.processo.some(p => (agentProfile.processo || '').toUpperCase() === p.toUpperCase());
    return matchCargo && matchRegional && matchSeccional && matchProcesso;
  });
}

async function getTemplateById(id, agentId = null) {
  const { rows } = await cenos_pool.query(
    'SELECT * FROM checklist_templates WHERE id = $1',
    [id]
  );
  if (rows.length === 0) return null;
  const template = rows[0];

  if (agentId) {
    const { rows: profileRows } = await cenos_pool.query(
      `SELECT col."Cargo", col."seccional", col."regional", col."processo", col.estado
       FROM login l
       LEFT JOIN colaboradores col ON l.id = col."ID"
       WHERE l.id = $1`,
      [agentId]
    );

    const agentProfile = profileRows[0] || {};

    const sections = template.data?.sections || [];
    template.data.sections = sections.filter(sec => {
      const f = sec.filters;
      if (!f) return true;
      const matchEstado = !f.estado?.length || f.estado.some(e => (agentProfile.estado || '').toUpperCase() === e.toUpperCase());
      const matchCargo = !f.cargo?.length || f.cargo.some(c => agentProfile['Cargo']?.toUpperCase() === c.toUpperCase());
      const matchRegional = !f.regional?.length || f.regional.some(r => agentProfile.regional?.toUpperCase() === r.toUpperCase());
      const matchSeccional = !f.seccional?.length || f.seccional.some(s => agentProfile.seccional?.toUpperCase() === s.toUpperCase());
      const matchProcesso = !f.processo?.length || f.processo.some(p => agentProfile.processo?.toUpperCase() === p.toUpperCase());
      return matchEstado && matchCargo && matchRegional && matchSeccional && matchProcesso;
    });

    for (const sec of sections) {
      for (const q of (sec.questions || [])) {
        q.is_exempt = false;
        q.exempt_until = null;
        if (q.exemption_days > 0 && q.uuid) {
          const { rows: ansRows } = await cenos_pool.query(
            `SELECT c.submitted_at
             FROM checklists c
             WHERE c.agent_id = $1
               AND c.status = 'submitted'
               AND c.template_id = $2
               AND c.data @> $3::jsonb
             ORDER BY c.submitted_at DESC LIMIT 1`,
            [agentId, id, JSON.stringify({ answers: [{ question_uuid: q.uuid, is_compliant: true }] })]
          );
          if (ansRows.length > 0) {
            const lastDate = new Date(ansRows[0].submitted_at);
            const exemptUntilDate = new Date(lastDate.getTime() + q.exemption_days * 24 * 60 * 60 * 1000);
            if (exemptUntilDate > new Date()) {
              q.is_exempt = true;
              q.exempt_until = exemptUntilDate.toISOString().split('T')[0];
            }
          }
        }
      }
    }
  }

  return template;
}

async function createTemplate({ title, description, created_by, estado, data }) {
  const { rows } = await cenos_pool.query(
    `INSERT INTO checklist_templates (title, created_by, estado, data)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [title, created_by, estado || null, { description, sections: data?.sections || [], filters: data?.filters || null }]
  );
  return rows[0];
}

async function updateTemplate(id, { title, description, is_active, estado, data }) {
  const fields = [];
  const values = [id];
  let idx = 2;

  if (title !== undefined) { fields.push(`title = $${idx++}`); values.push(title); }
  if (is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(is_active); }
  if (estado !== undefined) { fields.push(`estado = $${idx++}`); values.push(estado); }
  if (data !== undefined) { fields.push(`data = $${idx++}`); values.push(data); }

  if (fields.length === 0) return null;

  const { rows } = await cenos_pool.query(
    `UPDATE checklist_templates SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    values
  );
  return rows[0];
}

async function deleteTemplate(id) {
  const { rows } = await cenos_pool.query(
    'UPDATE checklist_templates SET is_active = false, is_deleted = true, updated_at = NOW() WHERE id = $1 RETURNING *',
    [id]
  );
  return rows[0];
}

async function syncTemplate(id, templateData) {
  const data = {
    description: templateData.description || null,
    sections: templateData.sections || [],
    filters: templateData.filters || null
  };
  await cenos_pool.query(
    `UPDATE checklist_templates SET title = $2, estado = $3, data = $4, updated_at = NOW() WHERE id = $1`,
    [id, templateData.title, templateData.estado || null, data]
  );
  return true;
}

// ==========================================
// SUBMISSIONS & STATS (Agente & Admin)
// ==========================================

async function getAgentTodayChecklist(agentId, dateStr) {
  const query = `
    SELECT c.*, t.title as template_title
    FROM checklists c
    LEFT JOIN checklist_templates t ON c.template_id = t.id
    WHERE c.agent_id = $1 AND c.date = $2 AND c.type = 'official'
  `;
  const { rows } = await cenos_pool.query(query, [agentId, dateStr]);
  if (rows.length === 0) return null;

  const checklist = rows[0];
  checklist.answers = checklist.data?.answers || [];
  checklist.compliance_summary = checklist.data?.compliance_summary || null;
  checklist.latitude = checklist.data?.latitude || null;
  checklist.longitude = checklist.data?.longitude || null;

  const suppQuery = `
    SELECT id, submitted_at
    FROM checklists
    WHERE parent_checklist_id = $1 AND type = 'supplementary'
    ORDER BY submitted_at ASC
  `;
  const { rows: supplementaries } = await cenos_pool.query(suppQuery, [checklist.id]);
  checklist.supplementaries = supplementaries;

  return checklist;
}

async function getChecklistById(id) {
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const whereClause = isUUID ? 'c.id = $1' : 'c.local_id = $1';

  const query = `
    SELECT c.*, t.title as template_title, t.data as template_data,
           l.id as agent_id, l.estado as agent_estado,
           col."Nome" as agent_nome, col."Cargo" as agent_cargo,
           col."GESTOR IMEDIATO" as agent_supervisor
    FROM checklists c
    LEFT JOIN checklist_templates t ON c.template_id = t.id
    LEFT JOIN login l ON c.agent_id = l.id
    LEFT JOIN colaboradores col ON l.id = col."ID"
    WHERE ${whereClause}
  `;
  const { rows } = await cenos_pool.query(query, [id]);
  if (rows.length === 0) return null;

  const checklist = rows[0];
  checklist.agent = {
    id: checklist.agent_id,
    name: checklist.agent_nome || checklist.agent_id,
    cargo: checklist.agent_cargo || null,
    supervisor: checklist.agent_supervisor || null,
    estado: checklist.agent_estado
  };
  checklist.answers = checklist.data?.answers || [];
  checklist.compliance_summary = checklist.data?.compliance_summary || null;
  checklist.latitude = checklist.data?.latitude || null;
  checklist.longitude = checklist.data?.longitude || null;

  if (checklist.type === 'official') {
    const { rows: supps } = await cenos_pool.query(
      `SELECT id, submitted_at FROM checklists
       WHERE parent_checklist_id = $1 AND type = 'supplementary'
       ORDER BY submitted_at ASC`,
      [checklist.id]
    );
    checklist.supplementaries = supps;
  }

  return checklist;
}

async function listChecklistsAdmin({ page = 1, limit = 10, regional_id, sectional_id, agent_name, date_from, date_to, type, severity_alert, status }) {
  const offset = (page - 1) * limit;
  const params = [];
  let paramIndex = 1;
  const filters = [];

  if (regional_id) { filters.push(`c.regional_id = $${paramIndex}`); params.push(regional_id); paramIndex++; }
  if (sectional_id) { filters.push(`c.sectional_id = $${paramIndex}`); params.push(sectional_id); paramIndex++; }
  if (agent_name) { filters.push(`c.agent_id ILIKE $${paramIndex}`); params.push(`%${agent_name}%`); paramIndex++; }
  if (date_from) { filters.push(`c.date >= $${paramIndex}`); params.push(date_from); paramIndex++; }
  if (date_to) { filters.push(`c.date <= $${paramIndex}`); params.push(date_to); paramIndex++; }
  if (type) { filters.push(`c.type = $${paramIndex}`); params.push(type); paramIndex++; }
  if (status) { filters.push(`c.status = $${paramIndex}`); params.push(status); paramIndex++; }
  if (severity_alert === 'true' || severity_alert === true) {
    filters.push(`c.has_critical_non_compliant = true`);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  const query = `
    SELECT c.id, c.agent_id, c.type, c.date, c.status, c.has_critical_non_compliant,
           c.submitted_at, c.local_id, c.parent_checklist_id, t.title as template_title,
           c.data->'compliance_summary' as compliance_summary
    FROM checklists c
    LEFT JOIN checklist_templates t ON c.template_id = t.id
    ${whereClause}
    ORDER BY c.submitted_at DESC, c.date DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  const countQuery = `SELECT count(1) as total FROM checklists c ${whereClause}`;

  const { rows } = await cenos_pool.query(query, [...params, limit, offset]);
  const countRes = await cenos_pool.query(countQuery, params);
  const total = parseInt(countRes.rows[0].total, 10);

  return { data: rows, total, page, limit, totalPages: Math.ceil(total / limit) };
}

async function getChecklistsStats({ date_from, date_to }) {
  const todayStr = new Date().toISOString().split('T')[0];
  const dateFromVal = date_from || todayStr;
  const dateToVal = date_to || todayStr;

  const filters = ['c.status = $1'];
  const params = ['submitted'];
  let idx = 2;
  filters.push(`c.date >= $${idx}`); params.push(dateFromVal); idx++;
  filters.push(`c.date <= $${idx}`); params.push(dateToVal); idx++;
  const whereClause = `WHERE ${filters.join(' AND ')}`;

  const totalRes = await cenos_pool.query(
    `SELECT count(1) as total FROM checklists c ${whereClause}`, params
  );
  const totalSubmitted = parseInt(totalRes.rows[0].total, 10);

  const criticalRes = await cenos_pool.query(
    `SELECT count(1) as total FROM checklists c ${whereClause} AND c.has_critical_non_compliant = true`, params
  );
  const criticalCount = parseInt(criticalRes.rows[0].total, 10);

  const compRes = await cenos_pool.query(
    `SELECT
       count(1) as total_answers,
       count(case when ans->>'is_compliant' = 'true' then 1 end) as compliant_answers
     FROM checklists c, jsonb_array_elements(c.data->'answers') as ans
     ${whereClause}`,
    params
  );
  const totalAnswers = parseInt(compRes.rows[0].total_answers || 0, 10);
  const compliantAnswers = parseInt(compRes.rows[0].compliant_answers || 0, 10);
  const complianceRate = totalAnswers > 0 ? parseFloat(((compliantAnswers / totalAnswers) * 100).toFixed(1)) : 100;

  const pendingRes = await cenos_pool.query(
    `SELECT count(1) as total
     FROM login l
     WHERE l.id NOT IN (
       SELECT DISTINCT agent_id FROM checklists WHERE date = $1 AND type = 'official' AND status = 'submitted'
     )`,
    [todayStr]
  );
  const totalPending = parseInt(pendingRes.rows[0].total, 10);

  return {
    total_submitted_today: totalSubmitted,
    total_pending: totalPending,
    critical_non_compliant: criticalCount,
    compliance_rate: complianceRate,
    by_regional: []
  };
}

async function saveChecklistSubmission(agentId, data) {
  const {
    id,
    template_id,
    type = 'official',
    parent_checklist_id = null,
    date,
    local_id,
    answers = [],
    latitude = null,
    longitude = null,
    coordinates = null,
    template_title
  } = data;

  let signature_url = data.signature_url;
  let selfie_url = data.selfie_url;

  if (signature_url && signature_url.startsWith('data:')) {
    const proc = await processBase64Files({ url: signature_url }, agentId);
    signature_url = proc.url;
  }
  if (selfie_url && selfie_url.startsWith('data:')) {
    const proc = await processBase64Files({ url: selfie_url }, agentId);
    selfie_url = proc.url;
  }
  for (const ans of answers) {
    if (ans.photo_url && ans.photo_url.startsWith('data:')) {
      const proc = await processBase64Files({ url: ans.photo_url }, agentId);
      ans.photo_url = proc.url;
    }
  }

  const pool = cenos_pool;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    if (local_id) {
      const { rows: existingLocal } = await client.query(
        'SELECT * FROM checklists WHERE local_id = $1', [local_id]
      );
      if (existingLocal.length > 0) {
        await client.query('COMMIT');
        return existingLocal[0];
      }
    }

    let checklistId = id || crypto.randomUUID();
    let isEditing = false;

    if (type === 'official') {
      const { rows: existingOfficial } = await client.query(
        'SELECT * FROM checklists WHERE agent_id = $1 AND date = $2 AND type = \'official\' AND template_id = $3',
        [agentId, date, template_id]
      );
      if (existingOfficial.length > 0) {
        const existing = existingOfficial[0];
        const submittedAt = new Date(existing.submitted_at);
        const diffMinutes = (Date.now() - submittedAt.getTime()) / (1000 * 60);
        if (diffMinutes <= 10) {
          isEditing = true;
          checklistId = existing.id;
        } else {
          throw { status: 409, message: 'Checklist oficial do dia já foi enviado e o prazo de edição expirou (10 min).' };
        }
      }
    }

    // Compute has_critical_non_compliant from template data
    let hasCriticalNonCompliant = false;
    if (template_id) {
      const { rows: tRows } = await client.query(
        'SELECT data FROM checklist_templates WHERE id = $1', [template_id]
      );
      if (tRows.length > 0) {
        const sections = tRows[0].data?.sections || [];
        for (const ans of answers) {
          if (ans.is_compliant === false && ans.question_uuid) {
            for (const sec of sections) {
              const found = (sec.questions || []).find(q => q.uuid === ans.question_uuid);
              if (found && found.severity === 'critical') {
                hasCriticalNonCompliant = true;
                break;
              }
            }
            if (hasCriticalNonCompliant) break;
          }
        }
        // Validate observation when required
        for (const ans of answers) {
          if (ans.is_compliant === false && ans.question_uuid) {
            for (const sec of sections) {
              const found = (sec.questions || []).find(q => q.uuid === ans.question_uuid);
              if (found && found.requires_observation_if_nc && found.observation_required && (!ans.observation || !ans.observation.trim())) {
                throw { status: 400, message: `Observação obrigatória para a pergunta: ${found.label}` };
              }
            }
          }
        }
      }
    }

    // Compute compliance_summary
    const total = answers.length;
    const answered = answers.filter(a => a.is_compliant !== null).length;
    const exempt = answers.filter(a => a.is_exempt).length;
    const compliant = answers.filter(a => a.is_compliant === true).length;
    const non_compliant = answers.filter(a => a.is_compliant === false).length;
    const criticalNonCompliant = hasCriticalNonCompliant ? answers.filter(a => a.is_compliant === false && a.question_uuid).length : 0;

    const complianceData = {
      latitude,
      longitude,
      answers,
      compliance_summary: {
        total,
        answered,
        exempt,
        compliant,
        non_compliant,
        critical_non_compliant: criticalNonCompliant
      }
    };

    const now = new Date();

    if (isEditing) {
      await client.query(
        `UPDATE checklists
         SET signature_url = COALESCE($2, signature_url),
             selfie_url = COALESCE($3, selfie_url),
             has_critical_non_compliant = $4,
             data = $5,
             submitted_at = $6,
             synced_at = $6,
             updated_at = NOW()
         WHERE id = $1`,
        [checklistId, signature_url, selfie_url, hasCriticalNonCompliant, complianceData, now]
      );
    } else {
      await client.query(
        `INSERT INTO checklists (id, template_id, agent_id, type, parent_checklist_id, date, status,
                                 signature_url, selfie_url, has_critical_non_compliant, data,
                                 submitted_at, synced_at, local_id)
         VALUES ($1, $2, $3, $4, $5, $6, 'submitted',
                 $7, $8, $9, $10,
                 $11, $11, $12)`,
        [checklistId, template_id, agentId, type, parent_checklist_id, date,
         signature_url, selfie_url, hasCriticalNonCompliant, complianceData,
         now, local_id]
      );
    }

    await client.query('COMMIT');

    const { rows: result } = await client.query('SELECT * FROM checklists WHERE id = $1', [checklistId]);
    return result[0];

  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function deleteChecklist(id) {
  const { rowCount } = await cenos_pool.query('DELETE FROM checklists WHERE id = $1', [id]);
  return rowCount > 0;
}

// ==========================================
// DYNAMIC TEMPLATE MATCHING (Agent)
// ==========================================

/**
 * Returns the list of templates that an agent is REQUIRED to complete,
 * based on matching the agent's profile (cargo, regional, seccional, processo, estado)
 * against active templates with data.filters.
 *
 * Templates without filters (null or empty) match ALL active agents.
 */
async function getRequiredTemplatesForAgent(agentId) {
  const { rows: profileRows } = await cenos_pool.query(
    `SELECT col."Cargo" as cargo, col.regional, col.seccional, col."processo" as processo,
            col.estado, col.situacao
     FROM login l
     LEFT JOIN colaboradores col ON l.id = col."ID"
     WHERE l.id = $1`,
    [agentId]
  );
  const profile = profileRows[0] || {};
  if ((profile.situacao || '').toLowerCase() !== 'active') return [];

  const { rows: templates } = await cenos_pool.query(
    `SELECT id, title, data FROM checklist_templates
     WHERE is_active = true AND (estado IS NULL OR UPPER(estado) = UPPER($1))
     ORDER BY created_at DESC`,
    [profile.estado || null]
  );

  return templates.filter(t => {
    const f = t.data?.filters;
    if (!f) return true;
    const matchCargo = !f.cargo?.length || f.cargo.some(c => (profile.cargo || '').toUpperCase() === c.toUpperCase());
    const matchRegional = !f.regional?.length || f.regional.some(r => (profile.regional || '').toUpperCase() === r.toUpperCase());
    const matchSeccional = !f.seccional?.length || f.seccional.some(s => (profile.seccional || '').toUpperCase() === s.toUpperCase());
    const matchProcesso = !f.processo?.length || f.processo.some(p => (profile.processo || '').toUpperCase() === p.toUpperCase());
    return matchCargo && matchRegional && matchSeccional && matchProcesso;
  }).map(t => ({ id: t.id, title: t.title }));
}

/**
 * Wrapper that returns the status of all required templates for an agent on a given date.
 * Returns { checklist_required, required_templates: [{ id, title, submitted }] }
 */
async function getAgentTemplatesStatus(agentId, dateStr) {
  const required = await getRequiredTemplatesForAgent(agentId);
  if (required.length === 0) {
    return { checklist_required: false, required_templates: [] };
  }

  // Check which templates already have submitted checklists today
  const ids = required.map(t => t.id);
  const { rows: submittedRows } = await cenos_pool.query(
    `SELECT DISTINCT template_id FROM checklists
     WHERE agent_id = $1 AND date = $2 AND type = 'official' AND status = 'submitted'
     AND template_id = ANY($3::uuid[])`,
    [agentId, dateStr, ids]
  );
  const submittedIds = new Set(submittedRows.map(r => r.template_id));

  const requiredTemplates = required.map(t => ({
    id: t.id,
    title: t.title,
    submitted: submittedIds.has(t.id),
  }));

  const allSubmitted = requiredTemplates.every(t => t.submitted);

  return {
    checklist_required: true,
    all_submitted: allSubmitted,
    total_required: requiredTemplates.length,
    total_submitted: requiredTemplates.filter(t => t.submitted).length,
    required_templates: requiredTemplates,
  };
}

module.exports = {
  listTemplatesAdmin,
  listTemplatesForAgent,
  listTemplatesForAgentWithProfile,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  syncTemplate,
  getAgentTodayChecklist,
  getChecklistById,
  listChecklistsAdmin,
  getChecklistsStats,
  saveChecklistSubmission,
  deleteChecklist,
  getRequiredTemplatesForAgent,
  getAgentTemplatesStatus,
};
