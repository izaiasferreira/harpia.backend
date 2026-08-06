const request = require('supertest');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { createUser } = require('../src/functions/database/users');
const { sinergia_pool } = require('../src/db');

const JWT_SECRET = process.env.JWT_SECRET || 'jwt_secret_change_me';

describe('Service Annotation Expiry (admin expires_at + filtro no agente)', () => {
    let adminToken;
    let userId;
    let adminName;
    const AGENT_ID = 'TANOT01';
    const TELEGRAM_ID = String(Math.floor(Math.random() * 1e9));
    let AUTH_TOKEN = '';
    let createdIds = [];

    const createAnnotationAsAdmin = async (payload) => {
        const res = await request(app)
            .post('/admin/service_annotations')
            .set('Authorization', `Bearer ${adminToken}`)
            .send(payload);
        return res;
    };

    beforeAll(async () => {
        const email = `test_annot_expiry_${Date.now()}@example.com`;
        const user = await createUser({
            email,
            senha: 'password123',
            nome: 'Test Annot Expiry',
            role: 'COMPANY_ADMIN',
            estado: 'pi'
        });
        userId = user.id;
        adminName = user.nome;
        adminToken = jwt.sign({ id: userId, estado: 'pi' }, JWT_SECRET);

        await sinergia_pool.query(
            "INSERT INTO login (id, estado, telegram_id) VALUES ($1, 'pi', $2) ON CONFLICT (id) DO UPDATE SET telegram_id = $2, estado = 'pi'",
            [AGENT_ID, TELEGRAM_ID]
        );
        AUTH_TOKEN = crypto.randomBytes(32).toString('hex');
        await sinergia_pool.query(
            `INSERT INTO telegram_tokens (token, telegram_user_id, expires_at)
             VALUES ($1, $2, NOW() + INTERVAL '1 day')`,
            [AUTH_TOKEN, TELEGRAM_ID]
        );
    }, 30000);

    afterAll(async () => {
        if (createdIds.length > 0) {
            await sinergia_pool.query('DELETE FROM service_annotations WHERE id = ANY($1)', [createdIds]);
        }
        await sinergia_pool.query('DELETE FROM telegram_tokens WHERE token = $1', [AUTH_TOKEN]).catch(() => {});
        await sinergia_pool.query('DELETE FROM login WHERE id = $1', [AGENT_ID]).catch(() => {});
        await sinergia_pool.query('DELETE FROM login WHERE id = $1', [adminName]).catch(() => {});
        if (userId) {
            await sinergia_pool.query('DELETE FROM users WHERE id = $1', [userId]);
        }
    }, 15000);

    test('admin pode criar anotação com expires_at no futuro', async () => {
        const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
        const res = await createAnnotationAsAdmin({
            tipo: 'Anotação',
            descricao: 'anotacao_futura',
            estado: 'pi',
            regional: 'NORTE',
            seccional: 'A',
            latitude: '-5.0892',
            longitude: '-42.8016',
            expires_at: future,
        });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('id');
        expect(res.body.expires_at).not.toBeNull();
        createdIds.push(res.body.id);
    });

    test('admin pode criar anotação já expirada', async () => {
        const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const res = await createAnnotationAsAdmin({
            tipo: 'Coordenada',
            descricao: 'anotacao_expirada',
            estado: 'pi',
            regional: 'NORTE',
            seccional: 'A',
            latitude: '-5.09',
            longitude: '-42.8',
            expires_at: past,
        });

        expect(res.status).toBe(200);
        expect(res.body.expires_at).not.toBeNull();
        createdIds.push(res.body.id);
    });

    test('admin pode criar anotação sem expiração (ilimitada)', async () => {
        const res = await createAnnotationAsAdmin({
            tipo: 'Remanejamento',
            descricao: 'anotacao_sem_expiracao',
            estado: 'pi',
            regional: 'NORTE',
            seccional: 'A',
            latitude: '-5.091',
            longitude: '-42.802',
        });

        expect(res.status).toBe(200);
        expect(res.body.expires_at).toBeNull();
        createdIds.push(res.body.id);
    });

    test('agente não vê anotação expirada no GET /agent/security_report', async () => {
        const res = await request(app)
            .get('/agent/security_report')
            .set('X-Telegram-Init-Data', AUTH_TOKEN);

        expect(res.status).toBe(200);
        const annotationPoints = (res.body.points || []).filter(p => p.tipo_ponto === 'anotacao');
        const observacoes = annotationPoints.map(p => p.observacao);

        expect(observacoes).toContain('anotacao_futura');
        expect(observacoes).toContain('anotacao_sem_expiracao');
        expect(observacoes).not.toContain('anotacao_expirada');
    });
});
