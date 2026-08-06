const request = require('supertest');
const app = require('../src/app');
const jwt = require('jsonwebtoken');
const { createUser } = require('../src/functions/database/users');
const { sinergia_pool } = require('../src/db');

const JWT_SECRET = process.env.JWT_SECRET || 'jwt_secret_change_me';

describe('GET /admin/service-notes/nearest-agents', () => {
    let token;
    let userId;
    let adminEmail;

    beforeAll(async () => {
        adminEmail = `test_na_${Date.now()}@example.com`;
        const user = await createUser({
            email: adminEmail,
            senha: 'password123',
            nome: 'Test Nearest Agents',
            role: 'COMPANY_ADMIN',
            estado: 'pi'
        });
        userId = user.id;
        token = jwt.sign({ id: userId, estado: 'pi', role: 'COMPANY_ADMIN' }, JWT_SECRET);
    });

    afterAll(async () => {
        if (userId) {
            await sinergia_pool.query('DELETE FROM users WHERE id = $1', [userId]);
        }
    });

    test('deve retornar 400 sem lat/lng', async () => {
        const res = await request(app)
            .get('/admin/service-notes/nearest-agents')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(400);
    });

    test('deve retornar 200 com lat/lng e radiusKm', async () => {
        const res = await request(app)
            .get('/admin/service-notes/nearest-agents')
            .set('Authorization', `Bearer ${token}`)
            .query({ lat: -5.089, lng: -42.801, radiusKm: 25 });
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    test('deve usar radiusKm default 10 quando nao informado', async () => {
        const res = await request(app)
            .get('/admin/service-notes/nearest-agents')
            .set('Authorization', `Bearer ${token}`)
            .query({ lat: -5.089, lng: -42.801 });
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    test('deve aceitar radiusKm=1 (valor minimo)', async () => {
        const res = await request(app)
            .get('/admin/service-notes/nearest-agents')
            .set('Authorization', `Bearer ${token}`)
            .query({ lat: -5.089, lng: -42.801, radiusKm: 1 });
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    test('deve aceitar radiusKm=100 (valor maximo)', async () => {
        const res = await request(app)
            .get('/admin/service-notes/nearest-agents')
            .set('Authorization', `Bearer ${token}`)
            .query({ lat: -5.089, lng: -42.801, radiusKm: 100 });
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    test('deve retornar 401 sem token', async () => {
        const res = await request(app)
            .get('/admin/service-notes/nearest-agents')
            .query({ lat: -5.089, lng: -42.801 });
        expect(res.status).toBe(401);
    });
});
