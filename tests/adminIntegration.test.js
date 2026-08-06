const request = require('supertest');
const app = require('../src/app');
const jwt = require('jsonwebtoken');

// Mock db pools
jest.mock('../src/db', () => ({
    sinergia_pool: { query: jest.fn() },
    pi_pool: { query: jest.fn() },
    ma_pool: { query: jest.fn() },
    localizacoes_pi_pool: { query: jest.fn() }
}));

// Mock permissions and modules to bypass middleware DB calls
jest.mock('../src/functions/database/permissions', () => ({
    getUserModules: jest.fn().mockResolvedValue(['all', 'users_agents', 'inventory', 'justify', 'daily_report', 'justify_pending']),
    getUserPermissions: jest.fn().mockResolvedValue([{ id: 1, name: 'Admin', modules: ['all'], filters: [] }]),
    getPermissions: jest.fn().mockResolvedValue([]),
    createPermissionsTable: jest.fn().mockResolvedValue(true)
}));

jest.mock('../src/functions/database/users', () => ({
    getUserById: jest.fn().mockResolvedValue({ id: 1, role: 'COMPANY_ADMIN', estado: 'pi' }),
    createUsersTable: jest.fn().mockResolvedValue(true),
    createUser: jest.fn().mockResolvedValue(true)
}));

jest.mock('../src/functions/database/branches', () => ({
    createBranchesTable: jest.fn().mockResolvedValue(true)
}));

const { sinergia_pool, pi_pool, ma_pool } = require('../src/db');

describe('Administrative GET Endpoints Integration', () => {
    let token;

    beforeAll(() => {
        token = jwt.sign({ id: 1, role: 'COMPANY_ADMIN', estado: 'pi' }, process.env.JWT_SECRET || 'jwt_secret_change_me');
    });

    beforeEach(() => {
        jest.clearAllMocks();
        // Default mocks for pool queries to prevent undefined errors
        sinergia_pool.query.mockResolvedValue({ rows: [] });
        pi_pool.query.mockResolvedValue({ rows: [] });
        ma_pool.query.mockResolvedValue({ rows: [] });
    });

    // Helper para encontrar a chamada correta no mock do pool
    const findQuery = (mock, table, type = 'SELECT') => {
        return mock.mock.calls.find(call => 
            call[0].includes(type) && 
            call[0].toLowerCase().includes(table.toLowerCase())
        );
    };

    describe('GET /admin/users_agents', () => {
        test('Pesquisa por Nome (Cruzamento de Bancos)', async () => {
            // Mock da busca de login (id ILIKE search)
            sinergia_pool.query.mockResolvedValueOnce({ rows: [{ id: 'T12345' }] }); // login search
            
            // Mock COUNT colaboradores
            sinergia_pool.query.mockResolvedValueOnce({ rows: [{ total: 1 }] });
            
            // Mock SELECT colaboradores
            sinergia_pool.query.mockResolvedValueOnce({ rows: [{ ID: 'T12345', Nome: 'João Teste', Cargo: 'NEG', MAT: '12345', estado: 'pi', seccional: null, regional: null, GESTOR IMEDIATO: null }] });

            const res = await request(app)
                .get('/admin/users_agents?search=João')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body[0].nome).toBe('João Teste');
        });

        test('Paginação Default', async () => {
            const res = await request(app)
                .get('/admin/users_agents')
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
        });
    });

    describe('GET /admin/inventory', () => {
        test('Lista com Paginação e Busca', async () => {
            sinergia_pool.query.mockImplementation(async (q) => {
                if (q.includes('SELECT')) return { rows: [{ id: 1, agente: 'T123' }] };
                return { rows: [] };
            });
            
            const res = await request(app)
                .get('/admin/inventory?page=2&limit=5&search=T123')
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
            const selectCall = findQuery(sinergia_pool.query, 'inventory');
            expect(selectCall[0]).toContain('LIMIT $2 OFFSET $3');
            expect(selectCall[1]).toContain(5); // limit
            expect(selectCall[1]).toContain(5); // offset
            expect(selectCall[1]).toContain('%T123%'); // search
        });
    });

    describe('GET /admin/justify_pending', () => {
        test('Filtro por status padronizado', async () => {
            const res = await request(app)
                .get('/admin/justify_pending?status=respondido')
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
            const selectCall = findQuery(sinergia_pool.query, 'justify_pending');
            expect(selectCall[1]).toContain('respondido');
        });
    });

    describe('GET /admin/justify', () => {
        test('Lista tipos únicos de motivos', async () => {
            sinergia_pool.query.mockResolvedValueOnce({ rows: [{ motivo: 'A' }, { motivo: 'B' }] });
            const res = await request(app)
                .get('/admin/justify/types')
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
            expect(res.body).toContain('A');
            expect(res.body).toContain('B');
            const selectCall = findQuery(sinergia_pool.query, 'justificativas');
            expect(selectCall[0]).toContain('DISTINCT motivo');
        });
    });

    describe('GET /admin/daily_report', () => {
        test('Lista com parâmetros de busca', async () => {
            const res = await request(app)
                .get('/admin/daily_report?search=Teste')
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
            const selectCall = findQuery(sinergia_pool.query, 'daily_report');
            expect(selectCall[0]).toContain('OR motivo ILIKE');
            expect(selectCall[1]).toContain('%Teste%');
        });
    });
});
