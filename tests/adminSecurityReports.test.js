const request = require('supertest');
const app = require('../src/app');
const jwt = require('jsonwebtoken');
const { createUser } = require('../src/functions/database/users');
const { cenos_pool } = require('../src/db');

const JWT_SECRET = process.env.JWT_SECRET || 'jwt_secret_change_me';

describe('Admin Security Reports', () => {
    let token;
    let userId;
    let reportId;

    beforeAll(async () => {
        // Create a test user with COMPANY_ADMIN role
        const email = `test_admin_sr_${Date.now()}@example.com`;
        const user = await createUser({
            email,
            senha: 'password123',
            nome: 'Test Admin SR',
            role: 'COMPANY_ADMIN',
            estado: 'pi'
        });
        userId = user.id;
        token = jwt.sign({ id: userId, estado: 'pi' }, JWT_SECRET);

        // Insert agent to satisfy foreign key constraints
        await cenos_pool.query("INSERT INTO login (id, estado) VALUES ('T12345', 'pi') ON CONFLICT (id) DO NOTHING");
    });

    afterAll(async () => {
        if (userId) {
            await cenos_pool.query('DELETE FROM users WHERE id = $1', [userId]);
        }
        if (reportId) {
            await cenos_pool.query('DELETE FROM security_report WHERE id = $1', [reportId]);
        }
        await cenos_pool.query("DELETE FROM login WHERE id = 'T12345'");
    });

    test('POST /admin/security_reports - deve criar um relatório (Admin)', async () => {
        const res = await request(app)
            .post('/admin/security_reports')
            .set('Authorization', `Bearer ${token}`)
            .send({
                autor: 'T12345',
                motivo: 'Teste Admin',
                observacao: 'Observação teste admin',
                estado: 'pi'
            });

        if (res.status !== 201) console.log('POST Error:', res.body);
        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('id');
        expect(res.body.motivo).toBe('Teste Admin');
        expect(res.body.estado).toBe('pi');
        reportId = res.body.id;
    });

    test('GET /admin/security_reports - deve listar relatórios', async () => {
        const res = await request(app)
            .get('/admin/security_reports')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('data');
        expect(res.body.total).toBeGreaterThanOrEqual(1);
    });

    test('GET /admin/security_reports - deve filtrar por estado', async () => {
        const res = await request(app)
            .get('/admin/security_reports?estado=pi')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.data.every(r => r.estado === 'pi')).toBe(true);
    });

    test('DELETE /admin/security_reports/:id - deve deletar um relatório', async () => {
        const res = await request(app)
            .delete(`/admin/security_reports/${reportId}`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        reportId = null;
    });
});
