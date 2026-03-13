const app = require('../src/app');
const request = require('supertest');
const pool = require('../src/db');

describe('Consultas Routes (E2E)', () => {
    const token = process.env.API_TOKEN;

    afterAll(async () => {
        await pool.end();
    }, 10000);

    const testEndpoints = [
        { name: 'pendencias', path: '/pendencias', type: 'text' },
        { name: 'pendencias_json', path: '/pendencias_json', type: 'json' },
        { name: 'cnl', path: '/cnl', type: 'text' },
        { name: 'cnl_to_lido_json', path: '/cnl_to_lido_json', type: 'json' },
        { name: 'first_cnl_json', path: '/first_cnl_json', type: 'json' },
        { name: 'c12_json', path: '/c12_json', type: 'json' },
        { name: 'c12_to_lido_json', path: '/c12_to_lido_json', type: 'json' },
        { name: 'first_c12_json', path: '/first_c12_json', type: 'json' },
        { name: 'e02_json', path: '/e02_json', type: 'json' },
        { name: 'c16_json', path: '/c16_json', type: 'json' },
        { name: 'perdas', path: '/perdas', type: 'text' },
        { name: 'perdas_json', path: '/perdas_json', type: 'json' },
        { name: 'not_start_services', path: '/not_start_services', type: 'json' },
        { name: 'completed_services', path: '/completed_services', type: 'json' },
        { name: 'incompleted_services', path: '/incompleted_services', type: 'json' }
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
        const res = await request(app).get('/pendencias_json?token=wrong');
        expect(res.body).toHaveProperty('error', 'Token inválido');
    });
});
