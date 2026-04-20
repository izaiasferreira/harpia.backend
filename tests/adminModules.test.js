const request = require('supertest');

describe.skip('API Admin Modules (skip - hangs on Redis)', () => {
    let app;

    beforeAll(async () => {
        process.env.NODE_ENV = 'test';
        app = require('../src/app');
        await new Promise(r => setTimeout(r, 100));
    });

    test('GET /admin/dashboard - 401 sem auth', async () => {
        const res = await request(app).get('/admin/dashboard');
        expect(res.status).toBe(401);
    });
});