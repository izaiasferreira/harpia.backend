const XLSX = require('xlsx');
const { cenos_pool } = require('../../db');

const getChangedBy = (user) => user?.email || user?.id || user?.nome || 'unknown';

const VALID_STATUS = { 'ativo': true, 'inativo': false };
const SITUACAO_MAP = {
  'ativo': 'active',
  'férias': 'vocation',
  'ferias': 'vocation',
  'desligado': 'inactive',
  'afastado': 'away'
};

async function processAgentImport(fileBuffer, user) {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet);

  let successCount = 0;
  let errorCount = 0;
  const errors = [];
  const createdIds = [];
  const updatedIds = [];

  for (const [index, row] of rows.entries()) {
    const rawId = row['ID'] || row['id'] || row['Id'];
    if (!rawId) {
      errorCount++;
      errors.push(`Linha ${index + 2}: Matrícula (ID) não informada.`);
      continue;
    }

    const id = String(rawId).trim().toUpperCase();
    const matricula = row['MATRICULA'] || row['Matrícula'] || row['Matricula'] || '';
    const nome = row['NOME'] || row['Nome'] || '';
    const estado = (row['ESTADO'] || row['Estado'] || 'pi').toLowerCase();
    const regional = row['REGIONAL'] || row['Regional'] || '';
    const seccional = row['SECCIONAL'] || row['Seccional'] || '';
    const processo = row['PROCESSO'] || row['Processo'] || '';
    const gestor = row['GESTOR'] || row['Gestor'] || '';
    const cargo = row['CARGO'] || row['Cargo'] || '';

    const statusRaw = String(row['STATUS'] || row['Status'] || '').trim().toLowerCase();
    if (statusRaw && !(statusRaw in VALID_STATUS)) {
      errorCount++;
      errors.push(`Linha ${index + 2} (${id}): STATUS "${row['STATUS']}" inválido. Use: Ativo, Inativo`);
      continue;
    }
    const status = statusRaw ? VALID_STATUS[statusRaw] : true;

    const situacaoRaw = String(row['SITUAÇÃO'] || row['SITUACAO'] || row['Situação'] || row['Situacao'] || '').trim().toLowerCase();
    if (situacaoRaw && !(situacaoRaw in SITUACAO_MAP)) {
      errorCount++;
      errors.push(`Linha ${index + 2} (${id}): SITUAÇÃO "${row['SITUAÇÃO'] || row['SITUACAO']}" inválida. Use: Ativo, Férias, Desligado, Afastado`);
      continue;
    }
    const situacao = situacaoRaw ? SITUACAO_MAP[situacaoRaw] : 'active';

    if (estado && !['pi', 'ma'].includes(estado)) {
      errorCount++;
      errors.push(`Linha ${index + 2} (${id}): ESTADO "${row['ESTADO']}" inválido. Use: PI, MA`);
      continue;
    }

    try {
      const existing = await cenos_pool.query(`SELECT "ID", status, situacao FROM colaboradores WHERE "ID" = $1`, [id]);
      const changedBy = getChangedBy(user);
      
      if (existing.rows.length > 0) {
        const beforeStatus = existing.rows[0].status;
        const beforeSituacao = existing.rows[0].situacao;
        await cenos_pool.query(`
          UPDATE colaboradores SET
            "Nome" = COALESCE(NULLIF($2, ''), "Nome"),
            estado = COALESCE(NULLIF($3, ''), estado),
            regional = COALESCE(NULLIF($4, ''), regional),
            seccional = COALESCE(NULLIF($5, ''), seccional),
            processo = COALESCE(NULLIF($6, ''), processo),
            "GESTOR IMEDIATO" = COALESCE(NULLIF($7, ''), "GESTOR IMEDIATO"),
            "Cargo" = COALESCE(NULLIF($8, ''), "Cargo"),
            "MAT" = COALESCE(NULLIF($9, ''), "MAT"),
            status = $10,
            situacao = $11
          WHERE "ID" = $1
        `, [id, nome, estado, regional, seccional, processo, gestor, cargo, matricula, status, situacao]);
        
        const auditEntries = [];
        if (beforeStatus !== status) {
          auditEntries.push({ agente_id: id, field: 'status', from_value: String(beforeStatus), to_value: String(status), changed_by: changedBy });
        }
        if (beforeSituacao !== situacao) {
          auditEntries.push({ agente_id: id, field: 'situacao', from_value: beforeSituacao, to_value: situacao, changed_by: changedBy });
        }
        if (auditEntries.length > 0) {
          const values = auditEntries.map((_, i) =>
            `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`
          ).join(',');
          const flatParams = auditEntries.flatMap(e => [e.agente_id, e.field, e.from_value, e.to_value, e.changed_by]);
          await cenos_pool.query(
            `INSERT INTO agente_audit_log (agente_id, field, from_value, to_value, changed_by) VALUES ${values}`,
            flatParams
          );
        }
        
        successCount++;
        updatedIds.push(id);
      } else {
        await cenos_pool.query(`
          INSERT INTO colaboradores ("ID", "Nome", estado, regional, seccional, processo, "GESTOR IMEDIATO", "Cargo", "MAT", status, situacao)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [id, nome, estado, regional, seccional, processo, gestor, cargo, matricula, status, situacao]);
        
        const auditEntries = [
          { agente_id: id, field: 'status', from_value: null, to_value: String(status), changed_by: changedBy },
          { agente_id: id, field: 'situacao', from_value: null, to_value: situacao, changed_by: changedBy },
        ];
        const values = auditEntries.map((_, i) =>
          `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`
        ).join(',');
        const flatParams = auditEntries.flatMap(e => [e.agente_id, e.field, e.from_value, e.to_value, e.changed_by]);
        await cenos_pool.query(
          `INSERT INTO agente_audit_log (agente_id, field, from_value, to_value, changed_by) VALUES ${values}`,
          flatParams
        );
        
        successCount++;
        createdIds.push(id);
      }
    } catch (dbErr) {
      errorCount++;
      errors.push(`Linha ${index + 2} (${id}): ${dbErr.message}`);
    }
  }

  return {
    totalProcessed: rows.length,
    successCount,
    errorCount,
    created: createdIds.length,
    updated: updatedIds.length,
    errors
  };
}

module.exports = {
  processAgentImport
};
