const request = require('supertest');
const app = require('../src/app');
const { generateToken } = require('../src/middlewares/jwtAuth');

jest.mock('../src/functions/database/users', () => ({
    getUserById: jest.fn(),
    createUser: jest.fn(),
    createUsersTable: jest.fn(() => Promise.resolve()),
    verifyUser: jest.fn(),
    updateLastLogin: jest.fn(),
    listUsers: jest.fn(),
    updateUser: jest.fn(),
    changePassword: jest.fn(),
    deleteUser: jest.fn()
}));

jest.mock('../src/functions/database/permissions', () => ({
    getUserModules: jest.fn(() => Promise.resolve([])),
    createPermissionsTable: jest.fn(() => Promise.resolve()),
    getUserPermissions: jest.fn(() => Promise.resolve([]))
}));


const { getUserById } = require('../src/functions/database/users');

describe('Modules Management', () => {
    let adminToken;
    let userToken;

    beforeAll(() => {
        // Mock users for tokens
        const adminUser = {
            id: 1,
            email: 'admin@test.com',
            role: 'COMPANY_ADMIN',
            estado: 'pi'
        };
        const normalUser = {
            id: 2,
            email: 'user@test.com',
            role: 'USER',
            estado: 'pi'
        };

        adminToken = generateToken(adminUser);
        userToken = generateToken(normalUser);

        // Setup mock return values
        getUserById.mockImplementation((id) => {
            if (id === 1) return Promise.resolve({ ...adminUser, nome: 'Admin' });
            if (id === 2) return Promise.resolve({ ...normalUser, nome: 'User' });
            return Promise.resolve(null);
        });
    });


    test('GET /admin/available_modules should return 200 for admin', async () => {
        const res = await request(app)
            .get('/admin/available_modules')
            .set('Authorization', `Bearer ${adminToken}`);
        
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);
        expect(res.body[0]).toHaveProperty('id');
        expect(res.body[0]).toHaveProperty('name');
    });

    test('GET /admin/available_modules should return 403 for non-admin', async () => {
        const res = await request(app)
            .get('/admin/available_modules')
            .set('Authorization', `Bearer ${userToken}`);
        
        expect(res.status).toBe(403);
    });

    test('GET /admin/available_modules should return 401 without token', async () => {
        const res = await request(app).get('/admin/available_modules');
        expect(res.status).toBe(401);
    });
});
