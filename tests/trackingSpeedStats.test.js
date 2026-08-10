const request = require('supertest');
const app = require('../src/app');
const jwt = require('jsonwebtoken');
const { createUser } = require('../src/functions/database/users');
const { cenos_pool } = require('../src/db');

const JWT_SECRET = process.env.JWT_SECRET || 'jwt_secret_change_me';
const AGENT_A = 'SPDSTAT01';
const AGENT_B = 'SPDSTAT02';
const MONTH = '2026-02';
const DATE1 = '2026-02-10';
const DATE2 = '2026-02-11';

describe('Speed Violation Monthly Stats', () => {
    let adminToken;
    let adminId;

    beforeAll(async () => {
        const email = `test_admin_spdstats_${Date.now()}@example.com`;
        const user = await createUser({
            email,
            senha: 'password123',
            nome: 'Test Admin SPD Stats',
            role: 'COMPANY_ADMIN',
            estado: 'pi'
        });
        adminId = user.id;
        adminToken = jwt.sign({ id: adminId, estado: 'pi' }, JWT_SECRET);

        for (const a of [AGENT_A, AGENT_B]) {
            await cenos_pool.query(
                "INSERT INTO login (id, estado) VALUES ($1, 'pi') ON CONFLICT (id) DO NOTHING",
                [a]
            );
            await cenos_pool.query(
                `INSERT INTO colaboradores ("ID", "MAT", "Nome", "Cargo", "estado", "status", "regional")
                 VALUES ($1, $2, $3, 'AG.COMER LEITURISTA/MOTOCICLIS', 'pi', TRUE, $4)
                 ON CONFLICT ("ID") DO UPDATE SET "status" = TRUE, "regional" = $4`,
                [a, a, a === AGENT_A ? 'Agente Stats A' : 'Agente Stats B', a === AGENT_A ? 'TERESINA' : 'PIRIPIRI']
            );
        }

        // Agente A: 2 pontos em DATE1 + 3 pontos em DATE2 = 2 infrações, 5 pontos
        // Agente B: 1 ponto em DATE1 = 1 infração, 1 ponto
        // Total esperado: 3 infrações ([agente + dia]), 6 pontos brutos
        const ptsA1 = [
            [`${DATE1} 10:00:00`, -3.7319, -38.5267],
            [`${DATE1} 10:05:00`, -3.7320, -38.5268],
        ];
        const ptsA2 = [
            [`${DATE2} 10:00:00`, -3.7321, -38.5269],
            [`${DATE2} 10:05:00`, -3.7322, -38.5270],
            [`${DATE2} 10:10:00`, -3.7323, -38.5271],
        ];
        const ptsB1 = [[`${DATE1} 09:00:00`, -5.0892, -42.8017]];

        // Ponto "impossível" (150 km/h) que NÃO deve ser trazido em nenhuma consulta
        const ptsHigh = [[`${DATE2} 10:15:00`, -3.7324, -38.5272]];

        for (const [recordedAt, lat, lng] of [...ptsA1, ...ptsA2]) {
            await cenos_pool.query(
                `INSERT INTO tracking_session_points
                    (agent_id, latitude, longitude, speed, speed_limit_applied, is_speed_violation, recorded_at)
                 VALUES ($1, $2, $3, 95.0, 81.0, TRUE, $4)`,
                [AGENT_A, lat, lng, recordedAt]
            );
        }
        for (const [recordedAt, lat, lng] of ptsB1) {
            await cenos_pool.query(
                `INSERT INTO tracking_session_points
                    (agent_id, latitude, longitude, speed, speed_limit_applied, is_speed_violation, recorded_at)
                 VALUES ($1, $2, $3, 88.0, 81.0, TRUE, $4)`,
                [AGENT_B, lat, lng, recordedAt]
            );
        }
        for (const [recordedAt, lat, lng] of ptsHigh) {
            await cenos_pool.query(
                `INSERT INTO tracking_session_points
                    (agent_id, latitude, longitude, speed, speed_limit_applied, is_speed_violation, recorded_at)
                 VALUES ($1, $2, $3, 150.0, 81.0, TRUE, $4)`,
                [AGENT_A, lat, lng, recordedAt]
            );
        }

        // Resolve [AGENT_A, DATE1] -> 1 resolvida, 2 pendentes
        const { rows } = await cenos_pool.query(
            `SELECT id FROM tracking_session_points WHERE agent_id = $1 AND recorded_at::date = $2`,
            [AGENT_A, DATE1]
        );
        await request(app)
            .post('/admin/tracking/speed_violations/resolve')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                agent_id: AGENT_A,
                date: DATE1,
                is_valid: true,
                description: 'Orientação realizada.',
                photo_url: 'https://minio.test/evidencia.jpg',
                violation_ids: rows.map(r => r.id)
            });
    });

    afterAll(async () => {
        for (const a of [AGENT_A, AGENT_B]) {
            await cenos_pool.query('DELETE FROM speed_violation_resolutions WHERE agent_id = $1', [a]).catch(() => {});
            await cenos_pool.query('DELETE FROM tracking_session_points WHERE agent_id = $1', [a]).catch(() => {});
            await cenos_pool.query('DELETE FROM colaboradores WHERE "ID" = $1', [a]).catch(() => {});
            await cenos_pool.query('DELETE FROM login WHERE id = $1', [a]).catch(() => {});
        }
        if (adminId) {
            await cenos_pool.query('DELETE FROM users WHERE id = $1', [adminId]).catch(() => {});
        }
    });

    test('GET stats retorna resumo contando 1 infração = 1 [agente + dia]', async () => {
        const res = await request(app)
            .get('/admin/tracking/speed_violations/stats')
            .query({ month: MONTH })
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.month).toBe(MONTH);
        expect(res.body.summary.total).toBe(3);
        expect(res.body.summary.resolved).toBe(1);
        expect(res.body.summary.pending).toBe(2);
        expect(res.body.summary.resolutionRate).toBeCloseTo(33.3, 1);
    });

    test('GET stats agrupa por dia, regional e top agentes', async () => {
        const res = await request(app)
            .get('/admin/tracking/speed_violations/stats')
            .query({ month: MONTH })
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);

        expect(res.body.daysTracked).toBe(2);
        expect(res.body.perDay).toHaveLength(2);
        const d1 = res.body.perDay.find(d => d.day === DATE1);
        expect(d1).toBeTruthy();
        expect(d1.total).toBe(2); // AGENT_A + AGENT_B
        expect(d1.resolved).toBe(1);

        const regional = res.body.perRegional.find(r => r.name === 'TERESINA');
        expect(regional).toBeTruthy();
        expect(regional.total).toBe(2);
        expect(regional.resolved).toBe(1);

        expect(res.body.topAgents).toHaveLength(2);
        const agentA = res.body.topAgents.find(a => a.agent_id === AGENT_A);
        expect(agentA.points).toBe(5); // pontos brutos, não infrações
        expect(agentA.total).toBe(2);
        expect(agentA.resolved).toBe(1);
    });

    test('GET stats exclui pontos acima de 120 km/h', async () => {
        const res = await request(app)
            .get('/admin/tracking/speed_violations/stats')
            .query({ month: MONTH })
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        // O ponto de 150 km/h de AGENT_A não pode contar como infração nem como ponto
        expect(res.body.summary.total).toBe(3);
        const agentA = res.body.topAgents.find(a => a.agent_id === AGENT_A);
        expect(agentA.points).toBe(5);
    });

    test('GET all exclui pontos acima de 120 km/h', async () => {
        const res = await request(app)
            .get('/admin/tracking/speed_violations/all')
            .query({ from: `${DATE1} 00:00:00`, to: `${DATE2} 23:59:59` })
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.some(v => Number(v.speed) > 120)).toBe(false);
        expect(res.body.some(v => v.agent_id === AGENT_A && Number(v.speed) === 150)).toBe(false);
    });

    test('GET stats sem dados no mês retorna zeros', async () => {
        const res = await request(app)
            .get('/admin/tracking/speed_violations/stats')
            .query({ month: '2025-11' })
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.summary.total).toBe(0);
        expect(res.body.summary.resolved).toBe(0);
        expect(res.body.perDay).toHaveLength(0);
        expect(res.body.topAgents).toHaveLength(0);
    });

    test('GET stats sem month ou com formato inválido retorna 400', async () => {
        const noMonth = await request(app)
            .get('/admin/tracking/speed_violations/stats')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(noMonth.status).toBe(400);

        const badFormat = await request(app)
            .get('/admin/tracking/speed_violations/stats')
            .query({ month: '2026-2' })
            .set('Authorization', `Bearer ${adminToken}`);
        expect(badFormat.status).toBe(400);
    });
});
