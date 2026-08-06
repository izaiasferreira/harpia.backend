const { sinergia_pool } = require('../src/db');

jest.mock('../src/db', () => ({
    sinergia_pool: { query: jest.fn() },
    pi_pool: { query: jest.fn() },
    ma_pool: { query: jest.fn() },
    localizacoes_pi_pool: { query: jest.fn() }
}));

const {
    get_users_agents_admin_paginated,
    get_user_agent_options
} = require('../src/functions/database/admin');

const ADMIN = { id: 1, role: 'COMPANY_ADMIN', permissions: [] };

const COLAB = [
    { 'ID': 'A1', 'MAT': '1', 'Nome': 'Alice', 'estado': 'pi', 'GESTOR IMEDIATO': 'G1', 'Cargo': 'AGENTE A', 'processo': 'LEITURA', regional: 'NORTE', seccional: 'S1', status: true, situacao: 'active' },
    { 'ID': 'A2', 'MAT': '2', 'Nome': 'Bob', 'estado': 'ma', 'GESTOR IMEDIATO': 'G2', 'Cargo': 'AGENTE B', 'processo': 'COBRANÇA', regional: 'SUL', seccional: 'S2', status: false, situacao: 'vocation' }
];

// Dispatcher: resolve linhas de acordo com o SQL executado
const mockPool = (overrides = {}) => {
    sinergia_pool.query.mockImplementation((sql) => {
        if (sql.includes('SELECT COUNT')) return Promise.resolve({ rows: overrides.count || [] });
        if (sql.startsWith('SELECT * FROM colaboradores')) return Promise.resolve({ rows: overrides.colab || [] });
        if (sql.includes('FROM login WHERE id IN')) return Promise.resolve({ rows: overrides.login || [] });
        if (sql.includes('pin_status')) return Promise.resolve({ rows: overrides.pins || [] });
        if (sql.includes('FROM inventory')) return Promise.resolve({ rows: overrides.inventory || [] });
        if (sql.includes('status::text')) return Promise.resolve({ rows: overrides.statusRows || [] });
        if (sql.includes('TRIM(situacao)')) return Promise.resolve({ rows: overrides.situacaoRows || [] });
        return Promise.resolve({ rows: [] });
    });
};

const findCountSql = () => {
    const call = sinergia_pool.query.mock.calls.find(([sql]) => String(sql).includes('SELECT COUNT'));
    return call ? { sql: call[0], params: call[1] } : null;
};

const findColabSql = () => {
    const call = sinergia_pool.query.mock.calls.find(([sql]) => String(sql).startsWith('SELECT * FROM colaboradores'));
    return call ? { sql: call[0], params: call[1] } : null;
};

beforeEach(() => {
    jest.clearAllMocks();
    sinergia_pool.query.mockResolvedValue({ rows: [] });
});

describe('get_users_agents_admin_paginated — filtros multi-valor', () => {
    test('deve montar cláusula ANY para cargo com array', async () => {
        mockPool();
        await get_users_agents_admin_paginated({
            user: ADMIN,
            cargo: ['AGENTE A', 'AGENTE B']
        });
        const { sql, params } = findCountSql();
        expect(sql).toContain(`AND "Cargo" = ANY($2)`);
        expect(params[1]).toEqual(['AGENTE A', 'AGENTE B']);
    });

    test('deve aceitar filtros comma-separated (string)', async () => {
        mockPool();
        await get_users_agents_admin_paginated({
            user: ADMIN,
            regional: 'NORTE,SUL',
            gestor: 'G1,G2'
        });
        const { sql, params } = findCountSql();
        expect(sql).toContain(`AND "regional" = ANY($2)`);
        expect(sql).toContain(`AND "GESTOR IMEDIATO" = ANY($3)`);
        expect(params[1]).toEqual(['NORTE', 'SUL']);
        expect(params[2]).toEqual(['G1', 'G2']);
    });

    test('deve combinar __VAZIO__ com valores em cláusula única', async () => {
        mockPool();
        await get_users_agents_admin_paginated({
            user: ADMIN,
            regional: ['__VAZIO__', 'NORTE']
        });
        const { sql, params } = findCountSql();
        expect(sql).toContain(`AND ("regional" = ANY($2) OR "regional" IS NULL OR TRIM("regional") = '')`);
        expect(params[1]).toEqual(['NORTE']);
    });

    test('deve filtrar por múltiplos estados', async () => {
        mockPool();
        await get_users_agents_admin_paginated({
            user: ADMIN,
            estado: ['pi', 'ma']
        });
        const { params } = findCountSql();
        expect(params[0]).toEqual(['pi', 'ma']);
    });

    test('deve montar cláusula de status para múltiplos valores booleanos', async () => {
        mockPool();
        await get_users_agents_admin_paginated({
            user: ADMIN,
            status: ['true', 'false']
        });
        const { sql, params } = findCountSql();
        expect(sql).toContain(`AND "status" = ANY($2::boolean[])`);
        expect(params[1]).toEqual([true, false]);
    });

    test('deve aplicar a mesma cláusula na query de dados (colabQuery)', async () => {
        mockPool();
        await get_users_agents_admin_paginated({
            user: ADMIN,
            cargo: ['AGENTE A', 'AGENTE B']
        });
        const { sql } = findColabSql();
        expect(sql).toContain(`AND "Cargo" = ANY($2)`);
    });

    test('deve filtrar login_status por inclusão em lista', async () => {
        mockPool({ colab: COLAB });
        const res = await get_users_agents_admin_paginated({
            user: ADMIN,
            login_status: ['none', 'pending']
        });
        expect(res.data.length).toBe(2);

        const res2 = await get_users_agents_admin_paginated({
            user: ADMIN,
            login_status: ['online']
        });
        expect(res2.data.length).toBe(0);
    });
});

describe('get_user_agent_options — filtros multi-valor', () => {
    test('deve montar cláusula ANY para regional/seccional em lista', async () => {
        mockPool();
        await get_user_agent_options({
            user: ADMIN,
            regional: ['NORTE', 'SUL'],
            seccional: ['S1', 'S2']
        });

        const gestoresCall = sinergia_pool.query.mock.calls.find(([sql]) => String(sql).includes('GESTOR IMEDIATO'));
        expect(gestoresCall[0]).toContain(`AND regional = ANY($1)`);
        expect(gestoresCall[0]).toContain(`AND seccional = ANY($2)`);
        expect(gestoresCall[1][0]).toEqual(['NORTE', 'SUL']);
        expect(gestoresCall[1][1]).toEqual(['S1', 'S2']);
    });

    test('deve montar cláusula de estado para múltiplos estados', async () => {
        mockPool();
        await get_user_agent_options({
            user: ADMIN,
            estado: ['pi', 'ma']
        });

        const gestoresCall = sinergia_pool.query.mock.calls.find(([sql]) => String(sql).includes('GESTOR IMEDIATO'));
        expect(gestoresCall[0]).toContain(`AND estado = ANY($1)`);
        expect(gestoresCall[1][0]).toEqual(['pi', 'ma']);
    });

    test('deve retornar status e situacao distintos do banco', async () => {
        mockPool({
            statusRows: [{ status: 'true' }, { status: 'false' }],
            situacaoRows: [{ situacao: 'active' }, { situacao: 'vocation' }]
        });
        const result = await get_user_agent_options({ user: ADMIN });
        expect(result.status).toEqual(['true', 'false']);
        expect(result.situacao).toEqual(['active', 'vocation']);
    });

    test('deve retornar o conjunto canônico de login_status', async () => {
        mockPool();
        const result = await get_user_agent_options({ user: ADMIN });
        expect(result.login_status).toEqual(['online', 'offline', 'pending', 'none']);
    });

    test('não deve escopar por estado quando não há filtro de estado', async () => {
        mockPool();
        await get_user_agent_options({ user: ADMIN, estado: undefined });

        const cargosCall = sinergia_pool.query.mock.calls.find(([sql]) => String(sql).includes('"Cargo"'));
        expect(cargosCall[0]).not.toContain('AND estado');
    });

    test('status e situacao devem respeitar o escopo de estado', async () => {
        mockPool({
            statusRows: [{ status: 'true' }],
            situacaoRows: [{ situacao: 'active' }]
        });
        await get_user_agent_options({ user: ADMIN, estado: ['pi'] });

        const statusCall = sinergia_pool.query.mock.calls.find(([sql]) => String(sql).includes('status::text'));
        expect(statusCall[0]).toContain(`AND estado = ANY($1)`);
        expect(statusCall[1][0]).toEqual(['pi']);

        const situacaoCall = sinergia_pool.query.mock.calls.find(([sql]) => String(sql).includes('TRIM(situacao)'));
        expect(situacaoCall[0]).toContain(`AND estado = ANY($1)`);
        expect(situacaoCall[1][0]).toEqual(['pi']);
    });
});
