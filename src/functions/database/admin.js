const { VALID_STATE_VALUES } = require('../../constants/states');
const axios = require('axios');
const { pi_pool, ma_pool, localizacoes_pi_pool, cenos_pool } = require('../../db');
const { today } = require('../../utils/dates');
const { normalizeAgentId, normalizeAgentName, normalizeTextUpper } = require('../../utils/agentNormalize');

const getChangedBy = (user) => user?.nome || user?.email || user?.id || 'unknown';

// Normaliza um filtro em lista de valores (aceita string única, comma-separada ou array)
const toList = (v) => {
    if (v == null || v === '') return [];
    const arr = Array.isArray(v) ? v : String(v).split(',').map(s => s.trim()).filter(Boolean);
    return arr;
};

// Monta cláusula SQL para filtro multi-valor (com suporte a __VAZIO__)
const buildInClause = (raw, column, idx) => {
    const list = toList(raw);
    if (list.length === 0) return { sql: '', param: undefined, idx };
    const hasVazio = list.includes('__VAZIO__');
    const vals = list.filter(v => v !== '__VAZIO__');
    if (vals.length === 0) {
        return { sql: ` AND (${column} IS NULL OR TRIM(${column}) = '')`, param: undefined, idx };
    }
    const sql = hasVazio
        ? ` AND (${column} = ANY($${idx}) OR ${column} IS NULL OR TRIM(${column}) = '')`
        : ` AND ${column} = ANY($${idx})`;
    return { sql, param: vals, idx: idx + 1 };
};

async function insert_agent_audit_logs(entries) {
  if (!entries || entries.length === 0) return;
  const values = [];
  const params = [];
  let idx = 1;
  for (const e of entries) {
    values.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
    params.push(e.agente_id, e.field, e.from_value, e.to_value, e.changed_by);
  }
  await cenos_pool.query(
    `INSERT INTO agente_audit_log (agente_id, field, from_value, to_value, changed_by) VALUES ${values.join(',')}`,
    params
  );
}


const userIsAdmin = (user) => {
    if (!user || !user.role) return false;
    return user.role.toLowerCase().includes('admin');
}


const setor = {
    "NEG": 'NEGOCIAÇÃO',
    "LEI": 'LEITURA',
    "COB": 'COBRANÇA'
}
const veiculo = {
    "MOT": 'AGENTE COMERCIAL MOTOCICLISTA',
    "PE": 'AGENTE COMERCIAL A PÉ',
    "PÉ": 'AGENTE COMERCIAL A PÉ'
}

const getUserAllowedStatePools = (user) => {
    if (!user) return [];

    const isMainAdmin = userIsAdmin(user);
    const userFilters = user?.permissions?.map(p => p.filters).flat() || [];
    const statesFilters = userFilters.filter(f => f.type === 'estado').map(f => f.value.toLowerCase());

    const available = [];
    if (isMainAdmin || statesFilters.includes('pi')) available.push({ state: 'pi', pool: pi_pool });
    if (isMainAdmin || statesFilters.includes('ma')) available.push({ state: 'ma', pool: ma_pool });
    return available;
};

const getFilterUser = (user) => {
    const userFilters = user?.permissions?.map(p => p.filters).flat() || [];
    const othersFilters = userFilters.filter(f => f.type !== 'estado')
    return othersFilters.length > 0 ? othersFilters[0] : null;
}

/**
 * Retorna as condições de filtro para consultas na tabela colaboradores
 * com base nas permissões do usuário administrativo.
 *
 * @param {Object} user - Objeto do usuário (req.user)
 * @param {Object} options - Opções adicionais
 * @param {boolean} options.includeAllStates - Se true, retorna todos os estados permitidos (não apenas um)
 * @returns {Object} Objeto com { whereClause, params, allowedStates }
 */
const getColaboradoresFilter = (user, options = {}) => {
    const isMainAdmin = userIsAdmin(user);

    // Se for admin, retorna tudo
    if (isMainAdmin) {
        return {
            whereClause: '',
            params: [],
            allowedStates: VALID_STATE_VALUES,
            isAdmin: true
        };
    }

    const permissions = user?.permissions || [];
    const params = [];
    let paramIndex = 1;
    const allowedStates = new Set();
    const permissionConditions = [];

    if (permissions.length === 0) {
        // Se o usuário não tiver nenhuma permissão, usa seu próprio estado como fallback
        if (user?.estado) {
            const estado = user.estado.toLowerCase();
            allowedStates.add(estado);
            params.push(estado);
            permissionConditions.push(`estado = $${paramIndex++}`);
        }
    } else {
        permissions.forEach(perm => {
            const filters = perm.filters || [];
            const filtersByType = {};
            filters.forEach(f => {
                const t = f.type;
                if (!filtersByType[t]) filtersByType[t] = [];
                filtersByType[t].push(f.value.toLowerCase());
            });

            const permAnds = [];
            
            // Filtro por estado
            let estadosPermitidos = filtersByType['estado'] || [];
            if (estadosPermitidos.length === 0 && user?.estado) {
                estadosPermitidos.push(user.estado.toLowerCase());
            }
            if (estadosPermitidos.length > 0) {
                estadosPermitidos.forEach(e => allowedStates.add(e));
                if (estadosPermitidos.length === 1) {
                    permAnds.push(`estado = $${paramIndex}`);
                    params.push(estadosPermitidos[0]);
                } else {
                    permAnds.push(`estado = ANY($${paramIndex})`);
                    params.push(estadosPermitidos);
                }
                paramIndex++;
            }

            // Filtro por regional
            const regionaisPermitidas = filtersByType['regional'] || [];
            if (regionaisPermitidas.length > 0) {
                if (regionaisPermitidas.length === 1) {
                    permAnds.push(`LOWER("regional") = $${paramIndex}`);
                    params.push(regionaisPermitidas[0]);
                } else {
                    permAnds.push(`LOWER("regional") = ANY($${paramIndex})`);
                    params.push(regionaisPermitidas);
                }
                paramIndex++;
            }

            // Filtro por seccional
            const seccionaisPermitidas = filtersByType['seccional'] || [];
            if (seccionaisPermitidas.length > 0) {
                if (seccionaisPermitidas.length === 1) {
                    permAnds.push(`LOWER("seccional") = $${paramIndex}`);
                    params.push(seccionaisPermitidas[0]);
                } else {
                    permAnds.push(`LOWER("seccional") = ANY($${paramIndex})`);
                    params.push(seccionaisPermitidas);
                }
                paramIndex++;
            }

            // Filtro por gestor
            const gestoresPermitidos = filtersByType['gestor'] || [];
            if (gestoresPermitidos.length > 0) {
                if (gestoresPermitidos.length === 1) {
                    permAnds.push(`LOWER("GESTOR IMEDIATO") = $${paramIndex}`);
                    params.push(gestoresPermitidos[0]);
                } else {
                    permAnds.push(`LOWER("GESTOR IMEDIATO") = ANY($${paramIndex})`);
                    params.push(gestoresPermitidos);
                }
                paramIndex++;
            }

            if (permAnds.length > 0) {
                permissionConditions.push(`(${permAnds.join(' AND ')})`);
            }
        });
    }

    let whereClause = '';
    if (permissionConditions.length > 0) {
        whereClause = `WHERE (${permissionConditions.join(' OR ')})`;
    } else {
        whereClause = 'WHERE 1=0'; // Sem permissões e sem estado fallback -> bloqueia acesso
    }

    return {
        whereClause,
        params,
        allowedStates: Array.from(allowedStates),
        isAdmin: false
    };
};

/**
 * Aplica filtro de permissão a um array de resultados
 * Útil para filtrar resultados em memória quando não é possível usar SQL
 *
 * @param {Array} results - Array de resultados a filtrar
 * @param {Object} user - Objeto do usuário
 * @param {string} idField - Nome do campo que contém o ID do agente
 * @returns {Array} Resultados filtrados
 */
const applyColaboradoresFilter = async (results, user, idField = 'agente') => {
    if (!results || results.length === 0) return results;

    const isMainAdmin = userIsAdmin(user);
    if (isMainAdmin) return results;

    const permissions = user?.permissions || [];
    
    // JS Filter logic corresponding to buildUserPermissionSQL
    const matchesPermission = (r) => {
        if (permissions.length === 0) {
            return user?.estado && r.estado && user.estado.toLowerCase() === r.estado.toLowerCase();
        }

        return permissions.some(perm => {
            const filters = perm.filters || [];
            const filtersByType = {};
            filters.forEach(f => {
                const t = f.type;
                if (!filtersByType[t]) filtersByType[t] = [];
                filtersByType[t].push(f.value.toLowerCase());
            });

            // Estado
            let estados = filtersByType['estado'] || [];
            if (estados.length === 0 && user?.estado) estados.push(user.estado.toLowerCase());
            if (estados.length > 0 && r.estado) {
                if (!estados.includes(r.estado.toLowerCase())) return false;
            }

            // Regional
            let regionais = filtersByType['regional'] || [];
            if (regionais.length > 0 && r.regional) {
                if (!regionais.includes(r.regional.toLowerCase())) return false;
            }

            // Seccional
            let seccionais = filtersByType['seccional'] || [];
            if (seccionais.length > 0 && r.seccional) {
                if (!seccionais.includes(r.seccional.toLowerCase())) return false;
            }

            // Gestor
            let gestores = filtersByType['gestor'] || [];
            if (gestores.length > 0 && r['GESTOR IMEDIATO'] !== undefined) {
                if (!gestores.includes(r['GESTOR IMEDIATO']?.toLowerCase())) return false;
            } else if (gestores.length > 0 && r.gestor !== undefined) {
                if (!gestores.includes(r.gestor?.toLowerCase())) return false;
            }

            return true; // Match!
        });
    };

    const needsLookup = !results[0]?.estado && !results[0]?.regional && !results[0]?.seccional;

    if (needsLookup) {
        const ids = [...new Set(results.map(r => r[idField]).filter(Boolean))];
        if (ids.length === 0) return results;

        const query = `SELECT "ID", estado, "regional", "seccional", "GESTOR IMEDIATO" FROM colaboradores WHERE UPPER("ID") = ANY($1)`;
        const { rows: colabData } = await cenos_pool.query(query, [ids.map(i => String(i).toUpperCase())]);
        const colabMap = new Map();
        colabData.forEach(c => colabMap.set(c['ID'].toUpperCase(), c));

        return results.filter(r => {
            const id = r[idField];
            if (!id) return false;
            const colab = colabMap.get(id.toUpperCase());
            if (!colab) return false;
            return matchesPermission(colab);
        });
    }

    return results.filter(r => matchesPermission(r));
};

async function get_users_agents_admin_paginated({ user, ids = [], page = 1, limit = 50, search, regional, seccional, gestor, cargo, estado, status, situacao, login_status }) {
    const availablePools = getUserAllowedStatePools(user);
    const filterUser = getFilterUser(user);

    const estados = toList(estado).map(s => s.toLowerCase());
    let targetPools = availablePools;
    if (estados.length > 0) {
        targetPools = availablePools.filter(p => estados.includes(p.state));
    }

    // Busca IDs no login (cenos_pool) se houver busca por texto
    let searchIdsFromLogin = [];
    let ilikeTerms = [];
    if (search) {
        let isMulti = search.includes(',');
        let terms = isMulti ? search.split(',').map(s => s.trim()).filter(Boolean) : [search.trim()];
        ilikeTerms = terms.map(t => `%${t}%`);

        const { rows: loginMatches } = await cenos_pool.query(
            `SELECT id FROM login WHERE id ILIKE ANY($1)`,
            [ilikeTerms]
        );
        searchIdsFromLogin = loginMatches.map(l => l.id.toUpperCase());
    }

    // Busca quais agentes têm inventário cadastrado
    let inventoryAgentsSet = new Set();
    try {
        const { rows: inventoryAgents } = await cenos_pool.query(`SELECT DISTINCT agente FROM inventory`);
        inventoryAgents.forEach(i => {
            if (i.agente) inventoryAgentsSet.add(i.agente.toString().toUpperCase());
        });
    } catch (e) {
        console.error('Erro ao buscar inventários ativos:', e.message);
    }

    // Busca contagem de mensagens de chat não lidas enviadas pelos agentes
    let unreadChatsSet = new Map();
    try {
        const { rows: unreadCounts } = await cenos_pool.query(`
            SELECT r.agent_id, COUNT(m.id)::integer as count 
            FROM chat_messages m 
            JOIN chat_rooms r ON m.room_id = r.id 
            WHERE m.sender_type = 'agent' AND m.read = false 
            GROUP BY r.agent_id
        `);
        unreadCounts.forEach(c => {
            if (c.agent_id) unreadChatsSet.set(c.agent_id.toString().toUpperCase(), c.count);
        });
    } catch (e) {
        console.error('Erro ao buscar chats não lidos:', e.message);
    }

    const allowedStates = targetPools.map(p => p.state);

    // Busca total (COUNT único em cenos_pool)
    let countQuery = `SELECT COUNT(*) as total FROM colaboradores WHERE estado = ANY($1)`;
    const countParams = [allowedStates];
    let paramIdx = 2;

    if (search) {
        const conditions = [`"Nome" ILIKE ANY($${paramIdx})`, `"ID" ILIKE ANY($${paramIdx})`];
        countParams.push(ilikeTerms);
        paramIdx++;
        if (searchIdsFromLogin.length > 0) {
            conditions.push(`UPPER("ID") = ANY($${paramIdx})`);
            countParams.push(searchIdsFromLogin);
            paramIdx++;
        }
        countQuery += ` AND (${conditions.join(' OR ')})`;
    }
    if (ids && ids.length > 0) {
        countQuery += ` AND UPPER("ID") = ANY($${paramIdx})`;
        countParams.push(ids.map(id => id.toUpperCase()));
        paramIdx++;
    }
    const regClause = buildInClause(regional, '"regional"', paramIdx);
    countQuery += regClause.sql;
    if (regClause.param !== undefined) { countParams.push(regClause.param); }
    paramIdx = regClause.idx;

    const secClause = buildInClause(seccional, '"seccional"', paramIdx);
    countQuery += secClause.sql;
    if (secClause.param !== undefined) { countParams.push(secClause.param); }
    paramIdx = secClause.idx;

    const gestClause = buildInClause(gestor, '"GESTOR IMEDIATO"', paramIdx);
    countQuery += gestClause.sql;
    if (gestClause.param !== undefined) { countParams.push(gestClause.param); }
    paramIdx = gestClause.idx;

    const cargoClause = buildInClause(cargo, '"Cargo"', paramIdx);
    countQuery += cargoClause.sql;
    if (cargoClause.param !== undefined) { countParams.push(cargoClause.param); }
    paramIdx = cargoClause.idx;

    const statuses = toList(status);
    if (statuses.length === 1) {
        if (statuses[0] === 'true') {
            countQuery += ` AND "status" = true`;
        } else if (statuses[0] === 'false') {
            countQuery += ` AND "status" = false`;
        }
    } else if (statuses.length > 1) {
        countQuery += ` AND "status" = ANY($${paramIdx}::boolean[])`;
        countParams.push(statuses.map(s => s === 'true'));
        paramIdx++;
    }
    const situacoes = toList(situacao);
    if (situacoes.length > 0) {
        countQuery += ` AND "situacao" = ANY($${paramIdx})`;
        countParams.push(situacoes);
        paramIdx++;
    }

    const { rows: countRows } = await cenos_pool.query(countQuery, countParams);
    const grandTotal = parseInt(countRows[0]?.total || 0);

    // Busca dados paginados (query única em cenos_pool)
    const limitVal = parseInt(limit) || 50;
    const offsetVal = (parseInt(page) - 1) * limitVal;

    let colabQuery = `SELECT * FROM colaboradores WHERE estado = ANY($1)`;
    const colabParams = [allowedStates];
    let cpIdx = 2;

    if (search) {
        const conditions = [`"Nome" ILIKE ANY($${cpIdx})`, `"ID" ILIKE ANY($${cpIdx})`];
        colabParams.push(ilikeTerms);
        cpIdx++;
        if (searchIdsFromLogin.length > 0) {
            conditions.push(`UPPER("ID") = ANY($${cpIdx})`);
            colabParams.push(searchIdsFromLogin);
            cpIdx++;
        }
        colabQuery += ` AND (${conditions.join(' OR ')})`;
    }
    if (ids && ids.length > 0) {
        colabQuery += ` AND UPPER("ID") = ANY($${cpIdx})`;
        colabParams.push(ids.map(id => id.toUpperCase()));
        cpIdx++;
    }
    const regClause2 = buildInClause(regional, '"regional"', cpIdx);
    colabQuery += regClause2.sql;
    if (regClause2.param !== undefined) { colabParams.push(regClause2.param); }
    cpIdx = regClause2.idx;

    const secClause2 = buildInClause(seccional, '"seccional"', cpIdx);
    colabQuery += secClause2.sql;
    if (secClause2.param !== undefined) { colabParams.push(secClause2.param); }
    cpIdx = secClause2.idx;

    const gestClause2 = buildInClause(gestor, '"GESTOR IMEDIATO"', cpIdx);
    colabQuery += gestClause2.sql;
    if (gestClause2.param !== undefined) { colabParams.push(gestClause2.param); }
    cpIdx = gestClause2.idx;

    const cargoClause2 = buildInClause(cargo, '"Cargo"', cpIdx);
    colabQuery += cargoClause2.sql;
    if (cargoClause2.param !== undefined) { colabParams.push(cargoClause2.param); }
    cpIdx = cargoClause2.idx;

    const statuses2 = toList(status);
    if (statuses2.length === 1) {
        if (statuses2[0] === 'true') {
            colabQuery += ` AND "status" = true`;
        } else if (statuses2[0] === 'false') {
            colabQuery += ` AND "status" = false`;
        }
    } else if (statuses2.length > 1) {
        colabQuery += ` AND "status" = ANY($${cpIdx}::boolean[])`;
        colabParams.push(statuses2.map(s => s === 'true'));
        cpIdx++;
    }
    const situacoes2 = toList(situacao);
    if (situacoes2.length > 0) {
        colabQuery += ` AND "situacao" = ANY($${cpIdx})`;
        colabParams.push(situacoes2);
        cpIdx++;
    }

    colabQuery += ` ORDER BY "Nome" ASC LIMIT $${cpIdx} OFFSET $${cpIdx + 1}`;
    colabParams.push(limitVal, offsetVal);

    const { rows } = await cenos_pool.query(colabQuery, colabParams);

    const result = rows.map(r => {
        const mapped = {
            ...r,
            gestor: r['GESTOR IMEDIATO'],
            matricula: `${parseInt(r['MAT'])}`,
            nome: r['Nome'],
            id: (r['ID']).toUpperCase(),
            estado: r['estado']
        };

        delete mapped['GESTOR IMEDIATO'];
        delete mapped['MAT'];
        delete mapped['Nome'];
        delete mapped['ID'];

        let cargo = r?.Cargo;
        let setor_key = Object.keys(setor).find(k => cargo?.includes(k));
        
        mapped['processo'] = r?.processo || '';
        mapped['setor'] = r?.processo || '';
        mapped['cargo'] = r?.Cargo || '';
        delete mapped['Cargo'];

        return mapped;
    });

    // Enriquecimento com login data
    if (result.length > 0) {
        const { rows: loginData } = await cenos_pool.query(
            `SELECT * FROM login WHERE id IN (${result.map((_, i) => `$${i + 1}`).join(',')})`,
            result.map(r => r.id)
        );

        result.forEach(r => {
            const login = loginData.find(l => l.id === r.id);
            r.telegram_id = login?.telegram_id || null;
            r.seccional = r.seccional || null;
            r.regional = r.regional || null;
            r.has_inventory = inventoryAgentsSet.has(r.id);
            r.unread_chat_count = unreadChatsSet.get(r.id) || 0;
        });
    }

    // Enriquecimento com status de login/logout do app
    if (result.length > 0) {
        const agentIds = result.map(r => r.id);

        const { rows: pinStatus } = await cenos_pool.query(`
            WITH pin_status AS (
                SELECT 
                    upper(agent_id) AS agent_id,
                    BOOL_OR(used_at IS NOT NULL) AS has_used_login,
                    MAX(used_at) AS last_login_at
                FROM app_pins
                WHERE upper(agent_id) = ANY($1)
                GROUP BY upper(agent_id)
            ),
            logout_status AS (
                SELECT 
                    upper(agent_id) AS agent_id,
                    MAX(used_at) AS last_logout_at
                FROM app_logout_pins
                WHERE upper(agent_id) = ANY($1) AND used_at IS NOT NULL
                GROUP BY upper(agent_id)
            )
            SELECT 
                ps.agent_id,
                ps.has_used_login,
                ps.last_login_at,
                ls.last_logout_at
            FROM pin_status ps
            LEFT JOIN logout_status ls ON ls.agent_id = ps.agent_id
        `, [agentIds]);

        const pinsMap = new Map(pinStatus.map(p => [p.agent_id, p]));

        result.forEach(r => {
            const p = pinsMap.get(r.id);
            if (!p) {
                r.login_status = 'none';
            } else if (!p.has_used_login) {
                r.login_status = 'pending';
            } else {
                const lastLogin = p.last_login_at ? new Date(p.last_login_at).getTime() : 0;
                const lastLogout = p.last_logout_at ? new Date(p.last_logout_at).getTime() : 0;
                r.login_status = lastLogout > lastLogin ? 'offline' : 'online';
            }
        });
    }

    let filteredResult = result;

    const loginStatuses = toList(login_status);
    if (loginStatuses.length > 0) {
        filteredResult = filteredResult.filter(r => loginStatuses.includes(r.login_status || 'none'));
    }

    if (filterUser && !userIsAdmin(user)) {
        filteredResult = filteredResult.filter(r => {
            return r[filterUser.type] === filterUser.value;
        });
    }

    return {
        data: filteredResult,
        total: grandTotal,
        page: parseInt(page),
        limit: limitVal
    };
}

const buildUserPermissionSQL = (user, params, idx, tableAlias = 'col') => {
  const conditions = [];
  if (!user || userIsAdmin(user)) return { conditions, params, idx };

  const permissions = user?.permissions || [];
  const permissionConditions = [];

  const alias = tableAlias ? `${tableAlias}.` : '';

  if (permissions.length === 0) {
    if (user?.estado) {
      const estado = user.estado.toLowerCase();
      permissionConditions.push(`LOWER(${alias}estado) = $${idx}`);
      params.push(estado);
      idx++;
    }
  } else {
    permissions.forEach(perm => {
      const filters = perm.filters || [];
      const filtersByType = {};
      filters.forEach(f => {
        const t = f.type;
        if (!filtersByType[t]) filtersByType[t] = [];
        filtersByType[t].push(f.value.toLowerCase());
      });

      const permAnds = [];
      
      let estadosPermitidos = filtersByType['estado'] || [];
      if (estadosPermitidos.length === 0 && user?.estado) {
        estadosPermitidos.push(user.estado.toLowerCase());
      }
      if (estadosPermitidos.length > 0) {
        if (estadosPermitidos.length === 1) {
          permAnds.push(`LOWER(${alias}estado) = $${idx}`);
          params.push(estadosPermitidos[0]);
        } else {
          permAnds.push(`LOWER(${alias}estado) = ANY($${idx}::varchar[])`);
          params.push(estadosPermitidos);
        }
        idx++;
      }

      const regionaisPermitidas = filtersByType['regional'] || [];
      if (regionaisPermitidas.length > 0) {
        if (regionaisPermitidas.length === 1) {
          permAnds.push(`LOWER(${alias}"regional") = $${idx}`);
          params.push(regionaisPermitidas[0]);
        } else {
          permAnds.push(`LOWER(${alias}"regional") = ANY($${idx}::varchar[])`);
          params.push(regionaisPermitidas);
        }
        idx++;
      }

      const seccionaisPermitidas = filtersByType['seccional'] || [];
      if (seccionaisPermitidas.length > 0) {
        if (seccionaisPermitidas.length === 1) {
          permAnds.push(`LOWER(${alias}"seccional") = $${idx}`);
          params.push(seccionaisPermitidas[0]);
        } else {
          permAnds.push(`LOWER(${alias}"seccional") = ANY($${idx}::varchar[])`);
          params.push(seccionaisPermitidas);
        }
        idx++;
      }

      const gestoresPermitidos = filtersByType['gestor'] || [];
      if (gestoresPermitidos.length > 0) {
        if (gestoresPermitidos.length === 1) {
          permAnds.push(`LOWER(${alias}"GESTOR IMEDIATO") = $${idx}`);
          params.push(gestoresPermitidos[0]);
        } else {
          permAnds.push(`LOWER(${alias}"GESTOR IMEDIATO") = ANY($${idx}::varchar[])`);
          params.push(gestoresPermitidos);
        }
        idx++;
      }

      if (permAnds.length > 0) {
        permissionConditions.push(`(${permAnds.join(' AND ')})`);
      }
    });
  }

  if (permissionConditions.length > 0) {
    conditions.push(`(${permissionConditions.join(' OR ')})`);
  } else {
    conditions.push(`1 = 0`); // Sem permissões -> bloqueia acesso
  }

  return { conditions, params, idx };
};

async function get_users_agents_admin({ user, ids = [], page = 1, limit = 9999, search, regional, seccional, gestor, estado }) {
    const res = await get_users_agents_admin_paginated({ user, ids, page, limit, search, regional, seccional, gestor, estado });
    return res.data;
}

async function get_users_only_login_paginated({ user, page = 1, limit = 50, search, estado, login_status }) {
    const availablePools = getUserAllowedStatePools(user);
    const estados = toList(estado).map(s => s.toLowerCase());
    const loginStatuses = toList(login_status);
    let targetPools = availablePools;
    if (estados.length > 0) {
        targetPools = availablePools.filter(p => estados.includes(p.state));
    }
    const allowedStates = targetPools.map(p => p.state);

    let inventoryAgentsSet = new Set();
    try {
        const { rows: inventoryAgents } = await cenos_pool.query(`SELECT DISTINCT agente FROM inventory`);
        inventoryAgents.forEach(i => {
            if (i.agente) inventoryAgentsSet.add(i.agente.toString().toUpperCase());
        });
    } catch (e) {}

    let unreadChatsSet = new Map();
    try {
        const { rows: unreadCounts } = await cenos_pool.query(`
            SELECT r.agent_id, COUNT(m.id)::integer as count 
            FROM chat_messages m 
            JOIN chat_rooms r ON m.room_id = r.id 
            WHERE m.sender_type = 'agent' AND m.read = false 
            GROUP BY r.agent_id
        `);
        unreadCounts.forEach(c => {
            if (c.agent_id) unreadChatsSet.set(c.agent_id.toString().toUpperCase(), c.count);
        });
    } catch (e) {}

    let whereConditions = [
        `NOT EXISTS (SELECT 1 FROM colaboradores c WHERE TRIM(UPPER(c."ID")) = TRIM(UPPER(l.id)))`,
        `(l.estado IS NULL OR LOWER(l.estado) = ANY($1))`
    ];
    let queryParams = [allowedStates];
    let paramIdx = 2;

    if (search) {
        let isMulti = search.includes(',');
        let terms = isMulti ? search.split(',').map(s => s.trim()).filter(Boolean) : [search.trim()];
        let ilikeTerms = terms.map(t => `%${t}%`);
        
        whereConditions.push(`l.id ILIKE ANY($${paramIdx})`);
        queryParams.push(ilikeTerms);
        paramIdx++;
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    const countQuery = `SELECT COUNT(*) as total FROM login l ${whereClause}`;
    const { rows: countRows } = await cenos_pool.query(countQuery, queryParams);
    const grandTotal = parseInt(countRows[0]?.total || 0);

    const limitVal = parseInt(limit) || 50;
    const offsetVal = (parseInt(page) - 1) * limitVal;

    const dataQuery = `
        SELECT l.*, h.last_heartbeat_at
        FROM login l 
        LEFT JOIN agent_heartbeats h ON UPPER(l.id) = UPPER(h.agent_id)
        ${whereClause} 
        ORDER BY l.id ASC 
        LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `;
    queryParams.push(limitVal, offsetVal);

    const { rows } = await cenos_pool.query(dataQuery, queryParams);

    const data = rows.map(r => ({
        id: (r.id || '').toUpperCase(),
        nome: 'NÃO CADASTRADO',
        estado: r.estado || 'pi',
        status: true,
        situacao: 'active',
        regional: '-',
        seccional: '-',
        setor: '-',
        gestor: '-',
        cargo: 'Apenas Login',
        telegram_id: r.telegram_id || null,
        last_heartbeat_at: r.last_heartbeat_at || null,
        has_inventory: inventoryAgentsSet.has((r.id || '').toUpperCase()),
        unread_chat_count: unreadChatsSet.get((r.id || '').toUpperCase()) || 0,
        only_login: true
    }));

    if (data.length > 0 && loginStatuses.length > 0) {
        const agentIds = data.map(r => r.id);
        const { rows: pinStatus } = await cenos_pool.query(`
            WITH pin_status AS (
                SELECT 
                    upper(agent_id) AS agent_id,
                    BOOL_OR(used_at IS NOT NULL) AS has_used_login,
                    MAX(used_at) AS last_login_at
                FROM app_pins
                WHERE upper(agent_id) = ANY($1)
                GROUP BY upper(agent_id)
            ),
            logout_status AS (
                SELECT 
                    upper(agent_id) AS agent_id,
                    MAX(used_at) AS last_logout_at
                FROM app_logout_pins
                WHERE upper(agent_id) = ANY($1) AND used_at IS NOT NULL
                GROUP BY upper(agent_id)
            )
            SELECT 
                ps.agent_id,
                ps.has_used_login,
                ps.last_login_at,
                ls.last_logout_at
            FROM pin_status ps
            LEFT JOIN logout_status ls ON ls.agent_id = ps.agent_id
        `, [agentIds]);

        const pinsMap = new Map(pinStatus.map(p => [p.agent_id, p]));
        const filtered = data.filter(r => {
            const p = pinsMap.get(r.id);
            let status;
            if (!p) status = 'none';
            else if (!p.has_used_login) status = 'pending';
            else {
                const lastLogin = p.last_login_at ? new Date(p.last_login_at).getTime() : 0;
                const lastLogout = p.last_logout_at ? new Date(p.last_logout_at).getTime() : 0;
                status = lastLogout > lastLogin ? 'offline' : 'online';
            }
            return loginStatuses.includes(status);
        });
        return {
            data: filtered,
            total: filtered.length,
            page: parseInt(page),
            limit: limitVal
        };
    }

    return {
        data,
        total: grandTotal,
        page: parseInt(page),
        limit: limitVal
    };
}

async function get_user_agent_options({ estado, regional, seccional, user }) {
    const colabFilter = user ? getColaboradoresFilter(user, { includeAllStates: true }) : null;
    const isAdmin = user ? userIsAdmin(user) : false;

    let result = {
        gestores: [],
        cargos: [],
        regionais: [],
        seccionais: [],
        processos: [],
        estados: [],
        status: [],
        situacao: [],
        login_status: []
    };

    // Se não for admin, usa os estados permitidos para filtrar
    let queryCond = '';
    let queryParams = [];

    const estados = toList(estado).map(s => s.toLowerCase());
    const regionais = toList(regional);
    const seccionais = toList(seccional);

    if (!isAdmin && colabFilter && colabFilter.allowedStates.length > 0) {
        queryCond = `AND estado = ANY($1)`;
        queryParams = [colabFilter.allowedStates];
    } else if (estados.length > 0) {
        queryCond = `AND estado = ANY($1)`;
        queryParams = [estados];
    }

    // Gestores - filtra apenas os permitidos
    let gestoresQuery = `SELECT DISTINCT "GESTOR IMEDIATO" FROM colaboradores WHERE "GESTOR IMEDIATO" IS NOT NULL ${queryCond}`;
    let gestoresParams = [...queryParams];
    if (regionais.length > 0) {
        gestoresParams.push(regionais);
        gestoresQuery += ` AND regional = ANY($${gestoresParams.length})`;
    }
    if (seccionais.length > 0) {
        gestoresParams.push(seccionais);
        gestoresQuery += ` AND seccional = ANY($${gestoresParams.length})`;
    }

    if (!isAdmin && colabFilter) {
        // Se tem filtro de gestor, aplica
        const gestoresPermitidos = user?.permissions?.map(p => p.filters).flat().filter(f => f.type === 'gestor').map(f => f.value);
        if (gestoresPermitidos && gestoresPermitidos.length > 0) {
            gestoresQuery = `SELECT DISTINCT "GESTOR IMEDIATO" FROM colaboradores WHERE "GESTOR IMEDIATO" IS NOT NULL AND "GESTOR IMEDIATO" = ANY($1)`;
            gestoresParams = [gestoresPermitidos];
        }
    }
    const { rows } = await cenos_pool.query(gestoresQuery, gestoresParams);
    result.gestores = rows.map(r => r['GESTOR IMEDIATO']);

    // Seccionais - vem da tabela colaboradores
    let secQuery = `SELECT DISTINCT seccional FROM colaboradores WHERE seccional IS NOT NULL ${queryCond}`;
    let secParams = [...queryParams];
    if (regionais.length > 0) {
        secParams.push(regionais);
        secQuery += ` AND regional = ANY($${secParams.length})`;
    }
    const { rows: secRows } = await cenos_pool.query(secQuery, secParams);
    result.seccionais = secRows.map(r => r.seccional);

    // Regionais - vem da tabela colaboradores
    let regQuery = `SELECT DISTINCT regional FROM colaboradores WHERE regional IS NOT NULL ${queryCond}`;
    let regParams = [...queryParams];
    if (seccionais.length > 0) {
        regParams.push(seccionais);
        regQuery += ` AND seccional = ANY($${regParams.length})`;
    }
    const { rows: regRows } = await cenos_pool.query(regQuery, regParams);
    result.regionais = regRows.map(r => r.regional);

    // Cargos
    const query4 = `SELECT DISTINCT "Cargo" FROM colaboradores WHERE "Cargo" IS NOT NULL ${queryCond}`;
    const { rows: rows4 } = await cenos_pool.query(query4, queryParams);
    result.cargos = rows4.map(r => r['Cargo']);

    // Processos
    const query5 = `SELECT DISTINCT "processo" FROM colaboradores WHERE "processo" IS NOT NULL AND TRIM("processo") <> '' ${queryCond}`;
    const { rows: rows5 } = await cenos_pool.query(query5, queryParams);
    const dbProcessos = rows5.map(r => r['processo']);
    const defaultProcessos = ['LEITURA', 'COBRANÇA', 'NEGOCIAÇÃO'];
    result.processos = Array.from(new Set([...defaultProcessos, ...dbProcessos]));

    // Estados - apenas os permitidos para não-admins
    if (!isAdmin && colabFilter && colabFilter.allowedStates.length > 0) {
        result.estados = colabFilter.allowedStates;
    } else {
        const query6 = `SELECT DISTINCT estado FROM colaboradores WHERE estado IS NOT NULL ORDER BY estado`;
        const { rows: rows6 } = await cenos_pool.query(query6);
        result.estados = rows6.map(r => r.estado);
    }

    // Status - valores distintos presentes na tabela
    const query7 = `SELECT DISTINCT status::text AS status FROM colaboradores WHERE status IS NOT NULL ${queryCond}`;
    const { rows: rows7 } = await cenos_pool.query(query7, queryParams);
    result.status = rows7.map(r => (r.status === 'true' ? 'true' : 'false'));

    // Situação - valores distintos presentes na tabela
    const query8 = `SELECT DISTINCT situacao FROM colaboradores WHERE situacao IS NOT NULL AND TRIM(situacao) <> '' ${queryCond}`;
    const { rows: rows8 } = await cenos_pool.query(query8, queryParams);
    result.situacao = rows8.map(r => r.situacao);

    // Login status - conjunto canônico do algoritmo em get_users_agents_admin_paginated
    result.login_status = ['online', 'offline', 'pending', 'none'];

    return result;
}

async function create_user_agent_admin({ id, matricula, nome, estado: inputEstado, gestor, cargo, user, seccional, regional, status = true, situacao = 'active', processo, is_gestor = false }) {
    const normalizedId = normalizeAgentId(id);
    const normalizedMatricula = normalizeAgentId(matricula);
    const normalizedNome = normalizeAgentName(nome);
    const normalizedGestor = gestor ? normalizeTextUpper(gestor) : null;
    const normalizedRegional = regional ? normalizeTextUpper(regional) : null;
    const normalizedSeccional = seccional ? normalizeTextUpper(seccional) : null;
    const normalizedProcesso = processo ? normalizeTextUpper(processo) : null;

    if (!normalizedId) {
        return { error: 'ID do agente é obrigatório e deve conter ao menos um caractere alfanumérico' };
    }

    const allowedPools = getUserAllowedStatePools(user);
    const target = allowedPools.find(p => p.state === inputEstado.toLowerCase());

    if (!target) {
        return { error: `Você não tem permissão para cadastrar agentes no estado ${inputEstado.toUpperCase()}` };
    }

    const query = `
        INSERT INTO colaboradores ("ID", "MAT", "Nome", "GESTOR IMEDIATO", "Cargo", "seccional", "regional", "estado", "status", "situacao", "processo", "is_gestor")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `;
    const params = [
        normalizedId,
        normalizedMatricula,
        normalizedNome,
        normalizedGestor,
        cargo,
        normalizedSeccional,
        normalizedRegional,
        inputEstado.toLowerCase(),
        status !== undefined ? status : true,
        situacao !== undefined ? situacao : 'active',
        normalizedProcesso,
        is_gestor !== undefined ? is_gestor : false
    ];

    try {
        await cenos_pool.query(query, params);
        await cenos_pool.query(
            `INSERT INTO login (id, estado) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET estado = EXCLUDED.estado`,
            [normalizedId, inputEstado.toLowerCase()]
        );
        const changedBy = getChangedBy(user);
        await insert_agent_audit_logs([
            { agente_id: normalizedId, field: 'status', from_value: null, to_value: status !== undefined ? String(status) : 'true', changed_by: changedBy },
            { agente_id: normalizedId, field: 'situacao', from_value: null, to_value: situacao || 'active', changed_by: changedBy },
        ]);
        const result = await get_users_agents_admin({ user, ids: [normalizedId], estado: inputEstado });
        return result[0];
    } catch (err) {
        console.error('Erro ao criar usuário:', err.message);
        throw err;
    }
}

async function send_message_to_agent({ id, agent: providedAgent, text, file, webAppButtonText, webAppButtonUrl, options, user }) {
    let agent = providedAgent;
    if (!agent) {
        const userData = await get_users_agents_admin({ user, ids: [id] });
        if (!userData.length) return { error: 'Usuário não encontrado' };
        agent = userData[0];
    }
    const allowedPools = getUserAllowedStatePools(user);
    if (!allowedPools.find(p => p.state === agent.estado.toLowerCase())) {
        return { error: `Você não tem permissão para enviar mensagens para agentes do estado ${agent.estado.toUpperCase()}` };
    }

    let payload;
    let contentType = 'application/json';
    let result = { message: 'Mensagem salva no sistema (agente sem Telegram vinculado)' };

    if (agent.telegram_id) {
        // Se o arquivo for um objeto vindo do Multer (buffer), usamos FormData
        if (file && typeof file === 'object' && file.buffer) {
            const formData = new FormData();
            formData.append('chatId', agent.telegram_id);
            if (text) formData.append('text', text);
            if (webAppButtonText) formData.append('webAppButtonText', webAppButtonText);
            if (webAppButtonUrl) formData.append('webAppButtonUrl', webAppButtonUrl);
            if (options) formData.append('options', typeof options === 'string' ? options : JSON.stringify(options));

            let mediaType = 'document';
            const mimetype = file.mimetype || '';
            if (mimetype.startsWith('image/')) mediaType = 'image';
            else if (mimetype.startsWith('video/')) mediaType = 'video';
            else if (mimetype.startsWith('audio/')) mediaType = 'audio';

            formData.append('mediaType', mediaType);
            formData.append('media', new Blob([file.buffer]), file.originalname);

            payload = formData;
            contentType = undefined; // Deixa o axios definir o boundary
        } else {
            // Envio via JSON (Texto e/ou mídias por URL)
            payload = {
                chatId: agent.telegram_id,
                text,
                webAppButtonText,
                webAppButtonUrl,
                options
            };

            if (file && typeof file === 'string' && file.startsWith('http')) {
                const ext = file.split('.').pop().toLowerCase();
                if (['jpg', 'jpeg', 'png'].includes(ext)) {
                    payload.photo = file;
                } else if (['mp4', 'mov', 'avi'].includes(ext)) {
                    payload.video = file;
                } else {
                    payload.document = file;
                }
            }
        }

        try {
            const headers = {
                'Authorization': `Bearer ${process.env.TELEGRAM_API_TOKEN}`
            };
            if (contentType) headers['Content-Type'] = contentType;

            const response = await axios.post(`${process.env.TELEGRAM_API_URL}/sendMessage`, payload, { headers });
            result = { message: 'Mensagem enviada com sucesso', telegramResponse: response.data };
        } catch (error) {
            console.error('Erro ao enviar mensagem via Telegram:', error.response?.data || error.message);
            result = { error: 'Falha ao enviar mensagem via Telegram API', details: error.response?.data || error.message };
        }
    }

    // Gravar log no banco cenos_pool
    try {
        await cenos_pool.query(`
            CREATE TABLE IF NOT EXISTS sent_messages_admin (
                id SERIAL PRIMARY KEY,
                agente_id TEXT,
                operador_id TEXT,
                texto TEXT,
                arquivo TEXT,
                sucesso BOOLEAN,
                resposta JSONB,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        const insertQuery = `
            INSERT INTO sent_messages_admin (agente_id, operador_id, texto, arquivo, sucesso, resposta)
            VALUES ($1, $2, $3, $4, $5, $6)
        `;
        const logParams = [
            agent.id?.toUpperCase(),
            user.matricula || user.id || 'ADMIN',
            text || null,
            typeof file === 'string' ? file : (file?.originalname || null),
            !result.error,
            JSON.stringify(result.telegramResponse || result.details || result)
        ];
        await cenos_pool.query(insertQuery, logParams);
    } catch (logError) {
        console.error('Erro ao gravar log de mensagem:', logError.message);
    }

    return result;
}

async function send_telegram_to_agent_by_id(agentId, text, webAppButtonText, webAppButtonUrl) {
    // telegram_id fica na tabela login (cenos_pool)
    const { rows: loginRows } = await cenos_pool.query(
        `SELECT telegram_id FROM login WHERE id = $1 AND telegram_id IS NOT NULL`,
        [agentId.toUpperCase()]
    );
    if (!loginRows.length) return { error: 'Agente não encontrado ou sem Telegram ID vinculado' };
    const telegramId = loginRows[0].telegram_id;

    const payload = { chatId: telegramId, text };
    if (webAppButtonText && webAppButtonUrl) {
        payload.webAppButtonText = webAppButtonText;
        payload.webAppButtonUrl = webAppButtonUrl;
    }
    try {
        const headers = { 'Authorization': `Bearer ${process.env.TELEGRAM_API_TOKEN}` };
        const response = await axios.post(`${process.env.TELEGRAM_API_URL}/sendMessage`, payload, { headers });
        return { message: 'Mensagem enviada com sucesso', telegramResponse: response.data };
    } catch (error) {
        console.error('Erro ao enviar mensagem via Telegram (public):', error.response?.data || error.message);
        return { error: 'Falha ao enviar mensagem via Telegram API', details: error.response?.data || error.message };
    }
}

async function send_bulk_message_to_agents({ ids, text, file, webAppButtonText, webAppButtonUrl, options, user }) {
    if (!Array.isArray(ids)) throw new Error('O campo ids deve ser um array');

    const agents = await get_users_agents_admin({ user, ids });
    const results = [];

    for (const id of ids) {
        const agent = agents.find(a => a.id.toUpperCase() === id.toUpperCase());
        if (!agent) {
            results.push({ id, error: 'Usuário não encontrado ou sem permissão' });
            continue;
        }

        const res = await send_message_to_agent({ 
            agent, 
            text, 
            file, 
            webAppButtonText, 
            webAppButtonUrl, 
            options, 
            user 
        });
        results.push({ id, ...res });
    }

    return results;
}

async function delete_user_agent_admin({ id, user, deleteLogin = false }) {
    let agentState = null;
    const userData = await get_users_agents_admin({ user, ids: [id] });
    if (userData.length) {
        agentState = userData[0].estado;
    } else {
        const { rows: loginRows } = await cenos_pool.query(`SELECT estado FROM login WHERE UPPER(id) = $1`, [id?.toUpperCase()]);
        if (!loginRows.length) return { error: 'Usuário não encontrado' };
        agentState = loginRows[0].estado || 'pi';
        deleteLogin = true;
    }

    const allowedPools = getUserAllowedStatePools(user);
    const target = allowedPools.find(p => p.state === (agentState || '').toLowerCase());

    if (!target) {
        return { error: `Você não tem permissão para deletar agentes no estado ${(agentState || '').toUpperCase()}` };
    }

    try {
        await cenos_pool.query(`DELETE FROM colaboradores WHERE TRIM(UPPER("ID")) = TRIM(UPPER($1))`, [id?.toUpperCase()]);

        if (deleteLogin) {
            await cenos_pool.query(`DELETE FROM login WHERE TRIM(UPPER(id)) = TRIM(UPPER($1))`, [id?.toUpperCase()]);
        }

        return { message: 'Usuário deletado com sucesso' };
    } catch (err) {
        console.error('Erro ao deletar usuário:', err.message);
        throw err;
    }
}

async function update_user_agent_admin({ id, nome, gestor, cargo, seccional, regional, estado, status, situacao, processo, matricula, user, is_gestor }) {
    const normalizedId = normalizeAgentId(id);
    const normalizedNome = nome !== undefined ? normalizeAgentName(nome) : undefined;
    const normalizedMatricula = matricula !== undefined ? (matricula ? normalizeAgentId(matricula) : null) : undefined;
    const normalizedGestor = gestor !== undefined ? (gestor ? normalizeTextUpper(gestor) : null) : undefined;
    const normalizedRegional = regional !== undefined ? (regional ? normalizeTextUpper(regional) : null) : undefined;
    const normalizedSeccional = seccional !== undefined ? (seccional ? normalizeTextUpper(seccional) : null) : undefined;
    const normalizedProcesso = processo !== undefined ? (processo ? (processo === '__UNCHANGED__' ? '__UNCHANGED__' : normalizeTextUpper(processo)) : null) : undefined;

    const userData = await get_users_agents_admin({ user, ids: [normalizedId] });
    if (!userData.length) return { error: 'Usuário não encontrado' };

    const agent = userData[0];
    const allowedPools = getUserAllowedStatePools(user);
    const target = allowedPools.find(p => p.state === agent.estado.toLowerCase());

    if (!target) {
        return { error: `Você não tem permissão para atualizar agentes no estado ${agent.estado.toUpperCase()}` };
    }

    const query = `
        UPDATE colaboradores 
        SET "Nome" = $1, "GESTOR IMEDIATO" = $2, "Cargo" = $3, "seccional" = $4, "regional" = $5,
            "estado" = COALESCE($6, "estado"), "status" = COALESCE($7, "status"), "situacao" = COALESCE($8, "situacao"), "processo" = CASE WHEN $10 = '__UNCHANGED__' THEN "processo" ELSE $10 END, "MAT" = COALESCE($11, "MAT"), "is_gestor" = COALESCE($12, "is_gestor")
        WHERE TRIM(UPPER("ID")) = TRIM(UPPER($9))
    `;
    const params = [
        normalizedNome,
        normalizedGestor,
        cargo,
        normalizedSeccional,
        normalizedRegional,
        estado !== undefined ? estado.toLowerCase() : null,
        status !== undefined ? status : null,
        situacao !== undefined ? situacao : null,
        normalizedId,
        normalizedProcesso !== undefined ? (normalizedProcesso || null) : '__UNCHANGED__',
        normalizedMatricula,
        is_gestor !== undefined ? is_gestor : null
    ];

    try {
        await cenos_pool.query(query, params);
        await cenos_pool.query(
            `INSERT INTO login (id, estado) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET estado = EXCLUDED.estado`,
            [normalizedId, estado !== undefined ? estado.toLowerCase() : agent.estado.toLowerCase()]
        );
        const changedBy = getChangedBy(user);
        const auditEntries = [];
        if (status !== undefined && String(status) !== String(agent.status)) {
            auditEntries.push({ agente_id: normalizedId, field: 'status', from_value: String(agent.status), to_value: String(status), changed_by: changedBy });
        }
        if (situacao !== undefined && situacao !== agent.situacao) {
            auditEntries.push({ agente_id: normalizedId, field: 'situacao', from_value: agent.situacao, to_value: situacao, changed_by: changedBy });
        }
        await insert_agent_audit_logs(auditEntries);
        const result = await get_users_agents_admin({ user, ids: [normalizedId], estado: estado || agent.estado });
        return result[0];
    } catch (err) {
        console.error('Erro ao atualizar usuário:', err.message);
        throw err;
    }
}

async function bulk_update_user_agents_admin({ ids, data, user }) {
    if (!Array.isArray(ids) || !ids.length) return { error: 'Nenhum ID selecionado' };
    
    const allowedStates = getUserAllowedStatePools(user).map(p => p.state);
    let updatedCount = 0;
    
    for (const rawId of ids) {
        const id = normalizeAgentId(rawId);
        if (!id) continue;
        
        const { rows: colabRows } = await cenos_pool.query(`SELECT estado, status, situacao FROM colaboradores WHERE TRIM(UPPER("ID")) = TRIM(UPPER($1))`, [id]);
        let estado = null;
        let existsInColab = colabRows.length > 0;
        
        if (existsInColab) {
            estado = colabRows[0].estado;
        } else {
            const { rows: loginRows } = await cenos_pool.query(`SELECT estado FROM login WHERE TRIM(UPPER(id)) = TRIM(UPPER($1))`, [id]);
            if (!loginRows.length) continue;
            estado = loginRows[0].estado || 'pi';
        }
        
        if (!allowedStates.includes((estado || '').toLowerCase())) continue;
        
        const targetEstado = data.estado !== undefined && data.estado !== '' ? data.estado.toLowerCase() : (estado || 'pi').toLowerCase();
        if (!allowedStates.includes(targetEstado)) continue;
        
        if (existsInColab) {
            let setClauses = [];
            let params = [];
            let idx = 1;
            
            const fieldMap = {
                nome: '"Nome"',
                gestor: '"GESTOR IMEDIATO"',
                cargo: '"Cargo"',
                seccional: '"seccional"',
                regional: '"regional"',
                estado: '"estado"',
                status: '"status"',
                situacao: '"situacao"',
                processo: '"processo"'
            };
            
            for (const [key, col] of Object.entries(fieldMap)) {
                if (data[key] !== undefined && data[key] !== '') {
                    setClauses.push(`${col} = $${idx++}`);
                    let value;
                    if (key === 'estado') value = data[key].toLowerCase();
                    else if (key === 'status') value = (data[key] === 'true' || data[key] === true);
                    else if (key === 'nome') value = normalizeAgentName(data[key]);
                    else if (['gestor', 'regional', 'seccional', 'processo'].includes(key)) value = normalizeTextUpper(data[key]);
                    else value = data[key];
                    params.push(value);
                }
            }
            
            if (setClauses.length > 0) {
                const oldStatus = colabRows[0].status;
                const oldSituacao = colabRows[0].situacao;
                params.push(id);
                await cenos_pool.query(`UPDATE colaboradores SET ${setClauses.join(', ')} WHERE TRIM(UPPER("ID")) = TRIM(UPPER($${idx}))`, params);
                const changedBy = getChangedBy(user);
                const auditEntries = [];
                if (data.status !== undefined && data.status !== '' && String(data.status === 'true' || data.status === true) !== String(oldStatus)) {
                    auditEntries.push({ agente_id: id, field: 'status', from_value: String(oldStatus), to_value: String(data.status === 'true' || data.status === true), changed_by: changedBy });
                }
                if (data.situacao !== undefined && data.situacao !== '' && data.situacao !== oldSituacao) {
                    auditEntries.push({ agente_id: id, field: 'situacao', from_value: oldSituacao, to_value: data.situacao, changed_by: changedBy });
                }
                await insert_agent_audit_logs(auditEntries);
                if (data.estado) {
                    await cenos_pool.query(`UPDATE login SET estado = $1 WHERE TRIM(UPPER(id)) = TRIM(UPPER($2))`, [targetEstado, id]);
                }
                updatedCount++;
            }
        } else {
            const { rows: existingColab } = await cenos_pool.query(
                `SELECT status, situacao FROM colaboradores WHERE TRIM(UPPER("ID")) = TRIM(UPPER($1))`, [id]
            );
            const hadOldValues = existingColab.length > 0;
            const beforeStatus = hadOldValues ? existingColab[0].status : null;
            const beforeSituacao = hadOldValues ? existingColab[0].situacao : null;

            const insertQuery = `
                INSERT INTO colaboradores ("ID", "MAT", "Nome", "GESTOR IMEDIATO", "Cargo", "seccional", "regional", "estado", "status", "situacao", "processo")
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                ON CONFLICT ("ID") DO UPDATE SET
                    "GESTOR IMEDIATO" = COALESCE(EXCLUDED."GESTOR IMEDIATO", colaboradores."GESTOR IMEDIATO"),
                    "regional" = COALESCE(EXCLUDED."regional", colaboradores."regional"),
                    "seccional" = COALESCE(EXCLUDED."seccional", colaboradores."seccional"),
                    "Cargo" = COALESCE(EXCLUDED."Cargo", colaboradores."Cargo"),
                    "estado" = COALESCE(EXCLUDED."estado", colaboradores."estado"),
                    "processo" = COALESCE(EXCLUDED."processo", colaboradores."processo")
            `;
            const params = [
                id,
                normalizeAgentId(data.matricula) || null,
                normalizeAgentName(data.nome) || id,
                normalizeTextUpper(data.gestor) || null,
                data.cargo || null,
                normalizeTextUpper(data.seccional) || null,
                normalizeTextUpper(data.regional) || null,
                targetEstado,
                data.status !== undefined && data.status !== '' ? (data.status === 'true' || data.status === true) : true,
                data.situacao || 'active',
                normalizeTextUpper(data.processo) || null
            ];
            await cenos_pool.query(insertQuery, params);
            await cenos_pool.query(`UPDATE login SET estado = $1 WHERE TRIM(UPPER(id)) = TRIM(UPPER($2))`, [targetEstado, id]);

            const changedBy = getChangedBy(user);
            const newStatus = data.status !== undefined && data.status !== '' ? (data.status === 'true' || data.status === true) : true;
            const newSituacao = data.situacao || 'active';
            const auditEntries = [];
            if (!hadOldValues) {
                auditEntries.push({ agente_id: id, field: 'status', from_value: null, to_value: String(newStatus), changed_by: changedBy });
                auditEntries.push({ agente_id: id, field: 'situacao', from_value: null, to_value: newSituacao, changed_by: changedBy });
            } else {
                if (newStatus !== beforeStatus) {
                    auditEntries.push({ agente_id: id, field: 'status', from_value: String(beforeStatus), to_value: String(newStatus), changed_by: changedBy });
                }
                if (newSituacao !== beforeSituacao) {
                    auditEntries.push({ agente_id: id, field: 'situacao', from_value: beforeSituacao, to_value: newSituacao, changed_by: changedBy });
                }
            }
            await insert_agent_audit_logs(auditEntries);
            updatedCount++;
        }
    }
    
    return { message: `${updatedCount} agente(s) atualizado(s) com sucesso.` };
}

async function bulk_delete_user_agents_admin({ ids, deleteLogin = false, user }) {
    if (!userIsAdmin(user)) {
        return { error: 'Somente administradores do sistema podem realizar exclusão em massa.' };
    }
    if (!Array.isArray(ids) || !ids.length) return { error: 'Nenhum ID selecionado' };
    
    let deletedCount = 0;
    for (const rawId of ids) {
        const id = rawId?.toUpperCase();
        if (!id) continue;
        
        const resColab = await cenos_pool.query(`DELETE FROM colaboradores WHERE TRIM(UPPER("ID")) = TRIM(UPPER($1))`, [id]);
        if (deleteLogin || resColab.rowCount === 0) {
            await cenos_pool.query(`DELETE FROM login WHERE UPPER(id) = $1`, [id]);
        }
        deletedCount++;
    }
    
    return { message: `${deletedCount} agente(s) excluído(s) com sucesso.` };
}


// ─── inventory ───────────────────────────────────────────────────────────
async function get_inventory_admin({ user, page = 1, limit = 9999, search, agente, estado, regional, seccional }) {
    const allowedPools = getUserAllowedStatePools(user).map(p => p.state);
    const pool = cenos_pool;

    // Garante existência da tabela e colunas novas
    await pool.query(`
        CREATE TABLE IF NOT EXISTS inventory (
            id SERIAL PRIMARY KEY,
            agente TEXT,
            pda_imei_1 TEXT,
            pda_imei_2 TEXT,
            pda_numero_serie TEXT,
            pda_marca TEXT,
            pda_modelo TEXT,
            pda_numero_chip TEXT,
            pda_versao_android TEXT,
            pda_versao_bluetooth TEXT,
            impressora_numero_serie TEXT,
            impressora_modelo TEXT,
            impressora_marca TEXT,
            maquininha_numero_serie TEXT,
            maquininha_numero_logico TEXT,
            estado TEXT DEFAULT 'pi',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
    `);

    // Adiciona colunas novas caso a tabela já existisse
    await pool.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS maquininha_numero_serie TEXT;`).catch(() => {});
    await pool.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS maquininha_numero_logico TEXT;`).catch(() => {});

    // Usa a nova função de filtro unificado
    const colabFilter = getColaboradoresFilter(user, { includeAllStates: true });

    let query = `SELECT DISTINCT ON (agente) * FROM inventory WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    // Se não for admin, aplica filtro de estados
    if (!userIsAdmin(user)) {
        if (colabFilter.allowedStates.length > 0) {
            query += ` AND estado = ANY($${paramIndex})`;
            params.push(colabFilter.allowedStates);
            paramIndex++;
        }
    }

    query += ` ORDER BY agente, created_at DESC`;

    const { rows } = await pool.query(query, params);

    // Obtém todos os agentes autorizados uma única vez usando filtro unificado
    const allowedAgentsRes = await get_users_agents_admin({ user });

    // Aplica filtro completo (estado, regional, seccional, gestor)
    let filteredRows = rows.map(r => {
        const agentData = allowedAgentsRes.find(a => a.id?.toString().toUpperCase() === r.agente?.toString().toUpperCase());
        if (!agentData) return null;

        // Verifica se o agente está dentro das permissões do usuário
        const isAllowed = checkAgentPermission(agentData, user);
        if (!isAllowed) return null;

        // Acopla dados do agente ao registro do inventário
        return { ...r, ...agentData };
    }).filter(Boolean);

    // Filtro por estado (via query param - permite sobrescrever o filtro do usuário)
    if (estado) {
        const est = estado.toLowerCase();
        filteredRows = filteredRows.filter(r => r.estado?.toLowerCase() === est);
    }

    // Filtros por regional e seccional
    if (regional) {
        const reg = regional.toLowerCase();
        filteredRows = filteredRows.filter(r => r.regional?.toLowerCase() === reg);
    }
    if (seccional) {
        const sec = seccional.toLowerCase();
        filteredRows = filteredRows.filter(r => r.seccional?.toLowerCase() === sec);
    }

    // Filtro por agente (ID ou Nome)
    if (agente) {
        const ag = agente.toLowerCase();
        filteredRows = filteredRows.filter(r =>
            r.id?.toLowerCase().includes(ag) ||
            r.nome?.toLowerCase().includes(ag)
        );
    }

    // Busca Global em todas as propriedades do objeto (ID, Nome, IMEI, Regional, etc)
    if (search) {
        const s = search.toLowerCase();
        filteredRows = filteredRows.filter(r =>
            Object.values(r).some(v => String(v || '').toLowerCase().includes(s))
        );
    }

    // Paginação em memória
    const total = filteredRows.length;
    const limitVal = parseInt(limit) || 9999;
    const totalPages = Math.max(1, Math.ceil(total / limitVal));
    const offsetVal = (parseInt(page) - 1) * limitVal;
    const data = filteredRows.slice(offsetVal, offsetVal + limitVal);

    return {
        data,
        total,
        page: parseInt(page),
        limit: limitVal,
        totalPages
    };
}

/**
 * Verifica se um agente está dentro das permissões do usuário
 */
const checkAgentPermission = (agentData, user) => {
    const isMainAdmin = userIsAdmin(user);
    if (isMainAdmin) return true;

    const userFilters = user?.permissions?.map(p => p.filters).flat() || [];
    const userFiltersByType = {};

    userFilters.forEach(f => {
        if (!userFiltersByType[f.type]) {
            userFiltersByType[f.type] = [];
        }
        userFiltersByType[f.type].push(f.value.toLowerCase());
    });

    const estadosPermitidos = userFiltersByType['estado'] || [];
    const regionaisPermitidas = userFiltersByType['regional'] || [];
    const seccionaisPermitidas = userFiltersByType['seccional'] || [];
    const gestoresPermitidos = userFiltersByType['gestor'] || [];

    // Se não tem nenhum filtro, usa o estado do usuário como fallback
    if (estadosPermitidos.length === 0 && regionaisPermitidas.length === 0 &&
        seccionaisPermitidas.length === 0 && gestoresPermitidos.length === 0) {
        if (user?.estado) {
            return agentData.estado?.toLowerCase() === user.estado.toLowerCase();
        }
        return false;
    }

    // Verifica estado
    if (estadosPermitidos.length > 0 && agentData.estado) {
        if (!estadosPermitidos.includes(agentData.estado.toLowerCase())) return false;
    }

    // Verifica regional
    if (regionaisPermitidas.length > 0 && agentData.regional) {
        if (!regionaisPermitidas.includes(agentData.regional.toLowerCase())) return false;
    }

    // Verifica seccional
    if (seccionaisPermitidas.length > 0 && agentData.seccional) {
        if (!seccionaisPermitidas.includes(agentData.seccional.toLowerCase())) return false;
    }

    // Verifica gestor
    if (gestoresPermitidos.length > 0 && agentData.gestor) {
        if (!gestoresPermitidos.includes(agentData.gestor.toLowerCase())) return false;
    }

    return true;
};

async function update_inventory_admin(id, data) {
    const pool = cenos_pool;
    const fields = Object.keys(data).filter(k => k !== 'id');
    const values = fields.map(k => data[k]);
    const setClause = fields.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const query = `UPDATE inventory SET ${setClause}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`;
    const { rows } = await pool.query(query, [...values, id]);
    return rows[0];
}

async function delete_inventory_admin(id) {
    const pool = cenos_pool;
    const { rows } = await pool.query('DELETE FROM inventory WHERE id = $1 RETURNING *', [id]);
    return rows[0];
}

// ─── justify ───────────────────────────────────────────────────────────
async function get_justify_types_admin() {
    const pool = cenos_pool;

    let query = `SELECT DISTINCT tipo FROM justificativas WHERE tipo IS NOT NULL AND tipo <> '' ORDER BY tipo ASC`;
    const { rows } = await pool.query(query);
    return rows.map(r => r.tipo);
}


async function get_justify_admin({ instalacao, tipo, data_leit_prev, estado, page = 1, limit = 9999, search, user }) {
    const colabFilter = getColaboradoresFilter(user, { includeAllStates: true });
    const pool = cenos_pool;

    let query = `SELECT * FROM justificativas WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    // Se não for admin, aplica filtro de estados
    if (!userIsAdmin(user)) {
        if (colabFilter.allowedStates.length > 0) {
            query += ` AND estado = ANY($${paramIndex})`;
            params.push(colabFilter.allowedStates);
            paramIndex++;
        }
    }

    if (instalacao) {
        query += ` AND autor = $${paramIndex}`;
        params.push(instalacao);
        paramIndex++;
    }
    if (tipo) {
        query += ` AND tipo = $${paramIndex}`;
        params.push(tipo);
        paramIndex++;
    }
    if (data_leit_prev) {
        query += ` AND data_leit_prev = $${paramIndex}`;
        params.push(data_leit_prev);
        paramIndex++;
    }
    // Se vier estado via query param, aplica (override do filtro de permissão)
    if (estado) {
        query += ` AND estado = $${paramIndex}`;
        params.push(estado.toLowerCase());
        paramIndex++;
    }

    query += ` ORDER BY created_at DESC`;

    // Buscamos um set maior para possibilitar filtragem por hierarquia em memória
    const { rows } = await pool.query(query, params);

    // Usa a nova função de filtro unificado
    const result = await get_users_agents_admin({ user });
    const allowedAgents = result.map(a => a.id?.toString().toUpperCase());

    // Filtra e enriquece os dados aplicando permissão completa (estado, regional, seccional, gestor)
    let enrichedRows = rows
        .filter(r => {
            if (userIsAdmin(user)) return true;
            const agentData = result.find(a => a.id?.toString().toUpperCase() === r.autor?.toString().toUpperCase());
            if (!agentData) return false;
            return checkAgentPermission(agentData, user);
        })
        .map(r => {
            const agentData = result.find(a => a.id?.toString().toUpperCase() === r.autor?.toString().toUpperCase());
            return { ...agentData, ...r };
        });

    // Busca Global em todas as propriedades do objeto resultante
    if (search) {
        const s = search.toLowerCase();
        enrichedRows = enrichedRows.filter(r =>
            Object.values(r).some(v => String(v || '').toLowerCase().includes(s))
        );
    }

    // Paginação em memória
    const limitVal = parseInt(limit) || 9999;
    const offsetVal = (parseInt(page) - 1) * limitVal;
    return enrichedRows.slice(offsetVal, offsetVal + limitVal);
}

async function save_justify_admin(data) {
    const { instalacao, tipo, motivo, justificativa, foto, data_leit_prev, author, estado, quantidade } = data;
    const pool = cenos_pool;
    const query = `
        INSERT INTO justificativas (instalacao, tipo, motivo, justificativa, foto, data_leit_prev, author, estado, quantidade, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        RETURNING *;
    `;
    const values = [instalacao, tipo, motivo, justificativa, foto, data_leit_prev, author, estado || 'pi', quantidade];
    const { rows } = await pool.query(query, values);
    return rows[0];
}

async function update_justify_admin(id, data) {
    const pool = cenos_pool;
    const fields = Object.keys(data).filter(k => k !== 'id');
    const values = fields.map(k => data[k]);
    const setClause = fields.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const query = `UPDATE justificativas SET ${setClause}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`;
    const { rows } = await pool.query(query, [...values, id]);
    return rows[0];
}

async function delete_justify_admin(id) {
    const pool = cenos_pool;
    const { rows } = await pool.query('DELETE FROM justificativas WHERE id = $1 RETURNING *', [id]);
    return rows[0];
}

// ─── justify_pending ───────────────────────────────────────────────────────────

async function get_pending_justifies_admin({ state, autor, status = 'pendente', page = 1, limit = 9999, user, search }) {
    const colabFilter = getColaboradoresFilter(user, { includeAllStates: true });
    const pool = cenos_pool;

    let query = `SELECT * FROM justify_pending WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    // Se o usuário não for admin principal, ele só pode ver estados permitidos
    if (!userIsAdmin(user)) {
        if (colabFilter.allowedStates.length > 0) {
            query += ` AND estado = ANY($${paramIndex})`;
            params.push(colabFilter.allowedStates);
            paramIndex++;
        }
    }

    // Filtro por estado explícito (vindo da query param)
    if (state) {
        query += ` AND estado = $${paramIndex}`;
        params.push(state.toLowerCase());
        paramIndex++;
    }

    if (autor) {
        query += ` AND autor = $${paramIndex}`;
        params.push(autor);
        paramIndex++;
    }
    if (status) {
        query += ` AND status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
    }

    query += ` ORDER BY created_at DESC`;

    const { rows } = await pool.query(query, params);

    // Obtém todos os agentes autorizados (com filtro unificado)
    const result = await get_users_agents_admin({ user });

    // Filtra apenas registros de agentes que o usuário tem permissão completa
    let enrichedRows = rows
        .filter(r => {
            const agentData = result.find(a => a.id?.toString().toUpperCase() === r.autor?.toString().toUpperCase());
            if (!agentData) return false;
            return checkAgentPermission(agentData, user);
        })
        .map(r => {
            const agent = result.find(a => a.id?.toString().toUpperCase() === r.autor?.toString().toUpperCase());
            return {
                ...agent,
                ...r
            };
        });

    // Busca Global em todas as propriedades do objeto (ID, Nome, Unidade, Tipo, Gestor, etc)
    if (search) {
        const s = search.toLowerCase();
        enrichedRows = enrichedRows.filter(r =>
            Object.values(r).some(v => String(v || '').toLowerCase().includes(s))
        );
    }

    // Paginação em memória
    const limitVal = parseInt(limit) || 9999;
    const offsetVal = (parseInt(page) - 1) * limitVal;
    return enrichedRows.slice(offsetVal, offsetVal + limitVal);
}

async function update_pending_justify_admin(id, data) {
    const pool = cenos_pool;

    // Injetamos o status respondido para garantir que a pendência seja marcada como tratada
    // Fazemos isso no objeto data para evitar erro de duplicidade no SQL caso status venha no body
    data.status = 'respondido';

    const fields = Object.keys(data).filter(k => k !== 'id');
    const values = fields.map(k => data[k]);
    const setClause = fields.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const query = `UPDATE justify_pending SET ${setClause}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`;
    const { rows } = await pool.query(query, [...values, id]);
    return rows[0];
}

async function delete_pending_justify_admin(id) {
    const pool = cenos_pool;
    const { rows } = await pool.query('DELETE FROM justify_pending WHERE id = $1 RETURNING *', [id]);
    return rows[0];
}

// ─── daily_report ───────────────────────────────────────────────────────────
async function get_daily_reports_admin({ autor, data, limit = 9999, page = 1, includeAll = false, user, search, estado, motivo }) {
    const colabFilter = getColaboradoresFilter(user, { includeAllStates: true });
    const pool = cenos_pool;

    let query = `SELECT * FROM daily_report WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    // Se não for admin, aplica filtro de estados
    if (!userIsAdmin(user)) {
        if (colabFilter.allowedStates.length > 0) {
            query += ` AND estado = ANY($${paramIndex})`;
            params.push(colabFilter.allowedStates);
            paramIndex++;
        }
    }

    if (autor) {
        query += ` AND autor = $${paramIndex}`;
        params.push(autor);
        paramIndex++;
    }
    if (data) {
        query += ` AND DATE(created_at) = $${paramIndex}`;
        params.push(data);
        paramIndex++;
    }
    if (motivo) {
        query += ` AND motivo = $${paramIndex}`;
        params.push(motivo);
        paramIndex++;
    }

    // Se vier estado via query param, aplica (override do filtro de permissão)
    if (estado) {
        query += ` AND estado = $${paramIndex}`;
        params.push(estado.toLowerCase());
        paramIndex++;
    }

    query += ` ORDER BY created_at DESC`;

    const { rows } = await pool.query(query, params);

    // Usa filtro unificado para buscar agentes autorizados
    const result = await get_users_agents_admin({ user });

    // Filtra e enriquece os dados aplicando permissão completa (estado, regional, seccional, gestor)
    let enrichedRows = rows
        .filter(r => {
            const agentData = result.find(a => a.id?.toString().toUpperCase() === r.autor?.toString().toUpperCase());
            if (!agentData) return false;
            return checkAgentPermission(agentData, user);
        })
        .map(r => {
            const agent = result.find(a => a.id?.toString().toUpperCase() === r.autor?.toString().toUpperCase());
            return {
                ...agent,
                ...r
            };
        });

    // Busca Global em todas as propriedades do objeto resultante
    if (search) {
        const s = search.toLowerCase();
        enrichedRows = enrichedRows.filter(r =>
            Object.values(r).some(v => String(v || '').toLowerCase().includes(s))
        );
    }

    if (includeAll) return enrichedRows;

    // Paginação em memória
    const limitVal = parseInt(limit) || 9999;
    const offsetVal = (parseInt(page) - 1) * limitVal;
    return enrichedRows.slice(offsetVal, offsetVal + limitVal);
}

async function update_daily_report_admin(id, data) {
    const pool = cenos_pool;
    const fields = Object.keys(data).filter(k => k !== 'id');
    const values = fields.map(k => data[k]);
    const setClause = fields.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const query = `UPDATE daily_report SET ${setClause}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`;
    const { rows } = await pool.query(query, [...values, id]);
    return rows[0];
}

async function delete_daily_report_admin(id) {
    const pool = cenos_pool;
    const { rows } = await pool.query('DELETE FROM daily_report WHERE id = $1 RETURNING *', [id]);
    return rows[0];
}

async function get_instalations_admin({ query = [], type, user, estado }) {
    if (!query || query.length === 0) return [];

    // Remove tipos não permitidos
    if (type === 'medidor' || type === 'contacontrato') {
        return [];
    }

    const column = 'instalacao';
    const placeholders = query.map((_, i) => `$${i + 1}`).join(',');
    const sql = `
        SELECT *
        FROM dados_instalacoes
        WHERE ${column} IN (${placeholders})
    `;

    const sql_state = `SELECT DISTINCT ON (${column}) *
        FROM matriz
        WHERE ${column} IN (${placeholders})
        AND LEFT(ntlei, 1) = 'A'
        AND latitude <> 0 AND latitude IS NOT NULL
        AND longitude <> 0 AND longitude IS NOT NULL
        ORDER BY ${column}, data_conclusao DESC
        LIMIT 100
    `;

    // Determina quais pools usar baseado no estado ou permissões
    const isAdmin = user?.role?.toLowerCase().includes('admin');
    let allowedStates = [];

    if (!isAdmin && user) {
        const filter = getColaboradoresFilter(user, { includeAllStates: true });
        allowedStates = filter.allowedStates || [];
    }

    // Se estado específico informado, usa ele; senão usa as permissões
    const targetEstado = estado ? [estado.toLowerCase()] : (allowedStates.length > 0 ? allowedStates : ['pi', 'ma']);

    try {
        const poolPromises = [];
        if (targetEstado.includes('pi')) {
            poolPromises.push(pi_pool.query(sql_state, query));
        } else {
            poolPromises.push(Promise.resolve({ rows: [] }));
        }
        if (targetEstado.includes('ma')) {
            poolPromises.push(ma_pool.query(sql_state, query));
        } else {
            poolPromises.push(Promise.resolve({ rows: [] }));
        }

        const [resMatrizPi, resMatrizMa] = await Promise.all(poolPromises);

        const matriz = [
            ...resMatrizPi.rows?.map(row => ({ ...row, estado: 'pi' })),
            ...resMatrizMa.rows?.map(row => ({ ...row, estado: 'ma' }))
        ];

        const localsPromises = [];
        if (targetEstado.includes('pi')) {
            localsPromises.push(localizacoes_pi_pool.query(sql, query));
        } else {
            localsPromises.push(Promise.resolve({ rows: [] }));
        }

        const [resLocals] = await Promise.all(localsPromises);
        const locals = resLocals.rows;

        const resultsMap = [];

        matriz.forEach(m => {
            const data = locals.find(l => l['instalacao'] === m['instalacao']);
            if (!data) {
                resultsMap.push(
                    {
                        instalacao: m['instalacao'],
                        conta_contrato: null,
                        medidor: null,
                        md_vizinho: null,
                        unid_leit: null,
                        status: m['status_ds'] === 'LG' ? 'LIGADO' : 'DESLIGADO',
                        endereco: null,
                        nome_cliente: null,
                        lat_cad: null,
                        long_cad: null,
                        lat_leitura: m['latitude'],
                        long_leitura: m['longitude'],
                        lat_lig: null,
                        lon_lig: null
                    }
                )
                return;
            }
            resultsMap.push({ ...data, lat_leitura: m['latitude'], long_leitura: m['longitude'] });
        });
        
        // console.log(resultsMap);
        return resultsMap;
    } catch (err) {
        console.error('Erro em get_instalations:', err);
        throw err;
    }
}

async function get_agent_audit_log(agenteId, { page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;
    const { rows } = await cenos_pool.query(`
        SELECT a.id, a.agente_id, a.field, a.from_value, a.to_value, 
               COALESCE(u.nome, a.changed_by) AS changed_by, a.changed_at
        FROM agente_audit_log a
        LEFT JOIN users u ON u.email = a.changed_by
        WHERE a.agente_id = $1
        ORDER BY a.changed_at DESC, a.id DESC
        LIMIT $2 OFFSET $3
    `, [agenteId, limit, offset]);
    const { rows: [countRow] } = await cenos_pool.query(
        `SELECT COUNT(*)::int as total FROM agente_audit_log WHERE agente_id = $1`,
        [agenteId]
    );
    return { rows, total: countRow.total, page, limit };
}

module.exports = {
    get_inventory_admin,
    update_inventory_admin,
    delete_inventory_admin,
    get_justify_admin,
    save_justify_admin,
    update_justify_admin,
    delete_justify_admin,
    get_pending_justifies_admin,
    update_pending_justify_admin,
    delete_pending_justify_admin,
    get_daily_reports_admin,
    update_daily_report_admin,
    delete_daily_report_admin,
    get_instalations_admin,
    get_users_agents_admin,
    get_users_agents_admin_paginated,
    get_users_only_login_paginated,
    create_user_agent_admin,
    update_user_agent_admin,
    delete_user_agent_admin,
    bulk_update_user_agents_admin,
    bulk_delete_user_agents_admin,
    send_message_to_agent,
    send_telegram_to_agent_by_id,
    get_justify_types_admin,
    get_user_agent_options,
    get_agent_audit_log,
    getUserAllowedStatePools,
    getFilterUser,
    userIsAdmin,
    getColaboradoresFilter,
    applyColaboradoresFilter,
    checkAgentPermission,
    buildUserPermissionSQL
};
