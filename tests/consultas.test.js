const app = require('../src/app');
const request = require('supertest');
const { pi_pool, ma_pool } = require('../src/db');

describe('Consultas Routes (E2E)', () => {
    const token = process.env.API_TOKEN;

    afterAll(async () => {
        await pi_pool.end();
        await ma_pool.end();
    }, 10000);

    const testEndpoints = [
        { name: 'pendencias', path: '/api/pendencias', type: 'text' },
        { name: 'pendencias_json', path: '/api/pendencias_json', type: 'json' },
        { name: 'cnl', path: '/api/cnl', type: 'text' },
        { name: 'cnl_to_lido_json', path: '/api/cnl_to_lido_json', type: 'json' },
        { name: 'first_cnl_json', path: '/api/first_cnl_json', type: 'json' },
        { name: 'c12_json', path: '/api/c12_json', type: 'json' },
        { name: 'c12_to_lido_json', path: '/api/c12_to_lido_json', type: 'json' },
        { name: 'first_c12_json', path: '/api/first_c12_json', type: 'json' },
        { name: 'e02_json', path: '/api/e02_json', type: 'json' },
        { name: 'c16_json', path: '/api/c16_json', type: 'json' },
        { name: 'perdas', path: '/api/perdas', type: 'text' },
        { name: 'perdas_json', path: '/api/perdas_json', type: 'json' },
        { name: 'not_start_services', path: '/api/not_start_services', type: 'json' },
        { name: 'completed_services', path: '/api/completed_services', type: 'json' },
        { name: 'incompleted_services', path: '/api/incompleted_services', type: 'json' }
    ];

    testEndpoints.forEach(endpoint => {
        it(`GET ${endpoint.path} should return 200 and correct type`, async () => {
            console.log(`Testing ${endpoint.name}`);
            const res = await request(app).get(`${endpoint.path}?token=${token}`);
            expect(res.statusCode).toEqual(200);
            if (endpoint.type === 'json') {
                expect(Array.isArray(res.body)).toBe(true);
            } else {
                expect(res.body).toHaveProperty('type', 'text');
            }
        }, 90000); // 90s timeout per E2E test
    });

    it('should return token error if invalid token', async () => {
        const res = await request(app).get('/api/pendencias_json?token=wrong');
        expect(res.body).toHaveProperty('error', 'Token inválido');
    });
});
