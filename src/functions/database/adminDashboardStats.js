const { sinergia_pool } = require('../../db');
const { get_users_agents_admin_paginated } = require('./admin');

const EQUIPMENT_TIPO_LABEL = {
    pda: 'PDA',
    impressora: 'Impressora',
    maquineta: 'Maquineta'
};

const getStartOfDayUTC = () => {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d;
};

function countByKey(items, getKey) {
    const map = new Map();
    items.forEach(item => {
        let key = getKey(item);
        if (key === null || key === undefined) key = '';
        key = String(key).trim();
        const label = key || 'Sem informação';
        map.set(label, (map.get(label) || 0) + 1);
    });
    return Array.from(map.entries())
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value);
}

function formatTipoLabel(tipo) {
    const raw = String(tipo || '').trim().toLowerCase();
    if (EQUIPMENT_TIPO_LABEL[raw]) return EQUIPMENT_TIPO_LABEL[raw];
    if (!raw) return 'Sem informação';
    return raw.charAt(0).toUpperCase() + raw.slice(1);
}

const SITUACAO_LABEL = {
    active: 'Ativo',
    vocation: 'Férias',
    inactive: 'Desligado',
    away: 'Afastado'
};

function formatStatus(status) {
    if (status === true) return 'Ativo';
    if (status === false) return 'Inativo';
    return 'Sem informação';
}

function formatSituacao(situacao) {
    const raw = String(situacao || '').trim().toLowerCase();
    if (SITUACAO_LABEL[raw]) return SITUACAO_LABEL[raw];
    if (!raw) return 'Sem informação';
    return raw.charAt(0).toUpperCase() + raw.slice(1);
}

async function getAdminDashboardStats({ user, filters = {} }) {
    const {
        regional,
        seccional,
        gestor,
        estado
    } = filters;

    const res = await get_users_agents_admin_paginated({
        user,
        page: 1,
        limit: 100000,
        regional,
        seccional,
        gestor,
        estado
    });

    const agents = res.data || [];
    const totalUsers = agents.length;
    const agentIdSet = new Set(agents.map(a => (a.id || '').toString().toUpperCase()));

    // Status de login (mesmo método do /control/agents via get_users_agents_admin_paginated)
    const loginStatus = { online: 0, offline: 0, pending: 0, none: 0 };
    agents.forEach(a => {
        const st = a.login_status || 'none';
        loginStatus[st] = (loginStatus[st] || 0) + 1;
    });

    const byEstado = countByKey(agents, a => a.estado);
    const byRegional = countByKey(agents, a => a.regional);
    const byProcesso = countByKey(agents, a => a.setor || a.processo);
    const byStatus = countByKey(agents, a => formatStatus(a.status));
    const bySituacao = countByKey(agents, a => formatSituacao(a.situacao));

    // Agentes com inventário = agentes com equipamento associado (posse ativa), restrito aos agentes visíveis
    let agentsWithInventory = 0;
    const inventoryByTypeMap = new Map();
    try {
        const { rows: equipmentRows } = await sinergia_pool.query(
            `SELECT ea.agente, e.tipo
             FROM equipment_assignments ea
             INNER JOIN equipment e ON e.id = ea.equipment_id
             WHERE ea.status = 'ativa'`
        );

        const agentsWithInventorySet = new Set();
        equipmentRows.forEach(r => {
            if (!r.agente) return;
            const agentId = r.agente.toString().toUpperCase();
            if (!agentIdSet.has(agentId)) return;
            agentsWithInventorySet.add(agentId);

            const tipo = formatTipoLabel(r.tipo);
            inventoryByTypeMap.set(tipo, (inventoryByTypeMap.get(tipo) || 0) + 1);
        });
        agentsWithInventory = agentsWithInventorySet.size;
    } catch (e) {
        console.error('Erro ao buscar inventários do dashboard:', e.message);
    }

    const inventoryByType = Array.from(inventoryByTypeMap.entries())
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value);

    // Agentes que fizeram login no dia (heartbeats do dia), restrito aos agentes visíveis
    let todayLogins = 0;
    try {
        const startOfDay = getStartOfDayUTC();
        const { rows: heartbeatRows } = await sinergia_pool.query(
            `SELECT DISTINCT UPPER(agent_id) AS agent_id
             FROM agent_heartbeats
             WHERE last_heartbeat_at >= $1`,
            [startOfDay]
        );
        heartbeatRows.forEach(r => {
            if (r.agent_id && agentIdSet.has(r.agent_id)) todayLogins++;
        });
    } catch (e) {
        console.error('Erro ao buscar heartbeats do dia:', e.message);
    }

    return {
        totalUsers,
        todayLogins,
        agentsWithInventory,
        loginStatus: {
            online: loginStatus.online,
            offline: loginStatus.offline,
            pending: loginStatus.pending,
            none: loginStatus.none
        },
        inventoryByType,
        byEstado,
        byRegional,
        byProcesso,
        byStatus,
        bySituacao
    };
}

module.exports = { getAdminDashboardStats, getStartOfDayUTC };
