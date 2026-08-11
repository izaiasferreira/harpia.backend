const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { createUser } = require('../src/functions/database/users');
const { cenos_pool } = require('../src/db');
const { geofenceCreateSchema, geofenceUpdateSchema } = require('../src/db/schemas/geofences');

const JWT_SECRET = process.env.JWT_SECRET || 'jwt_secret_change_me';

const VALID_POLYGON = [
    { lat: -5.09, lng: -42.81 },
    { lat: -5.09, lng: -42.79 },
    { lat: -5.08, lng: -42.79 },
    { lat: -5.08, lng: -42.81 },
];

const validFence = (overrides = {}) => ({
    name: 'Cerca Teste',
    type: 'speed',
    estado: 'pi',
    geometry: VALID_POLYGON,
    speed_limit: 40,
    ...overrides,
});

describe('Geofences — validação de schemas', () => {
    test('fence speed válida passa', () => {
        const res = geofenceCreateSchema.safeParse(validFence());
        expect(res.success).toBe(true);
    });

    test('nome é aparado (trim)', () => {
        const res = geofenceCreateSchema.safeParse(validFence({ name: '  Cerca Teste  ' }));
        expect(res.success).toBe(true);
        expect(res.data.name).toBe('Cerca Teste');
    });

    test('nome vazio após trim é rejeitado', () => {
        const res = geofenceCreateSchema.safeParse(validFence({ name: '   ' }));
        expect(res.success).toBe(false);
    });

    test('nome com mais de 100 caracteres é rejeitado', () => {
        const res = geofenceCreateSchema.safeParse(validFence({ name: 'A'.repeat(101) }));
        expect(res.success).toBe(false);
    });

    test('geometria com menos de 3 pontos é rejeitada', () => {
        const res = geofenceCreateSchema.safeParse(validFence({ geometry: VALID_POLYGON.slice(0, 2) }));
        expect(res.success).toBe(false);
    });

    test('lat fora do range é rejeitada', () => {
        const res = geofenceCreateSchema.safeParse(validFence({
            geometry: [{ lat: -5.09, lng: -42.81 }, { lat: -5.09, lng: -42.79 }, { lat: 90.1, lng: -42.79 }],
        }));
        expect(res.success).toBe(false);
    });

    test('lng fora do range é rejeitada', () => {
        const res = geofenceCreateSchema.safeParse(validFence({
            geometry: [{ lat: -5.09, lng: -42.81 }, { lat: -5.09, lng: -180.1 }, { lat: -5.08, lng: -42.79 }],
        }));
        expect(res.success).toBe(false);
    });

    test('tipo inválido é rejeitado', () => {
        const res = geofenceCreateSchema.safeParse(validFence({ type: 'warp' }));
        expect(res.success).toBe(false);
    });

    test('estado inválido é rejeitado', () => {
        const res = geofenceCreateSchema.safeParse(validFence({ estado: 'XX' }));
        expect(res.success).toBe(false);
    });

    test('tipo speed sem speed_limit é rejeitado', () => {
        const res = geofenceCreateSchema.safeParse(validFence({ speed_limit: null }));
        expect(res.success).toBe(false);
    });

    test('tipo min_speed sem speed_limit é aceito', () => {
        const res = geofenceCreateSchema.safeParse(validFence({ type: 'min_speed', speed_limit: null }));
        expect(res.success).toBe(true);
    });

    test('speed_limit fracionário é rejeitado', () => {
        const res = geofenceCreateSchema.safeParse(validFence({ speed_limit: 40.5 }));
        expect(res.success).toBe(false);
    });

    test('speed_limit fora de 1..300 é rejeitado', () => {
        expect(geofenceCreateSchema.safeParse(validFence({ speed_limit: 0 })).success).toBe(false);
        expect(geofenceCreateSchema.safeParse(validFence({ speed_limit: 301 })).success).toBe(false);
    });

    test('geometria com mais de 10000 pontos é rejeitada', () => {
        const many = [];
        for (let i = 0; i < 10001; i++) {
            many.push({ lat: -5.09 + i * 1e-6, lng: -42.81 + i * 1e-6 });
        }
        const res = geofenceCreateSchema.safeParse(validFence({ geometry: many }));
        expect(res.success).toBe(false);
    });

    test('update parcial é aceito sem todos os campos', () => {
        const res = geofenceUpdateSchema.safeParse({ name: 'Novo Nome' });
        expect(res.success).toBe(true);
    });
});

describe('Geofences — rotas admin (/admin/tracking/fences)', () => {
    let token;
    let userId;
    let createdId;

    beforeAll(async () => {
        const user = await createUser({
            email: `test_geofence_${Date.now()}@example.com`,
            senha: 'password123',
            nome: 'Test Geofence Admin',
            role: 'COMPANY_ADMIN',
            estado: 'pi',
        });
        userId = user.id;
        token = jwt.sign({ id: userId, estado: 'pi' }, JWT_SECRET);
    }, 30000);

    afterAll(async () => {
        if (createdId) {
            await cenos_pool.query('DELETE FROM tracking_fences WHERE id = $1', [createdId]).catch(() => {});
        }
        if (userId) {
            await cenos_pool.query('DELETE FROM users WHERE id = $1', [userId]).catch(() => {});
        }
    }, 15000);

    test('GET sem token retorna 401', async () => {
        const res = await request(app).get('/admin/tracking/fences');
        expect(res.status).toBe(401);
    });

    test('POST com tipo inválido retorna 400 com details', async () => {
        const res = await request(app)
            .post('/admin/tracking/fences')
            .set('Authorization', `Bearer ${token}`)
            .send(validFence({ type: 'warp' }));
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Dados inválidos');
        expect(Array.isArray(res.body.details)).toBe(true);
    });

    test('POST com geometria de 2 pontos retorna 400', async () => {
        const res = await request(app)
            .post('/admin/tracking/fences')
            .set('Authorization', `Bearer ${token}`)
            .send(validFence({ geometry: VALID_POLYGON.slice(0, 2) }));
        expect(res.status).toBe(400);
    });

    test('POST speed sem speed_limit retorna 400', async () => {
        const res = await request(app)
            .post('/admin/tracking/fences')
            .set('Authorization', `Bearer ${token}`)
            .send(validFence({ speed_limit: null }));
        expect(res.status).toBe(400);
    });

    test('POST válido cria a cerca e calcula o bbox via trigger', async () => {
        const res = await request(app)
            .post('/admin/tracking/fences')
            .set('Authorization', `Bearer ${token}`)
            .send(validFence());
        expect(res.status).toBe(201);
        expect(res.body.id).toBeDefined();
        expect(res.body.name).toBe('Cerca Teste');
        expect(res.body.type).toBe('speed');
        expect(res.body.estado).toBe('pi');
        expect(res.body.speed_limit).toBe(40);
        expect(res.body.is_active).toBe(true);
        expect(Number(res.body.lat_min)).toBeCloseTo(-5.09, 5);
        expect(Number(res.body.lat_max)).toBeCloseTo(-5.08, 5);
        expect(Number(res.body.lng_min)).toBeCloseTo(-42.81, 5);
        expect(Number(res.body.lng_max)).toBeCloseTo(-42.79, 5);
        createdId = res.body.id;
    });

    test('GET lista as cercas e inclui a criada', async () => {
        const res = await request(app)
            .get('/admin/tracking/fences')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.some(f => f.id === createdId)).toBe(true);
    });

    test('PUT atualiza a cerca', async () => {
        const res = await request(app)
            .put(`/admin/tracking/fences/${createdId}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ speed_limit: 60, name: 'Cerca Atualizada' });
        expect(res.status).toBe(200);
        expect(res.body.name).toBe('Cerca Atualizada');
        expect(res.body.speed_limit).toBe(60);
    });

    test('PUT com geometria inválida retorna 400', async () => {
        const res = await request(app)
            .put(`/admin/tracking/fences/${createdId}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ geometry: VALID_POLYGON.slice(0, 2) });
        expect(res.status).toBe(400);
    });

    test('PUT em id inexistente retorna 404', async () => {
        const res = await request(app)
            .put('/admin/tracking/fences/999999999')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'X' });
        expect(res.status).toBe(404);
    });

    test('DELETE remove a cerca', async () => {
        const res = await request(app)
            .delete(`/admin/tracking/fences/${createdId}`)
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        createdId = null;
    });

    test('DELETE em id inexistente retorna 404', async () => {
        const res = await request(app)
            .delete('/admin/tracking/fences/999999999')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(404);
    });
});
