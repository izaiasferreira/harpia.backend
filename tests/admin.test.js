const request = require('supertest');
const app = require('../src/app');

describe('API Admin', () => {
    const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin_secret_change_me';

    describe('GET /admin/me', () => {
        test('deve retornar 401 sem authorization', async () => {
            const res = await request(app).get('/admin/me');
            expect(res.status).toBe(401);
        });

        test('deve retornar 401 sem x-admin-id', async () => {
            const res = await request(app)
                .get('/admin/me')
                .set('Authorization', `Basic ${ADMIN_SECRET}`);
            expect(res.status).toBe(401);
        });
    });

    describe('GET /admin/justify', () => {
        test('deve retornar 401 sem authorization', async () => {
            const res = await request(app).get('/admin/justify');
            expect(res.status).toBe(401);
        });
    });

    describe('GET /admin/inventory', () => {
        test('deve retornar 401 sem authorization', async () => {
            const res = await request(app).get('/admin/inventory');
            expect(res.status).toBe(401);
        });
    });

    describe('GET /admin/justify_pending', () => {
        test('deve retornar 401 sem authorization', async () => {
            const res = await request(app).get('/admin/justify_pending');
            expect(res.status).toBe(401);
        });
    });

    describe('GET /admin/daily_report', () => {
        test('deve retornar 401 sem authorization', async () => {
            const res = await request(app).get('/admin/daily_report');
            expect(res.status).toBe(401);
        });
    });

    describe('GET /admin/admins', () => {
        test('deve retornar 401 sem authorization', async () => {
            const res = await request(app).get('/admin/admins');
            expect(res.status).toBe(401);
        });
    });
});