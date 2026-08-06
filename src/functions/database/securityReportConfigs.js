const { sinergia_pool } = require('../../db');

async function ensureTable() {
  await sinergia_pool.query(`
    CREATE TABLE IF NOT EXISTS security_report_configs (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      config_type VARCHAR(20) NOT NULL DEFAULT 'hazards',
      estado VARCHAR(2),
      data JSONB NOT NULL DEFAULT '{}',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await sinergia_pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'security_report_configs' AND column_name = 'config_type') THEN
        ALTER TABLE security_report_configs ADD COLUMN config_type VARCHAR(20) NOT NULL DEFAULT 'hazards';
      END IF;
    END $$;
  `);
}

async function listSecurityReportConfigs(user) {
  await ensureTable();
  const isAdmin = user && (user.role || '').toLowerCase().includes('admin');
  if (isAdmin) {
    const { rows } = await sinergia_pool.query(
      'SELECT * FROM security_report_configs ORDER BY created_at DESC'
    );
    return rows;
  }
  const allowedPools = getUserAllowedStatePools(user);
  const allowedStates = allowedPools.map(p => p.state.toUpperCase());
  if (allowedStates.length === 0) return [];
  const { rows } = await sinergia_pool.query(
    `SELECT * FROM security_report_configs
     WHERE is_active = true AND (estado IS NULL OR UPPER(estado) = ANY($1::varchar[]))
     ORDER BY created_at DESC`,
    [allowedStates]
  );
  return rows;
}

function getUserAllowedStatePools(user) {
  if (!user) return [];
  const isMainAdmin = user && (user.role || '').toLowerCase().includes('admin');
  const userFilters = user?.permissions?.map(p => p.filters).flat() || [];
  const statesFilters = userFilters.filter(f => f.type === 'estado').map(f => f.value.toLowerCase());
  const available = [];
  if (isMainAdmin || statesFilters.includes('pi')) available.push({ state: 'pi' });
  if (isMainAdmin || statesFilters.includes('ma')) available.push({ state: 'ma' });
  return available;
}

async function getSecurityReportConfig(id) {
  await ensureTable();
  const { rows } = await sinergia_pool.query(
    'SELECT * FROM security_report_configs WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

async function createSecurityReportConfig({ title, config_type, estado, data, is_active }) {
  await ensureTable();
  const { rows } = await sinergia_pool.query(
    `INSERT INTO security_report_configs (title, config_type, estado, data, is_active)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [title, config_type || 'hazards', estado || null, JSON.stringify(data || {}), is_active !== false]
  );
  return rows[0];
}

async function updateSecurityReportConfig(id, fields) {
  await ensureTable();
  const sets = [];
  const params = [];
  let idx = 1;
  if (fields.title !== undefined) { sets.push(`title = $${idx++}`); params.push(fields.title); }
  if (fields.config_type !== undefined) { sets.push(`config_type = $${idx++}`); params.push(fields.config_type); }
  if (fields.estado !== undefined) { sets.push(`estado = $${idx++}`); params.push(fields.estado || null); }
  if (fields.data !== undefined) { sets.push(`data = $${idx++}`); params.push(JSON.stringify(fields.data)); }
  if (fields.is_active !== undefined) { sets.push(`is_active = $${idx++}`); params.push(fields.is_active); }
  if (sets.length === 0) return null;
  sets.push(`updated_at = NOW()`);
  params.push(id);
  const { rows } = await sinergia_pool.query(
    `UPDATE security_report_configs SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    params
  );
  return rows[0] || null;
}

async function deleteSecurityReportConfig(id) {
  await ensureTable();
  const { rows } = await sinergia_pool.query(
    'DELETE FROM security_report_configs WHERE id = $1 RETURNING id',
    [id]
  );
  return rows[0] || null;
}

async function getAgentProfileById(agentId) {
  const { rows } = await sinergia_pool.query(
    `SELECT "ID", "Cargo", regional, seccional, estado FROM colaboradores WHERE LOWER("ID") = LOWER($1)`,
    [agentId]
  );
  
  if (rows.length > 0) {
    const r = rows[0];
    const profile = {
      id: r.ID,
      cargo: (r.Cargo || '').trim(),
      regional: (r.regional || '').trim(),
      seccional: (r.seccional || '').trim(),
      estado: (r.estado || '').toLowerCase(),
    }
    return profile;
  }
  const { rows: loginRows } = await sinergia_pool.query(
    'SELECT estado FROM login WHERE id = $1',
    [agentId]
  );
  if (loginRows.length === 0) return null;
  const profile = {
    id: agentId,
    cargo: '',
    regional: '',
    seccional: '',
    estado: (loginRows[0].estado || '').toLowerCase(),
  };
  return profile;
}

function agentMatchesFilters(profile, filters) {

  if (!filters) { 
    return true; 
  }
  if (filters.cargo?.length) {
    const match = filters.cargo.some(c => c.toUpperCase() === (profile.cargo || '').toUpperCase());
    if (!match) return false;
  }
  if (filters.regional?.length) {
    const match = filters.regional.some(r => r.toUpperCase() === (profile.regional || '').toUpperCase());
    if (!match) return false;
  }
  if (filters.seccional?.length) {
    const match = filters.seccional.some(s => s.toUpperCase() === (profile.seccional || '').toUpperCase());
    if (!match) return false;
  }
  return true;
}

async function getMatchingSecurityReportConfigs(profile) {
  await ensureTable();
  if (!profile) { return []; }
  const { rows } = await sinergia_pool.query(
    `SELECT * FROM security_report_configs
     WHERE is_active = true AND (estado IS NULL OR LOWER(estado) = LOWER($1))
     ORDER BY created_at DESC`,
    [profile.estado]
  );
 
  const matching = rows.filter(r => {
    const filters = r.data?.filters;
    return agentMatchesFilters(profile, filters);
  });
  
  return matching;
}

function mergeConfigTypes(configs) {
  const mergedPerigos = [];
  const mergedTipos = [];
  const seenPerigos = new Set();
  const seenTipos = new Set();
  for (const cfg of configs) {
    if (cfg.config_type !== 'hazards') continue;
    const perigos = cfg.data?.perigos || [];
    for (const p of perigos) {
      if (!seenPerigos.has(p.valor)) {
        seenPerigos.add(p.valor);
        mergedPerigos.push(p);
      }
    }
  }
  for (const cfg of configs) {
    if (cfg.config_type !== 'accidents') continue;
    const tipos = cfg.data?.tipos_acidente || [];
    for (const t of tipos) {
      if (!seenTipos.has(t.valor)) {
        seenTipos.add(t.valor);
        mergedTipos.push(t);
      }
    }
  }
  mergedPerigos.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  mergedTipos.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  return { perigos: mergedPerigos, tipos_acidente: mergedTipos };
}

function matchesScope(config, { regional, seccional }) {
  const filters = config.data?.filters;
  if (!filters) return true;
  if (filters.regional?.length) {
    const match = filters.regional.some(r => r.toUpperCase() === (regional || '').toUpperCase());
    if (!match) return false;
  }
  if (filters.seccional?.length) {
    const match = filters.seccional.some(s => s.toUpperCase() === (seccional || '').toUpperCase());
    if (!match) return false;
  }
  return true;
}

async function getMergedSecurityReportConfigs({ estado, regional, seccional }) {
  await ensureTable();
  const params = [];
  let where = 'is_active = true';
  if (estado) {
    params.push(estado);
    where += ` AND (estado IS NULL OR LOWER(estado) = LOWER($${params.length}))`;
  }
  const { rows } = await sinergia_pool.query(
    `SELECT * FROM security_report_configs WHERE ${where} ORDER BY created_at DESC`,
    params
  );
  const matching = rows.filter(r => matchesScope(r, { regional, seccional }));
  return mergeConfigTypes(matching);
}

async function getAgentSecurityReportConfig(agentId) {
  const profile = await getAgentProfileById(agentId);
  if (!profile) { return { hasAccess: false, perigos: [], tipos_acidente: [] }; }
  const configs = await getMatchingSecurityReportConfigs(profile);
  if (configs.length === 0) { return { hasAccess: false, perigos: [], tipos_acidente: [] }; }
  const hazardConfigs = configs.filter(c => c.config_type === 'hazards');
  const accidentConfigs = configs.filter(c => c.config_type === 'accidents');
  const { perigos, tipos_acidente } = mergeConfigTypes(configs);
  const hasAccess = hazardConfigs.length > 0 || accidentConfigs.length > 0;
  return { hasAccess, perigos, tipos_acidente };
}

async function checkAgentHasAccess(agentId) {
  const profile = await getAgentProfileById(agentId);
  if (!profile) return false;
  const configs = await getMatchingSecurityReportConfigs(profile);
  return configs.length > 0;
}

module.exports = {
  listSecurityReportConfigs,
  getSecurityReportConfig,
  createSecurityReportConfig,
  updateSecurityReportConfig,
  deleteSecurityReportConfig,
  getAgentSecurityReportConfig,
  getMergedSecurityReportConfigs,
  checkAgentHasAccess,
};
