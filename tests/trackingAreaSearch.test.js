const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { createUser } = require('../src/functions/database/users');
const { getAgentsTrailInArea } = require('../src/functions/database/trackingAreaSearch');
const { cenos_pool } = require('../src/db');

const JWT_SECRET = process.env.JWT_SECRET || 'jwt_secret_change_me';

// Polígono (box) ao redor do ponto central dos agentes de teste
const POLYGON = [
    { lat: -5.09, lng: -42.81 },
    { lat: -5.09, lng: -42.79 },
    { lat: -5.08, lng: -42.79 },
    { lat: -5.08, lng: -42.81 },
];

describe('Tracking Area Search (admin busca agentes por polígono no histórico)', () => {
    let adminToken;
    let userIds = [];
    let createdAgents = [];

    const AGENT_IN = 'TAREA_IN';
    const AGENT_EST = 'TAREA_EST'; // apenas pontos estimados
    const AGENT_OUT = 'TAREA_OUT'; // fora do polígono
    const AGENT_MA = 'TAREA_MA';   // dentro do polígono, porém outro estado

    const pad = n => String(n).padStart(2, '0');
    const todayStr = () => {
        const d = new Date();
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    const dayFrom = `${todayStr()}T00:00:00`;
    const dayTo = `${todayStr()}T23:59:59`;

    const insertAgent = async ({ id, estado, nome }) => {
        await cenos_pool.query(
            "INSERT INTO login (id, estado) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
            [id, estado]
        );
        await cenos_pool.query(
            `INSERT INTO colaboradores ("ID", "MAT", "Nome", "Cargo", "estado", "status")
             VALUES ($1, $2, $3, 'AG.COMER LEITURISTA/MOTOCICLIS', $4, TRUE)
             ON CONFLICT ("ID") DO UPDATE SET "estado" = $4, "status" = TRUE`,
            [id, id, nome, estado]
        );
        createdAgents.push(id);
    };

    const insertPoint = async ({ agentId, lat, lng, recordedAt, isEstimated = false }) => {
        await cenos_pool.query(
            `INSERT INTO tracking_session_points (agent_id, latitude, longitude, speed, accuracy, recorded_at, is_estimated)
             VALUES ($1, $2, $3, 12.5, 4, $4, $5)`,
            [agentId, lat, lng, recordedAt, isEstimated]
        );
    };

    beforeAll(async () => {
        const admin = await createUser({
            email: `test_area_admin_${Date.now()}@example.com`,
            senha: 'password123',
            nome: 'Test Area Admin',
            role: 'COMPANY_ADMIN',
            estado: 'pi'
        });
        userIds.push(admin.id);
        adminToken = jwt.sign({ id: admin.id, estado: 'pi' }, JWT_SECRET);

        await insertAgent({ id: AGENT_IN, estado: 'pi', nome: 'Agente Dentro' });
        await insertAgent({ id: AGENT_EST, estado: 'pi', nome: 'Agente Estimado' });
        await insertAgent({ id: AGENT_OUT, estado: 'pi', nome: 'Agente Fora' });
        await insertAgent({ id: AGENT_MA, estado: 'ma', nome: 'Agente Maranhao' });

        await insertPoint({ agentId: AGENT_IN, lat: -5.0892, lng: -42.8016, recordedAt: new Date() });
        await insertPoint({ agentId: AGENT_IN, lat: -5.0892, lng: -42.8016, recordedAt: new Date(Date.now() - 24 * 60 * 60 * 1000) });
        await insertPoint({ agentId: AGENT_EST, lat: -5.0890, lng: -42.8010, recordedAt: new Date(), isEstimated: true });
        await insertPoint({ agentId: AGENT_OUT, lat: -5.09, lng: -42.9, recordedAt: new Date() });
        await insertPoint({ agentId: AGENT_MA, lat: -5.0891, lng: -42.8015, recordedAt: new Date() });

        await cenos_pool.query(
            `INSERT INTO agent_proximity_alerts (id, agent_id, latitude, longitude, motivo, distance, action_taken, recorded_at)
             VALUES ($1, $2, -5.0892, -42.8016, 'Anotação: 456', 30, 'foreground', $3)
             ON CONFLICT (id) DO NOTHING`,
            ['tarea_alert_in', AGENT_IN, new Date()]
        );
    }, 30000);

    afterAll(async () => {
        if (createdAgents.length > 0) {
            await cenos_pool.query(
                'DELETE FROM tracking_session_points WHERE agent_id = ANY($1)',
                [createdAgents]
            ).catch(() => {});
            await cenos_pool.query(
                'DELETE FROM agent_proximity_alerts WHERE agent_id = ANY($1)',
                [createdAgents]
            ).catch(() => {});
            await cenos_pool.query(
                'DELETE FROM colaboradores WHERE "ID" = ANY($1)',
                [createdAgents]
            ).catch(() => {});
            await cenos_pool.query(
                'DELETE FROM login WHERE id = ANY($1)',
                [createdAgents]
            ).catch(() => {});
        }
        if (userIds.length > 0) {
            await cenos_pool.query('DELETE FROM users WHERE id = ANY($1)', [userIds]).catch(() => {});
        }
    }, 15000);

    const callAreaTrail = (token) => request(app)
        .post('/admin/tracking/area/trail')
        .send({ polygon: POLYGON, date: todayStr() })
        .set('Authorization', `Bearer ${token}`);

    test('sem token retorna 401', async () => {
        const res = await request(app)
            .post('/admin/tracking/area/trail')
            .send({ polygon: POLYGON, date: todayStr() });
        expect(res.status).toBe(401);
    });

    test('polígono com menos de 3 pontos retorna 400', async () => {
        const res = await request(app)
            .post('/admin/tracking/area/trail')
            .send({ polygon: [{ lat: -5.09, lng: -42.81 }, { lat: -5.08, lng: -42.79 }], date: todayStr() })
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(400);
    });

    test('data inválida retorna 400', async () => {
        const res = await request(app)
            .post('/admin/tracking/area/trail')
            .send({ polygon: POLYGON, date: '11/08/2026' })
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(400);
    });

    test('admin recebe o agente que passou pela área com trail completo e alertas', async () => {
        const res = await callAreaTrail(adminToken);

        expect(res.status).toBe(200);
        expect(res.body.total_agents).toBeGreaterThanOrEqual(1);
        expect(res.body.truncated).toBe(false);

        const ids = res.body.agents.map(a => a.agent_id);
        expect(ids).toContain(AGENT_IN);

        const agent = res.body.agents.find(a => a.agent_id === AGENT_IN);
        expect(agent).toBeDefined();
        expect(agent.agent_nome).toBe('Agente Dentro');
        expect(Array.isArray(agent.points)).toBe(true);
        expect(agent.points.length).toBe(1); // apenas o ponto de hoje (o de ontem fica fora da janela)
        expect(Array.isArray(agent.stops)).toBe(true);
        expect(agent.alerts.some(a => a.id === 'tarea_alert_in')).toBe(true);
    });

    test('pontos estimados não contam para a passagem pela área', async () => {
        const res = await callAreaTrail(adminToken);
        const ids = res.body.agents.map(a => a.agent_id);
        expect(ids).not.toContain(AGENT_EST);
    });

    test('agente fora do polígono não é retornado', async () => {
        const res = await callAreaTrail(adminToken);
        const ids = res.body.agents.map(a => a.agent_id);
        expect(ids).not.toContain(AGENT_OUT);
    });

    test('admin vê agente de outro estado; usuário do PI não vê', async () => {
        const adminRes = await callAreaTrail(adminToken);
        expect(adminRes.body.agents.map(a => a.agent_id)).toContain(AGENT_MA);

        // Filtro de estado testado em nível de função (usuário sem permissões usa o estado como fallback)
        const operatorUser = { id: 'operator', estado: 'pi', role: 'USER', permissions: [] };
        const result = await getAgentsTrailInArea({
            polygon: POLYGON,
            dateFrom: dayFrom,
            dateTo: dayTo,
            user: operatorUser,
        });
        const opIds = result.agents.map(a => a.agent_id);
        expect(opIds).toContain(AGENT_IN);
        expect(opIds).not.toContain(AGENT_MA);
    });

    test('limite de 100 agentes retorna truncated', async () => {
        const pad3 = n => String(n).padStart(3, '0');
        const ids = [];
        for (let i = 0; i < 101; i++) {
            ids.push(`TAREA_TR_${pad3(i)}`);
        }
        const n = ids.length;
        try {
            // Inserts em lote para não estourar o tempo do teste
            const loginValues = ids.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(',');
            const loginParams = ids.flatMap(id => [id, 'pi']);
            await cenos_pool.query(`INSERT INTO login (id, estado) VALUES ${loginValues} ON CONFLICT (id) DO NOTHING`, loginParams);

            const colabValues = ids.map((_, i) =>
                `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`
            ).join(',');
            const colabParams = ids.flatMap(id => [id, id, `Trunc ${id}`, 'AG.COMER LEITURISTA/MOTOCICLIS', 'pi', true]);
            await cenos_pool.query(
                `INSERT INTO colaboradores ("ID", "MAT", "Nome", "Cargo", "estado", "status")
                 VALUES ${colabValues}
                 ON CONFLICT ("ID") DO NOTHING`,
                colabParams
            );

            const ptValues = ids.map((_, i) =>
                `($${i * 7 + 1}, $${i * 7 + 2}, $${i * 7 + 3}, $${i * 7 + 4}, $${i * 7 + 5}, $${i * 7 + 6}, $${i * 7 + 7})`
            ).join(',');
            const ptParams = ids.flatMap(id => [id, -6.005, -43.005, 12.5, 4, new Date(), false]);
            await cenos_pool.query(
                `INSERT INTO tracking_session_points (agent_id, latitude, longitude, speed, accuracy, recorded_at, is_estimated)
                 VALUES ${ptValues}`,
                ptParams
            );

            const polygon = [
                { lat: -6.01, lng: -43.01 },
                { lat: -6.01, lng: -43.0 },
                { lat: -6.0, lng: -43.0 },
                { lat: -6.0, lng: -43.01 },
            ];
            const res = await request(app)
                .post('/admin/tracking/area/trail')
                .send({ polygon, date: todayStr() })
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.agents.length).toBe(100);
            expect(res.body.total_agents).toBeGreaterThanOrEqual(101);
            expect(res.body.truncated).toBe(true);
        } finally {
            for (const id of ids) {
                await cenos_pool.query('DELETE FROM tracking_session_points WHERE agent_id = $1', [id]).catch(() => {});
                await cenos_pool.query('DELETE FROM colaboradores WHERE "ID" = $1', [id]).catch(() => {});
                await cenos_pool.query('DELETE FROM login WHERE id = $1', [id]).catch(() => {});
            }
        }
    }, 120000);
});
