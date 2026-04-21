const request = require('supertest');
const app = require('../src/app');
const jwt = require('jsonwebtoken');

// Mock database functions
jest.mock('../src/functions/database/admin', () => ({
    get_inventory_admin: jest.fn(),
    save_inventory_admin: jest.fn(),
    update_inventory_admin: jest.fn(),
    delete_inventory_admin: jest.fn(),
    get_justify_admin: jest.fn(),
    save_justify_admin: jest.fn(),
    update_justify_admin: jest.fn(),
    delete_justify_admin: jest.fn(),
    get_pending_justifies_admin: jest.fn(),
    create_pending_justify_admin: jest.fn(),
    update_pending_justify_admin: jest.fn(),
    delete_pending_justify_admin: jest.fn(),
    get_daily_reports_admin: jest.fn(),
    create_daily_report_admin: jest.fn(),
    update_daily_report_admin: jest.fn(),
    delete_daily_report_admin: jest.fn(),
    get_instalations_admin: jest.fn(),
    get_users_agents_admin: jest.fn()
}));

jest.mock('../src/functions/database/users', () => ({
    getUserById: jest.fn().mockResolvedValue({ id: 1, role: 'COMPANY_ADMIN', estado: 'pi' }),
    createUsersTable: jest.fn().mockResolvedValue(true)
}));

jest.mock('../src/functions/database/permissions', () => ({
    getUserModules: jest.fn().mockResolvedValue(['inventory', 'create_inventory', 'justify', 'create_justify', 'daily_report', 'create_daily_report', 'justify_pending', 'create_justify_pending', 'users_agents']),
    getUserPermissions: jest.fn().mockResolvedValue([{ id: 1, name: 'Admin', modules: ['all'], filters: [] }]),
    createPermissionsTable: jest.fn().mockResolvedValue(true)
}));

jest.mock('../src/functions/database/branches', () => ({
    createBranchesTable: jest.fn().mockResolvedValue(true),
    listModules: jest.fn().mockResolvedValue([])
}));

const {
    save_inventory_admin,
    save_justify_admin,
    create_daily_report_admin,
    create_pending_justify_admin,
    get_inventory_admin,
    get_justify_admin,
    get_daily_reports_admin,
    get_pending_justifies_admin,
    get_users_agents_admin
} = require('../src/functions/database/admin');

describe('Admin CRUD Modules', () => {
    let token;

    beforeAll(() => {
        token = jwt.sign({ id: 1, estado: 'pi' }, process.env.JWT_SECRET || 'jwt_secret_change_me');
    });

    describe('Inventory CRUD', () => {
        test('POST /admin/inventory - Happy Path', async () => {
            save_inventory_admin.mockResolvedValue({ id: 1, agente: 'TEST' });
            const res = await request(app)
                .post('/admin/inventory')
                .set('Authorization', `Bearer ${token}`)
                .send({ agente: 'TEST', pda_imei_1: '123' });
            
            expect(res.status).toBe(201);
            expect(res.body.agente).toBe('TEST');
        });

        test('POST /admin/inventory - 401 Sem Token', async () => {
            const res = await request(app).post('/admin/inventory').send({});
            expect(res.status).toBe(401);
        });

        test('GET /admin/inventory - Happy Path', async () => {
            get_inventory_admin.mockResolvedValue([{ id: 1, agente: 'TEST' }]);
            const res = await request(app)
                .get('/admin/inventory?page=1&limit=10')
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBeTruthy();
            expect(res.body[0].agente).toBe('TEST');
        });
    });

    describe('Justify CRUD', () => {
        test('POST /admin/justify - Happy Path', async () => {
            save_justify_admin.mockResolvedValue({ id: 1, instalacao: '12345' });
            const res = await request(app)
                .post('/admin/justify')
                .set('Authorization', `Bearer ${token}`)
                .send({ instalacao: '12345', motivo: 'Teste' });
            
            expect(res.status).toBe(201);
            expect(res.body.instalacao).toBe('12345');
        });

        test('GET /admin/justify - Happy Path', async () => {
            get_justify_admin.mockResolvedValue([{ id: 1, instalacao: '12345' }]);
            const res = await request(app)
                .get('/admin/justify?page=1&limit=10')
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBeTruthy();
            expect(res.body[0].instalacao).toBe('12345');
        });
    });

    describe('Daily Report CRUD', () => {
        test('POST /admin/daily_report - Happy Path', async () => {
            create_daily_report_admin.mockResolvedValue({ id: 1, autor: 'TEST' });
            const res = await request(app)
                .post('/admin/daily_report')
                .set('Authorization', `Bearer ${token}`)
                .send({ autor: 'TEST', nota: 5 });
            
            expect(res.status).toBe(201);
            expect(res.body.autor).toBe('TEST');
        });

        test('GET /admin/daily_report - Happy Path', async () => {
            get_daily_reports_admin.mockResolvedValue([{ id: 1, autor: 'TEST' }]);
            const res = await request(app)
                .get('/admin/daily_report?page=1&limit=10')
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBeTruthy();
            expect(res.body[0].autor).toBe('TEST');
        });
    });

    describe('Justify Pending CRUD', () => {
        test('POST /admin/justify_pending - Happy Path', async () => {
            create_pending_justify_admin.mockResolvedValue({ id: 1, autor: 'TEST' });
            const res = await request(app)
                .post('/admin/justify_pending')
                .set('Authorization', `Bearer ${token}`)
                .send({ autor: 'TEST', quantidade: 1 });
            
            expect(res.status).toBe(201);
            expect(res.body.autor).toBe('TEST');
        });

        test('GET /admin/justify_pending - Happy Path', async () => {
            get_pending_justifies_admin.mockResolvedValue([{ id: 1, autor: 'TEST' }]);
            const res = await request(app)
                .get('/admin/justify_pending?page=1&limit=10')
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBeTruthy();
            expect(res.body[0].autor).toBe('TEST');
        });
    });

    describe('Users Agents Listing', () => {
        test('GET /admin/users_agents - Happy Path', async () => {
            get_users_agents_admin.mockResolvedValue([{ id: 'T12345', nome: 'Agente 1' }]);
            const res = await request(app)
                .get('/admin/users_agents?page=1&limit=10')
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBeTruthy();
            expect(res.body[0].id).toBe('T12345');
        });
    });
});
