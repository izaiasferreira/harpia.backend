const request = require('supertest');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { createUser } = require('../src/functions/database/users');
const { cenos_pool } = require('../src/db');

const JWT_SECRET = process.env.JWT_SECRET || 'jwt_secret_change_me';

describe('Service Annotation Archive (admin arquiva, agente não vê)', () => {
    let adminToken;
    let userId;
    let adminName;
    const AGENT_ID = 'TARCHV01';
    const TELEGRAM_ID = String(Math.floor(Math.random() * 1e9));
    let AUTH_TOKEN = '';
    let createdIds = [];
    let archivedId = null;

    const createAnnotationAsAdmin = async (descricao) => {
        const res = await request(app)
            .post('/admin/service_annotations')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                tipo: 'Anotação',
                descricao,
                estado: 'pi',
                regional: 'NORTE',
                seccional: 'A',
                latitude: '-5.0892',
                longitude: '-42.8016',
            });
        return res;
    };

    beforeAll(async () => {
        const email = `test_annot_arch_${Date.now()}@example.com`;
        const user = await createUser({
            email,
            senha: 'password123',
            nome: 'Test Annot Archive',
            role: 'COMPANY_ADMIN',
            estado: 'pi'
        });
        userId = user.id;
        adminName = user.nome;
        adminToken = jwt.sign({ id: userId, estado: 'pi' }, JWT_SECRET);

        await cenos_pool.query(
            "INSERT INTO login (id, estado, telegram_id) VALUES ($1, 'pi', $2) ON CONFLICT (id) DO UPDATE SET telegram_id = $2, estado = 'pi'",
            [AGENT_ID, TELEGRAM_ID]
        );
        AUTH_TOKEN = crypto.randomBytes(32).toString('hex');
        await cenos_pool.query(
            `INSERT INTO telegram_tokens (token, telegram_user_id, expires_at)
             VALUES ($1, $2, NOW() + INTERVAL '1 day')`,
            [AUTH_TOKEN, TELEGRAM_ID]
        );
    }, 30000);

    afterAll(async () => {
        if (createdIds.length > 0) {
            await cenos_pool.query('DELETE FROM service_annotations WHERE id = ANY($1)', [createdIds]);
        }
        await cenos_pool.query('DELETE FROM telegram_tokens WHERE token = $1', [AUTH_TOKEN]).catch(() => {});
        await cenos_pool.query('DELETE FROM login WHERE id = $1', [AGENT_ID]).catch(() => {});
        await cenos_pool.query('DELETE FROM login WHERE id = $1', [adminName]).catch(() => {});
        if (userId) {
            await cenos_pool.query('DELETE FROM users WHERE id = $1', [userId]);
        }
    }, 15000);

    test('arquivar sem token retorna 401', async () => {
        const res = await request(app).post('/admin/service_annotations/1/archive');
        expect(res.status).toBe(401);
    });

    test('arquivar id inexistente retorna 404', async () => {
        const res = await request(app)
            .post('/admin/service_annotations/999999/archive')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(404);
    });

    test('admin cria anotação visível para o agente', async () => {
        const res = await createAnnotationAsAdmin('anotacao_para_arquivar');
        expect(res.status).toBe(200);
        expect(res.body.arquivada).toBe(false);
        createdIds.push(res.body.id);

        const report = await request(app)
            .get('/agent/security_report')
            .set('X-Telegram-Init-Data', AUTH_TOKEN);
        expect(report.status).toBe(200);
        const observacoes = (report.body.points || [])
            .filter(p => p.tipo_ponto === 'anotacao')
            .map(p => p.observacao);
        expect(observacoes).toContain('anotacao_para_arquivar');
    });

    test('admin arquiva anotação (POST /:id/archive)', async () => {
        const created = createdIds[0];
        const res = await request(app)
            .post(`/admin/service_annotations/${created}/archive`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.arquivada).toBe(true);
        archivedId = created;
    });

    test('agente não vê anotação arquivada no GET /agent/security_report', async () => {
        const res = await request(app)
            .get('/agent/security_report')
            .set('X-Telegram-Init-Data', AUTH_TOKEN);

        expect(res.status).toBe(200);
        const observacoes = (res.body.points || [])
            .filter(p => p.tipo_ponto === 'anotacao')
            .map(p => p.observacao);
        expect(observacoes).not.toContain('anotacao_para_arquivar');
    });

    test('admin vê anotação arquivada na listagem', async () => {
        const res = await request(app)
            .get('/admin/service_annotations')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        const found = (res.body.annotations || []).find(a => a.id === archivedId);
        expect(found).toBeDefined();
        expect(found.arquivada).toBe(true);
    });

    test('admin desarquiva anotação (POST /:id/unarchive)', async () => {
        const res = await request(app)
            .post(`/admin/service_annotations/${archivedId}/unarchive`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.arquivada).toBe(false);
    });

    test('agente volta a ver anotação desarquivada', async () => {
        const res = await request(app)
            .get('/agent/security_report')
            .set('X-Telegram-Init-Data', AUTH_TOKEN);

        expect(res.status).toBe(200);
        const observacoes = (res.body.points || [])
            .filter(p => p.tipo_ponto === 'anotacao')
            .map(p => p.observacao);
        expect(observacoes).toContain('anotacao_para_arquivar');
    });
});
