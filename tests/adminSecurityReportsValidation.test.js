const request = require('supertest');
const app = require('../src/app');
const jwt = require('jsonwebtoken');
const { createUser } = require('../src/functions/database/users');
const { sinergia_pool } = require('../src/db');

const JWT_SECRET = process.env.JWT_SECRET || 'jwt_secret_change_me';

describe('Admin Security Reports Validation (Resolver)', () => {
    let token;
    let userId;
    let reportId;
    let resolveToken;
    let resolveUserId;

    beforeAll(async () => {
        const email = `test_admin_sr_val_${Date.now()}@example.com`;
        const user = await createUser({
            email,
            senha: 'password123',
            nome: 'Test Admin SR Val',
            role: 'COMPANY_ADMIN',
            estado: 'pi',
            modules: ['security_reports', 'resolve_security_report']
        });
        userId = user.id;
        token = jwt.sign({ id: userId, estado: 'pi', role: 'COMPANY_ADMIN' }, JWT_SECRET);

        await sinergia_pool.query("INSERT INTO login (id, estado) VALUES ('T99999', 'pi') ON CONFLICT (id) DO NOTHING");

        const insert = await sinergia_pool.query(`
            INSERT INTO security_report (autor, motivo, observacao, latitude, longitude, estado)
            VALUES ('T99999', 'Teste Validação', 'Observação teste', '-5.089', '-42.801', 'pi')
            RETURNING id
        `);
        reportId = insert.rows[0].id;
    });

    afterAll(async () => {
        if (reportId) {
            await sinergia_pool.query('DELETE FROM security_report WHERE id = $1', [reportId]);
        }
        if (userId) {
            await sinergia_pool.query('DELETE FROM users WHERE id = $1', [userId]);
        }
        await sinergia_pool.query("DELETE FROM login WHERE id = 'T99999'");
    });

    test('GET /admin/security_reports/dashboard - deve retornar estatísticas', async () => {
        const res = await request(app)
            .get('/admin/security_reports/dashboard')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('total');
        expect(res.body).toHaveProperty('resolvidos');
        expect(res.body).toHaveProperty('pendentes');
        expect(res.body).toHaveProperty('taxaResolucao');
        expect(res.body).toHaveProperty('porTipo');
        expect(res.body).toHaveProperty('porAgente');
        expect(res.body).toHaveProperty('tendenciaMensal');
    });

    test('POST /admin/security_reports/:id/resolver - deve rejeitar sem descricao_solucao', async () => {
        const res = await request(app)
            .post(`/admin/security_reports/${reportId}/resolver`)
            .set('Authorization', `Bearer ${token}`)
            .send({});

        expect(res.status).toBe(400);
    });

    test('POST /admin/security_reports/:id/resolver - deve rejeitar sem evidencias', async () => {
        const res = await request(app)
            .post(`/admin/security_reports/${reportId}/resolver`)
            .set('Authorization', `Bearer ${token}`)
            .send({ descricao_solucao: 'Teste de solução' });

        expect(res.status).toBe(400);
    });

    test('POST /admin/security_reports/:id/resolver - deve resolver com sucesso', async () => {
        const res = await request(app)
            .post(`/admin/security_reports/${reportId}/resolver`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                descricao_solucao: 'Risco mitigado com sucesso.',
                evidencias: [{
                    nome_arquivo: 'foto.jpg',
                    tipo: 'imagem',
                    caminho: 'https://api.example.com/files/evidencia.jpg'
                }]
            });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.report.resolvido).toBe(true);
        expect(res.body.report.descricao_solucao).toBe('Risco mitigado com sucesso.');
        expect(res.body.report.resolvido_por).toBeDefined();
        expect(res.body.report.resolvido_por_nome).toBeDefined();
        expect(res.body.report.resolvido_em).toBeDefined();
        expect(res.body.evidencias.length).toBe(1);
    });

    test('POST /admin/security_reports/:id/reabrir - deve reabrir relatório', async () => {
        const res = await request(app)
            .post(`/admin/security_reports/${reportId}/reabrir`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.report.resolvido).toBe(false);
        expect(res.body.report.resolvido_por).toBeNull();
    });

    test('GET /admin/security_reports/:id/evidencias - deve listar evidências', async () => {
        const res = await request(app)
            .get(`/admin/security_reports/${reportId}/evidencias`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });
});
