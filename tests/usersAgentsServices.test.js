const request = require('supertest');
const app = require('../src/app');

describe('GET /admin/users_agents/services', () => {
    test('deve retornar 401 sem token', async () => {
        const res = await request(app).get('/admin/users_agents/services');
        expect(res.status).toBe(401);
    });

    test('deve retornar 400 sem parâmetro id', async () => {
        const res = await request(app).get('/admin/users_agents/services');
        expect(res.status).toBe(401);
    });
});
