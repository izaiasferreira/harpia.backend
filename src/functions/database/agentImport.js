const XLSX = require('xlsx');
const { cenos_pool } = require('../../db');

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
    const nome = row['NOME'] || row['Nome'] || '';
    const estado = (row['ESTADO'] || row['Estado'] || 'pi').toLowerCase();
    const regional = row['REGIONAL'] || row['Regional'] || '';
    const seccional = row['SECCIONAL'] || row['Seccional'] || '';
    const processo = row['PROCESSO'] || row['Processo'] || '';
    const gestor = row['GESTOR'] || row['Gestor'] || '';
    const cargo = row['CARGO'] || row['Cargo'] || '';
    const statusRaw = String(row['STATUS'] || row['Status'] || '').toLowerCase();
    const situacaoRaw = String(row['SITUAÇÃO'] || row['SITUACAO'] || row['Situação'] || '').toLowerCase();

    // Skip empty logic if the user didn't specify values (we won't overwrite existing with blank unless explicitly needed, but for simplicity we will just update with what is in the sheet)
    
    let status = true;
    if (statusRaw === 'inativo' || statusRaw === 'false' || statusRaw === '0') {
      status = false;
    }

    let situacao = 'active';
    for (const [key, val] of Object.entries(SITUACAO_MAP)) {
      if (situacaoRaw.includes(key)) {
        situacao = val;
        break;
      }
    }

    try {
      // Upsert logic
      const existing = await cenos_pool.query(`SELECT "ID" FROM colaboradores WHERE "ID" = $1`, [id]);
      
      if (existing.rows.length > 0) {
        // Update
        // Build dynamic update to avoid overwriting with empty if we don't want to? 
        // The instruction says to update everything based on the sheet. Let's update explicitly.
        await cenos_pool.query(`
          UPDATE colaboradores SET
            "Nome" = COALESCE(NULLIF($2, ''), "Nome"),
            estado = COALESCE(NULLIF($3, ''), estado),
            regional = COALESCE(NULLIF($4, ''), regional),
            seccional = COALESCE(NULLIF($5, ''), seccional),
            processo = COALESCE(NULLIF($6, ''), processo),
            "GESTOR IMEDIATO" = COALESCE(NULLIF($7, ''), "GESTOR IMEDIATO"),
            "Cargo" = COALESCE(NULLIF($8, ''), "Cargo"),
            status = $9,
            situacao = $10
          WHERE "ID" = $1
        `, [id, nome, estado, regional, seccional, processo, gestor, cargo, status, situacao]);
        
        successCount++;
        updatedIds.push(id);
      } else {
        // Insert
        await cenos_pool.query(`
          INSERT INTO colaboradores ("ID", "Nome", estado, regional, seccional, processo, "GESTOR IMEDIATO", "Cargo", status, situacao)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [id, nome, estado, regional, seccional, processo, gestor, cargo, status, situacao]);
        
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
