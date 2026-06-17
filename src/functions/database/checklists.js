const crypto = require('crypto');
const { cenos_pool } = require('../../db');
const { processBase64Files } = require('./serviceNotes');

// ==========================================
// TEMPLATES (Admin)
// ==========================================

async function listTemplatesAdmin() {
  const { rows } = await cenos_pool.query(
    'SELECT * FROM checklist_templates ORDER BY created_at DESC'
  );
  return rows;
}

async function listTemplatesForAgent(agentEstado) {
  const { rows } = await cenos_pool.query(
    'SELECT * FROM checklist_templates WHERE is_active = true AND (UPPER(estado) = UPPER($1)) OR estado IS NULL ORDER BY created_at DESC',
    [agentEstado]
  );
  return rows;
}

async function getTemplateById(id, agentId = null) {
  const tRes = await cenos_pool.query(
    'SELECT * FROM checklist_templates WHERE id = $1',
    [id]
  );
  if (tRes.rows.length === 0) return null;
  const template = tRes.rows[0];

  const sRes = await cenos_pool.query(
    'SELECT * FROM checklist_sections WHERE template_id = $1 ORDER BY order_index ASC',
    [id]
  );
  const qRes = await cenos_pool.query(
    'SELECT * FROM checklist_questions WHERE template_id = $1 ORDER BY order_index ASC',
    [id]
  );

  const questions = qRes.rows;

  // Se agentId for fornecido, calcula isenção para cada pergunta
  if (agentId) {
    for (const q of questions) {
      q.is_exempt = false;
      q.exempt_until = null;
      if (q.exemption_days > 0) {
        const { rows: ansRows } = await cenos_pool.query(
          `SELECT ca.answered_at, ca.created_at
           FROM checklist_answers ca
           JOIN checklists c ON ca.checklist_id = c.id
           WHERE c.agent_id = $1 AND ca.question_id = $2 AND c.status = 'submitted' AND ca.is_compliant = true
           ORDER BY ca.created_at DESC LIMIT 1`,
          [agentId, q.id]
        );
        if (ansRows.length > 0) {
          const ans = ansRows[0];
          const lastDate = new Date(ans.answered_at || ans.created_at);
          const exemptUntilDate = new Date(lastDate.getTime() + q.exemption_days * 24 * 60 * 60 * 1000);
          if (exemptUntilDate > new Date()) {
            q.is_exempt = true;
            q.exempt_until = exemptUntilDate.toISOString().split('T')[0];
          }
        }
      }
    }
  }

  const sections = sRes.rows.map(s => ({
    ...s,
    questions: questions.filter(q => q.section_id === s.id)
  }));

  return { ...template, sections };
}

async function createTemplate({ title, description, created_by, estado }) {
  const { rows } = await cenos_pool.query(
    'INSERT INTO checklist_templates (title, description, created_by, estado) VALUES ($1, $2, $3, $4) RETURNING *',
    [title, description, created_by, estado || null]
  );
  return rows[0];
}

async function updateTemplate(id, { title, description, is_active, estado }) {
  const fields = [];
  const values = [id];
  let idx = 2;

  if (title !== undefined) { fields.push(`title = $${idx++}`); values.push(title); }
  if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }
  if (is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(is_active); }
  if (estado !== undefined) { fields.push(`estado = $${idx++}`); values.push(estado); }

  if (fields.length === 0) return null;

  const { rows } = await cenos_pool.query(
    `UPDATE checklist_templates SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    values
  );
  return rows[0];
}

async function deleteTemplate(id) {
  const { rows } = await cenos_pool.query(
    'UPDATE checklist_templates SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *',
    [id]
  );
  return rows[0];
}

// ==========================================
// SECTIONS (Admin)
// ==========================================

async function createSection(templateId, { title, order_index, section_color, section_icon }) {
  const { rows } = await cenos_pool.query(
    'INSERT INTO checklist_sections (template_id, title, order_index, section_color, section_icon) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [templateId, title, order_index, section_color || '#3B82F6', section_icon || 'ShieldCheck']
  );
  return rows[0];
}

async function updateSection(id, { title, order_index, section_color, section_icon }) {
  const { rows } = await cenos_pool.query(
    `UPDATE checklist_sections SET
      title = COALESCE($2, title),
      order_index = COALESCE($3, order_index),
      section_color = COALESCE($4, section_color),
      section_icon = COALESCE($5, section_icon)
     WHERE id = $1 RETURNING *`,
    [
      id,
      title !== undefined ? title : null,
      order_index !== undefined ? order_index : null,
      section_color !== undefined ? section_color : null,
      section_icon !== undefined ? section_icon : null
    ]
  );
  return rows[0];
}

async function deleteSection(id) {
  const { rows } = await cenos_pool.query(
    'DELETE FROM checklist_sections WHERE id = $1 RETURNING *',
    [id]
  );
  return rows[0];
}

// ==========================================
// QUESTIONS (Admin)
// ==========================================

async function createQuestion(sectionId, templateId, { label, required, requires_photo, requires_photo_always = false, severity, exemption_days, order_index, question_type = 'binary', options = null }) {
  const { rows } = await cenos_pool.query(
    `INSERT INTO checklist_questions (section_id, template_id, label, required, requires_photo, requires_photo_always, severity, exemption_days, order_index, question_type, options)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [sectionId, templateId, label, required, requires_photo, requires_photo_always, severity, exemption_days, order_index, question_type, options ? JSON.stringify(options) : null]
  );
  return rows[0];
}

async function updateQuestion(id, { label, required, requires_photo, requires_photo_always, severity, exemption_days, order_index, question_type, options }) {
  const opts = options === undefined ? undefined : JSON.stringify(options);
  const { rows } = await cenos_pool.query(
    `UPDATE checklist_questions
     SET label = COALESCE($2, label),
         required = COALESCE($3, required),
         requires_photo = COALESCE($4, requires_photo),
         severity = COALESCE($5, severity),
         exemption_days = COALESCE($6, exemption_days),
         order_index = COALESCE($7, order_index),
         question_type = COALESCE($8, question_type),
         options = COALESCE($9, options),
         requires_photo_always = COALESCE($10, requires_photo_always)
     WHERE id = $1 RETURNING *`,
    [
      id,
      label !== undefined ? label : null,
      required !== undefined ? required : null,
      requires_photo !== undefined ? requires_photo : null,
      severity !== undefined ? severity : null,
      exemption_days !== undefined ? exemption_days : null,
      order_index !== undefined ? order_index : null,
      question_type !== undefined ? question_type : null,
      opts !== undefined ? opts : null,
      requires_photo_always !== undefined ? requires_photo_always : null
    ]
  );
  return rows[0];
}

async function deleteQuestion(id) {
  const { rows } = await cenos_pool.query(
    'DELETE FROM checklist_questions WHERE id = $1 RETURNING *',
    [id]
  );
  return rows[0];
}

async function reorderQuestions(reorderArray) {
  const client = await cenos_pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of reorderArray) {
      await client.query('UPDATE checklist_questions SET order_index = $2 WHERE id = $1', [item.id, item.order_index]);
    }
    await client.query('COMMIT');
    return true;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ==========================================
// SUBMISSIONS & STATS (Agente & Admin)
// ==========================================

async function getAgentTodayChecklist(agentId, dateStr) {
  // Busca o checklist oficial do dia
  const query = `
    SELECT c.*, t.title as template_title
    FROM checklists c
    LEFT JOIN checklist_templates t ON c.template_id = t.id
    WHERE c.agent_id = $1 AND c.date = $2 AND c.type = 'official'
  `;
  const { rows } = await cenos_pool.query(query, [agentId, dateStr]);
  if (rows.length === 0) return null;
  
  const checklist = rows[0];

  // Busca as respostas
  const answersQuery = `
    SELECT ca.*, cq.label as question_label, cs.title as section_title, cs.section_color, cs.section_icon, cq.severity, cq.question_type, cq.options
    FROM checklist_answers ca
    LEFT JOIN checklist_questions cq ON ca.question_id = cq.id
    LEFT JOIN checklist_sections cs ON cq.section_id = cs.id
    WHERE ca.checklist_id = $1
  `;
  const { rows: answers } = await cenos_pool.query(answersQuery, [checklist.id]);
  checklist.answers = answers;

  // Busca os avulsos
  const supplementaryQuery = `
    SELECT id, submitted_at, (SELECT count(1) FROM checklist_answers WHERE checklist_id = checklists.id) as answers_count
    FROM checklists
    WHERE parent_checklist_id = $1 AND type = 'supplementary'
    ORDER BY submitted_at ASC
  `;
  const { rows: supplementaries } = await cenos_pool.query(supplementaryQuery, [checklist.id]);
  checklist.supplementaries = supplementaries;

  return checklist;
}

async function getChecklistById(id) {
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const whereClause = isUUID ? 'c.id = $1' : 'c.local_id = $1';

  const query = `
    SELECT c.*, t.title as template_title, l.id as agent_id, l.estado as agent_estado
    FROM checklists c
    LEFT JOIN checklist_templates t ON c.template_id = t.id
    LEFT JOIN login l ON c.agent_id = l.id
    WHERE ${whereClause}
  `;
  const { rows } = await cenos_pool.query(query, [id]);
  if (rows.length === 0) return null;
  const checklist = rows[0];

  // Busca dados do agente a partir de profiles/users se houver
  const agentDetailsQuery = `
    SELECT l.id, p.badges, l.estado
    FROM login l
    LEFT JOIN profiles p ON l.id = p.id
    WHERE l.id = $1
  `;
  const { rows: agentDetails } = await cenos_pool.query(agentDetailsQuery, [checklist.agent_id]);
  checklist.agent = {
    id: checklist.agent_id,
    name: checklist.agent_id, // caso não exista tabela profiles com nome
    estado: checklist.agent_estado
  };

  // Se houver inventário ou nome nas tabelas
  const { rows: invRows } = await cenos_pool.query('SELECT agente FROM inventory WHERE agente = $1 LIMIT 1', [checklist.agent_id]);
  // Tenta puxar nome se houver alguma correspondência
  checklist.agent.name = checklist.agent_id;

  const answersQuery = `
    SELECT ca.*, cq.label as question_label, cs.title as section_title, cs.section_color, cs.section_icon, cq.severity, cq.question_type, cq.options
    FROM checklist_answers ca
    LEFT JOIN checklist_questions cq ON ca.question_id = cq.id
    LEFT JOIN checklist_sections cs ON cq.section_id = cs.id
    WHERE ca.checklist_id = $1
  `;
  const { rows: answers } = await cenos_pool.query(answersQuery, [checklist.id]);
  checklist.answers = answers;

  // Calcula contadores de conformidade
  const total = answers.length;
  const answered = answers.filter(a => a.is_compliant !== null).length;
  const exempt = answers.filter(a => a.is_exempt).length;
  const compliant = answers.filter(a => a.is_compliant === true).length;
  const non_compliant = answers.filter(a => a.is_compliant === false).length;
  const critical_non_compliant = answers.filter(a => a.is_compliant === false && a.severity === 'critical').length;

  checklist.compliance_summary = {
    total,
    answered,
    exempt,
    compliant,
    non_compliant,
    critical_non_compliant
  };

  // Timeline de avulsos vinculados (apenas se for oficial)
  if (checklist.type === 'official') {
    const suppQuery = `
      SELECT id, submitted_at, (SELECT count(1) FROM checklist_answers WHERE checklist_id = checklists.id) as answers_count
      FROM checklists
      WHERE parent_checklist_id = $1 AND type = 'supplementary'
      ORDER BY submitted_at ASC
    `;
    const { rows: supps } = await cenos_pool.query(suppQuery, [checklist.id]);
    checklist.supplementaries = supps;
  }

  return checklist;
}

async function listChecklistsAdmin({ page = 1, limit = 10, regional_id, sectional_id, agent_name, date_from, date_to, type, severity_alert, status }) {
  const offset = (page - 1) * limit;
  const params = [];
  let paramIndex = 1;
  const filters = [];

  if (regional_id) {
    filters.push(`c.regional_id = $${paramIndex}`);
    params.push(regional_id);
    paramIndex++;
  }

  if (sectional_id) {
    filters.push(`c.sectional_id = $${paramIndex}`);
    params.push(sectional_id);
    paramIndex++;
  }

  if (agent_name) {
    filters.push(`c.agent_id ILIKE $${paramIndex}`);
    params.push(`%${agent_name}%`);
    paramIndex++;
  }

  if (date_from) {
    filters.push(`c.date >= $${paramIndex}`);
    params.push(date_from);
    paramIndex++;
  }

  if (date_to) {
    filters.push(`c.date <= $${paramIndex}`);
    params.push(date_to);
    paramIndex++;
  }

  if (type) {
    filters.push(`c.type = $${paramIndex}`);
    params.push(type);
    paramIndex++;
  }

  if (status) {
    filters.push(`c.status = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }

  if (severity_alert === 'true' || severity_alert === true) {
    filters.push(`c.has_critical_non_compliant = true`);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  const query = `
    SELECT c.*, t.title as template_title
    FROM checklists c
    LEFT JOIN checklist_templates t ON c.template_id = t.id
    ${whereClause}
    ORDER BY c.submitted_at DESC, c.date DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  const countQuery = `
    SELECT count(1) as total FROM checklists c
    ${whereClause}
  `;

  const { rows } = await cenos_pool.query(query, [...params, limit, offset]);
  const countRes = await cenos_pool.query(countQuery, params);

  const total = parseInt(countRes.rows[0].total, 10);
  const totalPages = Math.ceil(total / limit);

  return {
    data: rows,
    total,
    page,
    limit,
    totalPages
  };
}

async function getChecklistsStats({ regional_id, date_from, date_to }) {
  const params = [];
  let paramIndex = 1;
  const filters = ['c.status = \'submitted\''];

  // regional_id parameter kept but ignored as column is removed

  // Se nenhuma data fornecida, assume hoje para contagem superior
  const todayStr = new Date().toISOString().split('T')[0];
  const dateFromVal = date_from || todayStr;
  const dateToVal = date_to || todayStr;

  filters.push(`c.date >= $${paramIndex}`);
  params.push(dateFromVal);
  paramIndex++;

  filters.push(`c.date <= $${paramIndex}`);
  params.push(dateToVal);
  paramIndex++;

  const whereClause = `WHERE ${filters.join(' AND ')}`;

  // Total de checklists enviados
  const totalQuery = `SELECT count(1) as total FROM checklists c ${whereClause}`;
  const totalRes = await cenos_pool.query(totalQuery, params);
  const totalSubmitted = parseInt(totalRes.rows[0].total, 10);

  // Total com críticos
  const criticalQuery = `SELECT count(1) as total FROM checklists c ${whereClause} AND c.has_critical_non_compliant = true`;
  const criticalRes = await cenos_pool.query(criticalQuery, params);
  const criticalCount = parseInt(criticalRes.rows[0].total, 10);

  // Taxa de conformidade (%)
  const complianceQuery = `
    SELECT 
      count(1) as total_answers,
      count(case when ca.is_compliant = true then 1 end) as compliant_answers
    FROM checklist_answers ca
    JOIN checklists c ON ca.checklist_id = c.id
    ${whereClause}
  `;
  const compRes = await cenos_pool.query(complianceQuery, params);
  const totalAnswers = parseInt(compRes.rows[0].total_answers || 0, 10);
  const compliantAnswers = parseInt(compRes.rows[0].compliant_answers || 0, 10);
  const complianceRate = totalAnswers > 0 ? parseFloat(((compliantAnswers / totalAnswers) * 100).toFixed(1)) : 100;

  // Total pendente: agentes ativos que não enviaram hoje
  // (Puxa do cadastro de login)
  const pendingQuery = `
    SELECT count(1) as total 
    FROM login l
    WHERE l.id NOT IN (
      SELECT DISTINCT agent_id FROM checklists WHERE date = $1 AND type = 'official' AND status = 'submitted'
    )
  `;
  const pendingRes = await cenos_pool.query(pendingQuery, [todayStr]);
  const totalPending = parseInt(pendingRes.rows[0].total, 10);

  // Por regional
  const byRegionalQuery = `
    SELECT br.name as regional, count(1) as total,
           count(case when c.has_critical_non_compliant = false then 1 end) as compliant
    FROM checklists c
    LEFT JOIN branches br ON c.regional_id = br.id
    ${whereClause}
    GROUP BY br.name
  `;
  const byRegRes = await cenos_pool.query(byRegionalQuery, params);

  return {
    total_submitted_today: totalSubmitted,
    total_pending: totalPending,
    critical_non_compliant: criticalCount,
    compliance_rate: complianceRate,
    by_regional: byRegRes.rows
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
    coordinates = null
  } = data;

  // Process base64 files (signature, selfie, and answer photos) via MinIO
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

    // 1. Idempotency check by local_id
    if (local_id) {
      const { rows: existingLocal } = await client.query(
        'SELECT * FROM checklists WHERE local_id = $1',
        [local_id]
      );
      if (existingLocal.length > 0) {
        await client.query('COMMIT');
        return existingLocal[0];
      }
    }

    let checklistId = id || crypto.randomUUID();
    let isEditing = false;

    // 3. Official checklist single submit rule and 10min edit window
    if (type === 'official') {
      const { rows: existingOfficial } = await client.query(
        'SELECT * FROM checklists WHERE agent_id = $1 AND date = $2 AND type = \'official\'',
        [agentId, date]
      );

      if (existingOfficial.length > 0) {
        const existing = existingOfficial[0];
        const submittedAt = new Date(existing.submitted_at);
        const diffMinutes = (Date.now() - submittedAt.getTime()) / (1000 * 60);

        if (diffMinutes <= 10) {
          isEditing = true;
          checklistId = existing.id;
          await client.query('DELETE FROM checklist_media WHERE checklist_id = $1', [checklistId]);
          await client.query('DELETE FROM checklist_answers WHERE checklist_id = $1', [checklistId]);
        } else {
          throw { status: 409, message: 'Checklist oficial do dia já foi enviado e o prazo de edição expirou (10 min).' };
        }
      }
    }

    // 4. Calculate has_critical_non_compliant
    let hasCriticalNonCompliant = false;
    for (const ans of answers) {
      if (ans.is_compliant === false) {
        const { rows: qRows } = await client.query(
          'SELECT severity FROM checklist_questions WHERE id = $1',
          [ans.question_id]
        );
        if (qRows.length > 0 && qRows[0].severity === 'critical') {
          hasCriticalNonCompliant = true;
        }
      }
    }

    // 5. Insert or update checklist row
    let checklist;
    if (isEditing) {
      const { rows } = await client.query(
        `UPDATE checklists
         SET signature_url = COALESCE($2, signature_url),
             selfie_url = COALESCE($3, selfie_url),
             latitude = COALESCE($4, latitude),
             longitude = COALESCE($5, longitude),
             coordinates = COALESCE($6, coordinates),
             has_critical_non_compliant = $7,
             submitted_at = NOW(),
             updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [checklistId, signature_url, selfie_url, latitude, longitude, coordinates, hasCriticalNonCompliant]
      );
      checklist = rows[0];
    } else {
      const { rows } = await client.query(
        `INSERT INTO checklists (id, template_id, agent_id, type, parent_checklist_id, date, status, signature_url, selfie_url, submitted_at, local_id, latitude, longitude, coordinates, has_critical_non_compliant)
         VALUES ($1, $2, $3, $4, $5, $6, 'submitted', $7, $8, NOW(), $9, $10, $11, $12, $13)
         RETURNING *`,
        [checklistId, template_id, agentId, type, parent_checklist_id, date, signature_url, selfie_url, local_id, latitude, longitude, coordinates, hasCriticalNonCompliant]
      );
      checklist = rows[0];
    }

    // 6. Insert answers and photo media
    for (const ans of answers) {
      const ansId = crypto.randomUUID();
      let isExempt = ans.is_exempt || false;
      let exemptUntil = null;
      if (isExempt) {
        const { rows: qRows } = await client.query('SELECT exemption_days FROM checklist_questions WHERE id = $1', [ans.question_id]);
        if (qRows.length > 0 && qRows[0].exemption_days > 0) {
          const uDate = new Date();
          uDate.setDate(uDate.getDate() + qRows[0].exemption_days);
          exemptUntil = uDate.toISOString().split('T')[0];
        }
      }

      await client.query(
        `INSERT INTO checklist_answers (id, checklist_id, question_id, is_compliant, is_exempt, exempt_until, photo_url, answer_value, answered_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [ansId, checklistId, ans.question_id, ans.is_compliant, isExempt, exemptUntil, ans.photo_url, ans.answer_value || null]
      );

      if (ans.photo_url) {
        await client.query(
          `INSERT INTO checklist_media (checklist_id, answer_id, media_type, url, timestamp_overlay)
           VALUES ($1, $2, 'answer_photo', $3, NOW())`,
          [checklistId, ansId, ans.photo_url]
        );
      }
    }

    // Insert main media files (selfie and signature)
    if (signature_url) {
      await client.query(
        `INSERT INTO checklist_media (checklist_id, media_type, url)
         VALUES ($1, 'signature', $2)`,
        [checklistId, signature_url]
      );
    }
    if (selfie_url) {
      await client.query(
        `INSERT INTO checklist_media (checklist_id, media_type, url, timestamp_overlay)
         VALUES ($1, 'selfie', $2, NOW())`,
        [checklistId, selfie_url]
      );
    }

    await client.query('COMMIT');
    return checklist;

  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function syncTemplate(id, templateData) {
  const client = await cenos_pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Update Template
    await client.query(
      `UPDATE checklist_templates SET title = $2, description = $3, estado = $4 WHERE id = $1`,
      [id, templateData.title, templateData.description, templateData.estado || null]
    );

    const activeSectionIds = [];
    const activeQuestionIds = [];

    // 2. Upsert Sections
    for (let i = 0; i < (templateData.sections || []).length; i++) {
      const sec = templateData.sections[i];
      let sectionId = sec.id;
      
      if (typeof sectionId === 'string' && sectionId.startsWith('temp_')) {
        const { rows: secRows } = await client.query(
          `INSERT INTO checklist_sections (template_id, title, order_index, section_color, section_icon)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [id, sec.title, i, sec.section_color || '#3B82F6', sec.section_icon || 'ShieldCheck']
        );
        sectionId = secRows[0].id;
      } else {
        await client.query(
          `UPDATE checklist_sections SET title = $2, order_index = $3, section_color = $4, section_icon = $5 WHERE id = $1`,
          [sectionId, sec.title, i, sec.section_color || '#3B82F6', sec.section_icon || 'ShieldCheck']
        );
      }
      activeSectionIds.push(sectionId);

      // 3. Upsert Questions
      for (let j = 0; j < (sec.questions || []).length; j++) {
        const q = sec.questions[j];
        let questionId = q.id;
        const opts = q.options === undefined ? null : JSON.stringify(q.options);
        
        if (typeof questionId === 'string' && questionId.startsWith('temp_')) {
          const { rows: qRows } = await client.query(
            `INSERT INTO checklist_questions (section_id, template_id, label, required, requires_photo, requires_photo_always, severity, exemption_days, order_index, question_type, options)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
            [sectionId, id, q.label, q.required ?? true, q.requires_photo ?? false, q.requires_photo_always ?? false, q.severity || 'medium', q.exemption_days || 0, j, q.question_type || 'binary', opts]
          );
          questionId = qRows[0].id;
        } else {
          await client.query(
            `UPDATE checklist_questions SET section_id = $11, label = $2, required = $3, requires_photo = $4, requires_photo_always = $5, severity = $6, exemption_days = $7, order_index = $8, question_type = $9, options = $10 WHERE id = $1`,
            [questionId, q.label, q.required ?? true, q.requires_photo ?? false, q.requires_photo_always ?? false, q.severity || 'medium', q.exemption_days || 0, j, q.question_type || 'binary', opts, sectionId]
          );
        }
        activeQuestionIds.push(questionId);
      }
    }

    // 4. Delete removed questions
    if (activeQuestionIds.length > 0) {
      await client.query(
        `DELETE FROM checklist_questions WHERE template_id = $1 AND id != ALL($2::uuid[])`,
        [id, activeQuestionIds]
      );
    } else {
      await client.query(`DELETE FROM checklist_questions WHERE template_id = $1`, [id]);
    }

    // 5. Delete removed sections
    if (activeSectionIds.length > 0) {
      await client.query(
        `DELETE FROM checklist_sections WHERE template_id = $1 AND id != ALL($2::uuid[])`,
        [id, activeSectionIds]
      );
    } else {
      await client.query(`DELETE FROM checklist_sections WHERE template_id = $1`, [id]);
    }

    await client.query('COMMIT');
    return true;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  listTemplatesAdmin,
  listTemplatesForAgent,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  syncTemplate,
  createSection,
  updateSection,
  deleteSection,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  reorderQuestions,
  getAgentTodayChecklist,
  getChecklistById,
  listChecklistsAdmin,
  getChecklistsStats,
  saveChecklistSubmission,
};
