const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { createUser } = require('../src/functions/database/users');
const { cenos_pool } = require('../src/db');

const JWT_SECRET = process.env.JWT_SECRET || 'jwt_secret_change_me';

describe('Tracking Proximity Alerts (admin consulta alertas recebidos por agente)', () => {
    let adminToken;
    let adminId;
    let alertIds = [];
    let createdAgents = [];

    const AGENT = 'TALRT01';
    const OTHER_AGENT = 'TALRT02';

    const pad = n => String(n).padStart(2, '0');
    const todayStr = () => {
        const d = new Date();
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };

    const insertAlert = async ({ id, agentId, recordedAt, motivo = 'Anotação: 123', distance = 45 }) => {
        await cenos_pool.query(
            `INSERT INTO agent_proximity_alerts (id, agent_id, latitude, longitude, motivo, distance, action_taken, recorded_at)
             VALUES ($1, $2, -5.0892, -42.8016, $3, $4, 'foreground', $5)
             ON CONFLICT (id) DO NOTHING`,
            [id, agentId, motivo, distance, recordedAt]
        );
        alertIds.push(id);
    };

    beforeAll(async () => {
        const email = `test_track_alert_${Date.now()}@example.com`;
        const user = await createUser({
            email,
            senha: 'password123',
            nome: 'Test Track Alert',
            role: 'COMPANY_ADMIN',
            estado: 'pi'
        });
        adminId = user.id;
        adminToken = jwt.sign({ id: adminId, estado: 'pi' }, JWT_SECRET);

        for (const agentId of [AGENT, OTHER_AGENT]) {
            await cenos_pool.query(
                "INSERT INTO login (id, estado) VALUES ($1, 'pi') ON CONFLICT (id) DO NOTHING",
                [agentId]
            );
            createdAgents.push(agentId);
        }

        await insertAlert({ id: 'prox_target_in', agentId: AGENT, recordedAt: new Date() });
        await insertAlert({ id: 'prox_target_out', agentId: AGENT, recordedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) });
        await insertAlert({ id: 'prox_other_in', agentId: OTHER_AGENT, recordedAt: new Date() });
    }, 30000);

    afterAll(async () => {
        if (alertIds.length > 0) {
            await cenos_pool.query('DELETE FROM agent_proximity_alerts WHERE id = ANY($1)', [alertIds]);
        }
        for (const agentId of createdAgents) {
            await cenos_pool.query('DELETE FROM login WHERE id = $1', [agentId]).catch(() => {});
        }
        if (adminId) {
            await cenos_pool.query('DELETE FROM users WHERE id = $1', [adminId]);
        }
    }, 15000);

    test('sem token retorna 401', async () => {
        const res = await request(app).get(`/admin/tracking/agent/${AGENT}/alerts`);
        expect(res.status).toBe(401);
    });

    test('retorna apenas os alertas do agente na janela do dia', async () => {
        const day = todayStr();
        const res = await request(app)
            .get(`/admin/tracking/agent/${AGENT}/alerts`)
            .query({ from: `${day}T00:00:00`, to: `${day}T23:59:59` })
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        const ids = res.body.map(a => a.id);
        expect(ids).toContain('prox_target_in');
        expect(ids).not.toContain('prox_target_out');
        expect(ids).not.toContain('prox_other_in');

        const target = res.body.find(a => a.id === 'prox_target_in');
        expect(target).toBeDefined();
        expect(target.agent_id).toBe(AGENT);
        expect(target.agent_nome).toBe(AGENT);
        expect(target.motivo).toBe('Anotação: 123');
        expect(Number(target.distance)).toBe(45);
        expect(target.action_taken).toBe('foreground');
        expect(target.recorded_at).toBeDefined();
    });

    test('janela maior inclui alertas fora do dia, mas não de outro agente', async () => {
        const res = await request(app)
            .get(`/admin/tracking/agent/${AGENT}/alerts`)
            .query({
                from: '2000-01-01T00:00:00',
                to: '2100-01-01T00:00:00',
            })
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        const ids = res.body.map(a => a.id);
        expect(ids).toContain('prox_target_in');
        expect(ids).toContain('prox_target_out');
        expect(ids).not.toContain('prox_other_in');
    });

    test('agente sem alertas retorna array vazio', async () => {
        const day = todayStr();
        const res = await request(app)
            .get(`/admin/tracking/agent/TALRT_NAO_EXISTE/alerts`)
            .query({ from: `${day}T00:00:00`, to: `${day}T23:59:59` })
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });
});
