const { sinergia_pool } = require('../src/db');
const request = require('supertest');
const app = require('../src/app');

jest.mock('../src/middlewares/jwtAuth', () => ({
    verifyToken: (...args) => {
        if (args.length === 3) {
            args[0].user = { id: 'TESTADMIN', estado: 'SP', role: 'admin' };
            args[2]();
        } else {
            return (req, res, next) => {
                req.user = { id: 'TESTADMIN', estado: 'SP', role: 'admin' };
                next();
            }
        }
    },
    verifyModule: (mod) => (req, res, next) => {
        next();
    }
}));

describe('Manager Dashboard V2', () => {
    let tokenAdmin = 'dummy-token';

    beforeAll(async () => {

        // Create manager and subordinate
        await sinergia_pool.query(`
            INSERT INTO colaboradores ("ID", "MAT", "Nome", "estado", is_gestor, "GESTOR IMEDIATO", status)
            VALUES 
            ('DASHGESTOR', 'DASHGESTOR', 'Gestor Dash', 'SP', true, NULL, true),
            ('DASHSUB', 'DASHSUB', 'Sub Dash', 'SP', false, 'Gestor Dash', true)
            ON CONFLICT ("ID") DO UPDATE SET "GESTOR IMEDIATO" = EXCLUDED."GESTOR IMEDIATO", status = true
        `);
        await sinergia_pool.query(`
            INSERT INTO login (id, estado)
            VALUES ('DASHGESTOR', 'SP'), ('DASHSUB', 'SP')
            ON CONFLICT (id) DO NOTHING
        `);
    });

    afterAll(async () => {
        await sinergia_pool.query(`DELETE FROM colaboradores WHERE "ID" IN ('DASHGESTOR', 'DASHSUB')`);
    });

    test('GET /manager/dashboard/stats retorna estatisticas corretamente (gestor_id explicito)', async () => {
        const res = await request(app)
            .get('/manager/dashboard/stats?mes=08&ano=2026&gestor_id=DASHGESTOR')
            .set('Authorization', `Bearer ${tokenAdmin}`);
        
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('total_subordinates');
        expect(res.body).toHaveProperty('completed_subordinates');
        expect(res.body.total_subordinates).toBe(1);
    });

    test('GET /manager/dashboard/pending retorna array de pendentes', async () => {
        const res = await request(app)
            .get('/manager/dashboard/pending?mes=08&ano=2026&gestor_id=DASHGESTOR')
            .set('Authorization', `Bearer ${tokenAdmin}`);
        
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        const sub = res.body.find(s => s.id === 'DASHSUB');
        expect(sub).toBeDefined();
    });

    test('GET /manager/dashboard/history retorna historico vazio (se nao houver submissao)', async () => {
        const res = await request(app)
            .get('/manager/dashboard/history?gestor_id=DASHGESTOR')
            .set('Authorization', `Bearer ${tokenAdmin}`);
        
        expect(res.status).toBe(200);
        expect(res.body.data).toBeDefined();
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.total).toBe(0);
    });

    test('GET sem mes e ano retorna 400 (stats)', async () => {
        const res = await request(app)
            .get('/manager/dashboard/stats?gestor_id=DASHGESTOR')
            .set('Authorization', `Bearer ${tokenAdmin}`);
        
        expect(res.status).toBe(400);
    });
});
