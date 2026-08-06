const { sinergia_pool } = require('../src/db');

jest.mock('../src/db', () => ({
    sinergia_pool: { query: jest.fn() },
    pi_pool: { query: jest.fn() },
    ma_pool: { query: jest.fn() },
    localizacoes_pi_pool: { query: jest.fn() }
}));

jest.mock('../src/functions/database/admin', () => ({
    get_users_agents_admin_paginated: jest.fn()
}));

const admin = require('../src/functions/database/admin');
const { getAdminDashboardStats } = require('../src/functions/database/adminDashboardStats');

const AGENTS = [
    { id: 'A1', estado: 'pi', regional: 'NORTE', setor: 'LEITURA', login_status: 'online', status: true, situacao: 'active' },
    { id: 'A2', estado: 'pi', regional: 'NORTE', setor: 'COBRANÇA', login_status: 'pending', status: true, situacao: 'vocation' },
    { id: 'A3', estado: 'ma', regional: 'SUL', setor: 'LEITURA', login_status: 'none', status: false, situacao: 'inactive' },
    { id: 'A4', estado: 'ma', regional: 'SUL', setor: 'LEITURA', login_status: 'offline', status: false, situacao: 'away' }
];

const EQUIPMENT_ROWS = [
    { agente: 'A1', tipo: 'pda' },
    { agente: 'A1', tipo: 'impressora' },
    { agente: 'a3', tipo: 'maquineta' },
    { agente: 'B1', tipo: 'pda' }
];

const HEARTBEAT_ROWS = [
    { agent_id: 'A1' },
    { agent_id: 'A4' },
    { agent_id: 'B1' }
];

beforeEach(() => {
    jest.clearAllMocks();
    sinergia_pool.query.mockResolvedValue({ rows: [] });
});

describe('getAdminDashboardStats', () => {
    test('deve computar estatísticas a partir dos agentes visíveis', async () => {
        admin.get_users_agents_admin_paginated.mockResolvedValue({ data: AGENTS, total: 4 });

        const stats = await getAdminDashboardStats({ user: { id: 1, role: 'COMPANY_ADMIN' } });

        expect(stats.totalUsers).toBe(4);
        expect(stats.loginStatus).toEqual({ online: 1, offline: 1, pending: 1, none: 1 });
        expect(stats.byEstado).toEqual([
            { label: 'pi', value: 2 },
            { label: 'ma', value: 2 }
        ]);
        expect(stats.byRegional).toEqual([
            { label: 'NORTE', value: 2 },
            { label: 'SUL', value: 2 }
        ]);
        expect(stats.byProcesso).toEqual([
            { label: 'LEITURA', value: 3 },
            { label: 'COBRANÇA', value: 1 }
        ]);
        expect(stats.byStatus).toEqual([
            { label: 'Ativo', value: 2 },
            { label: 'Inativo', value: 2 }
        ]);
        expect(stats.bySituacao).toEqual([
            { label: 'Ativo', value: 1 },
            { label: 'Férias', value: 1 },
            { label: 'Desligado', value: 1 },
            { label: 'Afastado', value: 1 }
        ]);
    });

    test('deve contar inventário apenas de agentes com equipamento ativo e itens por tipo', async () => {
        admin.get_users_agents_admin_paginated.mockResolvedValue({ data: AGENTS, total: 4 });
        sinergia_pool.query.mockResolvedValueOnce({ rows: EQUIPMENT_ROWS });

        const stats = await getAdminDashboardStats({ user: { id: 1, role: 'COMPANY_ADMIN' } });

        expect(stats.agentsWithInventory).toBe(2);
        expect(stats.inventoryByType).toEqual([
            { label: 'PDA', value: 1 },
            { label: 'Impressora', value: 1 },
            { label: 'Maquineta', value: 1 }
        ]);
    });

    test('deve contar logins do dia via heartbeats apenas de agentes visíveis', async () => {
        admin.get_users_agents_admin_paginated.mockResolvedValue({ data: AGENTS, total: 4 });
        sinergia_pool.query.mockResolvedValueOnce({ rows: [] });
        sinergia_pool.query.mockResolvedValueOnce({ rows: HEARTBEAT_ROWS });

        const stats = await getAdminDashboardStats({ user: { id: 1, role: 'COMPANY_ADMIN' } });

        expect(stats.todayLogins).toBe(2);
    });

    test('sem agentes visíveis retorna zeros e arrays vazios', async () => {
        admin.get_users_agents_admin_paginated.mockResolvedValue({ data: [], total: 0 });

        const stats = await getAdminDashboardStats({ user: { id: 1, role: 'COMPANY_ADMIN' } });

        expect(stats.totalUsers).toBe(0);
        expect(stats.todayLogins).toBe(0);
        expect(stats.agentsWithInventory).toBe(0);
        expect(stats.loginStatus).toEqual({ online: 0, offline: 0, pending: 0, none: 0 });
        expect(stats.byEstado).toEqual([]);
        expect(stats.byRegional).toEqual([]);
        expect(stats.byProcesso).toEqual([]);
        expect(stats.byStatus).toEqual([]);
        expect(stats.bySituacao).toEqual([]);
    });
});
