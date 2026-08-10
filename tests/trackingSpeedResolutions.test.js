const request = require('supertest');
const app = require('../src/app');
const jwt = require('jsonwebtoken');
const { createUser } = require('../src/functions/database/users');
const { cenos_pool } = require('../src/db');

const JWT_SECRET = process.env.JWT_SECRET || 'jwt_secret_change_me';
const AGENT_ID = 'TSPD01';
const DATE = '2026-01-15';

describe('Speed Violation Resolutions', () => {
    let adminToken;
    let adminId;
    let pointIds = [];

    beforeAll(async () => {
        const email = `test_admin_spd_${Date.now()}@example.com`;
        const user = await createUser({
            email,
            senha: 'password123',
            nome: 'Test Admin SPD',
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
            `INSERT INTO colaboradores ("ID", "MAT", "Nome", "Cargo", "estado", "status")
             VALUES ($1, '11111', 'Agente Speed Test', 'AG.COMER LEITURISTA/MOTOCICLIS', 'pi', TRUE)
             ON CONFLICT ("ID") DO UPDATE SET "status" = TRUE`,
            [AGENT_ID]
        );

        const { rows } = await cenos_pool.query(
            `INSERT INTO tracking_session_points
                (agent_id, latitude, longitude, speed, speed_limit_applied, is_speed_violation, recorded_at)
             VALUES
                ($1, -3.7319, -38.5267, 100.0, 81.0, TRUE, $2),
                ($1, -3.7320, -38.5268, 95.0, 81.0, TRUE, $3)
             RETURNING id`,
            [AGENT_ID, `${DATE} 10:00:00`, `${DATE} 10:05:00`]
        );
        pointIds = rows.map(r => r.id);
    });

    afterAll(async () => {
        await cenos_pool.query('DELETE FROM speed_violation_resolutions WHERE agent_id = $1', [AGENT_ID]).catch(() => {});
        await cenos_pool.query('DELETE FROM tracking_session_points WHERE agent_id = $1', [AGENT_ID]).catch(() => {});
        await cenos_pool.query('DELETE FROM colaboradores WHERE "ID" = $1', [AGENT_ID]).catch(() => {});
        await cenos_pool.query('DELETE FROM login WHERE id = $1', [AGENT_ID]).catch(() => {});
        if (adminId) {
            await cenos_pool.query('DELETE FROM users WHERE id = $1', [adminId]).catch(() => {});
        }
    });

    test('POST /admin/tracking/speed_violations/resolve cria resolução com violation_ids', async () => {
        const res = await request(app)
            .post('/admin/tracking/speed_violations/resolve')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                agent_id: AGENT_ID,
                date: DATE,
                is_valid: true,
                description: 'Agente notificado e orientado.',
                photo_url: 'https://minio.test/evidencia.jpg',
                violation_ids: pointIds
            });

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('id');
        expect(res.body.agent_id).toBe(AGENT_ID);
        expect(res.body.is_valid).toBe(true);
        expect(res.body.violation_ids).toEqual(expect.arrayContaining(pointIds));
        expect(res.body.resolved_by).toBe(adminId);
    });

    test('POST duplicado (mesmo agente + data) retorna 409', async () => {
        const res = await request(app)
            .post('/admin/tracking/speed_violations/resolve')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                agent_id: AGENT_ID,
                date: DATE,
                is_valid: false,
                description: 'Duplicado',
                photo_url: 'https://minio.test/evidencia.jpg',
                violation_ids: pointIds
            });

        expect(res.status).toBe(409);
    });

    test('POST sem foto ou sem violation_ids retorna 400', async () => {
        const noPhoto = await request(app)
            .post('/admin/tracking/speed_violations/resolve')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                agent_id: AGENT_ID,
                date: DATE,
                is_valid: true,
                description: 'Sem foto',
                violation_ids: pointIds
            });
        expect(noPhoto.status).toBe(400);

        const noIds = await request(app)
            .post('/admin/tracking/speed_violations/resolve')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                agent_id: AGENT_ID,
                date: DATE,
                is_valid: true,
                description: 'Sem ids',
                photo_url: 'https://minio.test/evidencia.jpg'
            });
        expect(noIds.status).toBe(400);
    });

    test('GET /admin/tracking/speed_violations/all retorna todas com status de resolução', async () => {
        const res = await request(app)
            .get('/admin/tracking/speed_violations/all')
            .query({ from: `${DATE} 00:00:00`, to: `${DATE} 23:59:59` })
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        const points = res.body.filter(v => v.agent_id === AGENT_ID);
        expect(points.length).toBe(pointIds.length);
        points.forEach(p => {
            expect(p.resolution_id).toBeTruthy();
            expect(p.resolution_violation_ids).toEqual(expect.arrayContaining(pointIds));
        });
    });

    test('GET /admin/tracking/speed_violations/resolutions lista as resoluções', async () => {
        const res = await request(app)
            .get('/admin/tracking/speed_violations/resolutions')
            .query({ from: DATE, to: DATE })
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        const mine = res.body.filter(r => r.agent_id === AGENT_ID);
        expect(mine.length).toBe(1);
        expect(mine[0].violation_ids).toEqual(expect.arrayContaining(pointIds));
    });

    test('PUT edita a resolução e grava updated_by', async () => {
        const { rows } = await cenos_pool.query(
            'SELECT id FROM speed_violation_resolutions WHERE agent_id = $1 LIMIT 1',
            [AGENT_ID]
        );
        const id = rows[0].id;

        const res = await request(app)
            .put(`/admin/tracking/speed_violations/resolutions/${id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                is_valid: false,
                description: 'Revisado: infração não procedente.',
                photo_url: 'https://minio.test/nova-evidencia.jpg',
                violation_ids: pointIds
            });

        expect(res.status).toBe(200);
        expect(res.body.is_valid).toBe(false);
        expect(res.body.updated_by).toBe(adminId);
        expect(res.body.updated_at).toBeTruthy();
    });

    test('DELETE remove a resolução', async () => {
        const { rows } = await cenos_pool.query(
            'SELECT id FROM speed_violation_resolutions WHERE agent_id = $1 LIMIT 1',
            [AGENT_ID]
        );
        const id = rows[0].id;

        const res = await request(app)
            .delete(`/admin/tracking/speed_violations/resolutions/${id}`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);

        const after = await cenos_pool.query(
            'SELECT COUNT(*) FROM speed_violation_resolutions WHERE agent_id = $1',
            [AGENT_ID]
        );
        expect(Number(after.rows[0].count)).toBe(0);
    });
});
