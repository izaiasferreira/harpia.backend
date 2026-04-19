const request = require('supertest');
const app = require('../src/app');

describe('API Admin Users', () => {
    const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin_secret_change_me';

    describe('POST /admin/user/login', () => {
        test('deve retornar 400 se email não fornecido', async () => {
            const res = await request(app).post('/admin/user/login').send({ senha: '123' });
            expect(res.status).toBe(400);
        });

        test('deve retornar 400 se senha não fornecida', async () => {
            const res = await request(app).post('/admin/user/login').send({ email: 'teste@email.com' });
            expect(res.status).toBe(400);
        });
    });

    describe('GET /admin/user/me', () => {
        test('deve retornar 401 sem authorization', async () => {
            const res = await request(app).get('/admin/user/me');
            expect(res.status).toBe(401);
        });

        test('deve retornar 401 sem x-user-id', async () => {
            const res = await request(app)
                .get('/admin/user/me')
                .set('Authorization', `Basic ${ADMIN_SECRET}`);
            expect(res.status).toBe(401);
        });
    });

    describe('GET /admin/user/modules', () => {
        test('deve retornar 401 sem authorization', async () => {
            const res = await request(app).get('/admin/user/modules');
            expect(res.status).toBe(401);
        });
    });

    describe('GET /admin/branch', () => {
        test('deve retornar 401 sem authorization', async () => {
            const res = await request(app).get('/admin/branch');
            expect(res.status).toBe(401);
        });
    });

    describe('GET /admin/permission', () => {
        test('deve retornar 401 sem authorization', async () => {
            const res = await request(app).get('/admin/permission');
            expect(res.status).toBe(401);
        });
    });
});