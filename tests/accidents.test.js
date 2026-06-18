const request = require('supertest');
const app = require('../src/app');
const jwt = require('jsonwebtoken');
const { createUser } = require('../src/functions/database/users');
const { cenos_pool } = require('../src/db');

const JWT_SECRET = process.env.JWT_SECRET || 'jwt_secret_change_me';
const AGENT_ID = 'TACCID01';
const AGENT_TOKEN = `acc_test_token_${Date.now()}`;

describe('Accidents', () => {
    let adminToken;
    let adminId;

    beforeAll(async () => {
        const email = `test_admin_acc_${Date.now()}@example.com`;
        const user = await createUser({
            email,
            senha: 'password123',
            nome: 'Test Admin Acc',
            role: 'COMPANY_ADMIN',
            estado: 'pi'
        });
        adminId = user.id;
        adminToken = jwt.sign({ id: adminId, estado: 'pi' }, JWT_SECRET);

        await cenos_pool.query(
            "INSERT INTO login (id, estado) VALUES ($1, 'pi') ON CONFLICT (id) DO NOTHING",
            [AGENT_ID]
        );

        await cenos_pool.query(
            `INSERT INTO telegram_tokens (token, telegram_user_id, agent_id, expires_at)
             VALUES ($1, 999999, $2, NOW() + INTERVAL '1 day') ON CONFLICT (token) DO NOTHING`,
            [AGENT_TOKEN, AGENT_ID]
        );
    });

    afterAll(async () => {
        await cenos_pool.query('DELETE FROM accident_evidencias WHERE accident_id IN (SELECT id FROM accidents WHERE autor = $1)', [AGENT_ID]);
        await cenos_pool.query('DELETE FROM accidents WHERE autor = $1', [AGENT_ID]);
        await cenos_pool.query('DELETE FROM telegram_tokens WHERE token = $1', [AGENT_TOKEN]);
        await cenos_pool.query('DELETE FROM login WHERE id = $1', [AGENT_ID]);
        if (adminId) {
            await cenos_pool.query('DELETE FROM users WHERE id = $1', [adminId]);
        }
    });

    describe('POST /agent/accident', () => {
        test('deve criar acidente com dados válidos', async () => {
            const res = await request(app)
                .post('/agent/accident')
                .set('X-Telegram-Init-Data', AGENT_TOKEN)
                .send({ tipo: 'Teste de acidente' });

            expect(res.status).toBe(201);
            expect(res.body).toHaveProperty('id');
            expect(res.body.tipo).toBe('Teste de acidente');
            expect(res.body.autor).toBe(AGENT_ID);
        });

        test('deve rejeitar sem tipo', async () => {
            const res = await request(app)
                .post('/agent/accident')
                .set('X-Telegram-Init-Data', AGENT_TOKEN)
                .send({});

            expect(res.status).toBe(400);
        });
    });

    describe('GET /agent/accident', () => {
        test('deve listar acidentes do agente', async () => {
            const res = await request(app)
                .get('/agent/accident')
                .set('X-Telegram-Init-Data', AGENT_TOKEN);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        });
    });

    describe('Admin endpoints', () => {
        let accidentId;

        beforeAll(async () => {
            const { rows } = await cenos_pool.query(
                `INSERT INTO accidents (autor, tipo, estado) VALUES ($1, 'Acidente admin test', 'pi') RETURNING id`,
                [AGENT_ID]
            );
            accidentId = rows[0].id;
        });

        test('GET /admin/tracking/accidents deve listar acidentes', async () => {
            const res = await request(app)
                .get('/admin/tracking/accidents')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('accidents');
            expect(res.body).toHaveProperty('total');
        });

        test('POST /admin/tracking/accidents/:id/resolve deve marcar como tratado', async () => {
            const res = await request(app)
                .post(`/admin/tracking/accidents/${accidentId}/resolve`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    descricao_solucao: 'Resolvido em teste',
                    evidencias: [{ nome_arquivo: 'foto.jpg', tipo: 'imagem', caminho: 'https://minio/test.jpg' }]
                });

            expect(res.status).toBe(200);
            expect(res.body.resolvido).toBe(true);
            expect(res.body.descricao_solucao).toBe('Resolvido em teste');
        });

        test('POST /admin/tracking/accidents/:id/reopen deve reabrir', async () => {
            const res = await request(app)
                .post(`/admin/tracking/accidents/${accidentId}/reopen`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.resolvido).toBe(false);
        });

        afterAll(async () => {
            await cenos_pool.query('DELETE FROM accident_evidencias WHERE accident_id = $1', [accidentId]);
            await cenos_pool.query('DELETE FROM accidents WHERE id = $1', [accidentId]);
        });
    });
});
