const XLSX = require('xlsx');
const { cenos_pool } = require('../../db');
const { getColaboradoresFilter } = require('./admin');

function normalizeName(str) {
  if (!str) return '';
  return String(str)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function buildAgentKey(colaborador, gestor) {
  return `${normalizeName(colaborador)}|${normalizeName(gestor)}`;
}

const SITUACAO_LABEL = {
  active: 'Ativo',
  vocation: 'Férias',
  inactive: 'Desligado',
  away: 'Afastado',
};

async function processExcelChecklist(fileBuffer, user) {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

  const excelCompositeKeys = new Set();
  const excelNomeOnlyKeys = new Set();
  const excelUnknownKeys = [];
  for (const row of rows) {
    const colaborador = row['Colaborador'];
    const gestor = row['Supervisor'];
    if (!colaborador) continue;
    const key = buildAgentKey(colaborador, gestor);
    excelCompositeKeys.add(key);
    excelNomeOnlyKeys.add(normalizeName(colaborador));
    excelUnknownKeys.push({ colaborador: String(colaborador).trim(), gestor, key });
  }

  const filter = getColaboradoresFilter(user, { includeAllStates: true });
  let query = `SELECT "ID", "Nome", "MAT", "GESTOR IMEDIATO", "Cargo", regional, seccional, estado, situacao, status, processo FROM colaboradores`;
  if (filter.whereClause) {
    query += ` ${filter.whereClause}`;
  }
  query += ` ORDER BY "Nome" ASC`;

  const { rows: dbAgents } = await cenos_pool.query(query, filter.params);

  const completed = [];
  const pending = [];
  const exempted = [];

  for (const agent of dbAgents) {
    const nome = agent['Nome'] || '';
    const gestor = agent['GESTOR IMEDIATO'] || '';
    const nomeKey = normalizeName(nome);
    const gestorKey = normalizeName(gestor);

    const isExempt = agent.situacao !== 'active' || agent.status === false;
    if (isExempt) {
      const motivos = [];
      if (agent.situacao !== 'active') motivos.push(`${SITUACAO_LABEL[agent.situacao] || agent.situacao}`);
      if (agent.status === false) motivos.push('Inativo');
      exempted.push({
        id: agent['ID'],
        mat: agent['MAT'],
        nome, gestor, cargo: agent['Cargo'],
        regional: agent.regional, seccional: agent.seccional,
        estado: agent.estado, processo: agent.processo,
        motivo: motivos.join('; ')
      });
      continue;
    }

    let matched;
    if (gestorKey) {
      const dbKey = `${nomeKey}|${gestorKey}`;
      matched = excelCompositeKeys.has(dbKey);
    } else {
      matched = excelNomeOnlyKeys.has(nomeKey);
    }

    if (matched) {
      completed.push({
        id: agent['ID'], mat: agent['MAT'], nome, gestor,
        cargo: agent['Cargo'], regional: agent.regional,
        seccional: agent.seccional, estado: agent.estado
      });
    } else {
      pending.push({
        id: agent['ID'], mat: agent['MAT'], nome, gestor,
        cargo: agent['Cargo'], regional: agent.regional,
        seccional: agent.seccional, estado: agent.estado
      });
    }
  }

  const pendingByRegional = groupBy(pending, 'regional');
  const pendingBySeccional = groupBy(pending, 'seccional');

  return {
    total_agents: dbAgents.length,
    total_in_planilha: new Set([...excelCompositeKeys, ...excelNomeOnlyKeys]).size,
    completed_count: completed.length,
    pending_count: pending.length,
    exempted_count: exempted.length,
    pending_by_regional: pendingByRegional,
    pending_by_seccional: pendingBySeccional,
    pending_agents: pending,
    completed_agents: completed,
    exempted_agents: exempted,
    planilha: excelUnknownKeys
  };
}

function groupBy(arr, field) {
  const map = {};
  for (const item of arr) {
    const key = item[field] || '(sem ' + field + ')';
    if (!map[key]) map[key] = { group: key, count: 0, agents: [] };
    map[key].count++;
    map[key].agents.push(item);
  }
  return Object.values(map).sort((a, b) => b.count - a.count);
}

module.exports = { processExcelChecklist };
