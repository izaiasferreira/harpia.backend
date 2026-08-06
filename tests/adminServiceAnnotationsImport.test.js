const request = require('supertest');
const jwt = require('jsonwebtoken');
const XLSX = require('xlsx');
const app = require('../src/app');
const { createUser } = require('../src/functions/database/users');
const { sinergia_pool } = require('../src/db');

const JWT_SECRET = process.env.JWT_SECRET || 'jwt_secret_change_me';

describe('Admin Service Annotations Import (POST /admin/service_annotations/import)', () => {
    let token;
    let userId;
    let adminName;
    let createdIds = [];

    const buildXlsx = (rows) => {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, 'Anotacoes');
        return XLSX.write(wb, { type: 'buffer' });
    };

    beforeAll(async () => {
        const email = `test_annot_import_${Date.now()}@example.com`;
        const user = await createUser({
            email,
            senha: 'password123',
            nome: 'Test Annot Import',
            role: 'COMPANY_ADMIN',
            estado: 'pi'
        });
        userId = user.id;
        adminName = user.nome;
        token = jwt.sign({ id: userId, estado: 'pi' }, JWT_SECRET);
    }, 30000);

    afterAll(async () => {
        if (createdIds.length > 0) {
            await sinergia_pool.query('DELETE FROM service_annotations WHERE id = ANY($1)', [createdIds]);
        }
        await sinergia_pool.query('DELETE FROM login WHERE id = $1', [String(userId)]).catch(() => {});
        await sinergia_pool.query('DELETE FROM login WHERE id = $1', [adminName]).catch(() => {});
        if (userId) {
            await sinergia_pool.query('DELETE FROM users WHERE id = $1', [userId]);
        }
    }, 15000);

    test('deve retornar 401 sem token', async () => {
        const res = await request(app).post('/admin/service_annotations/import');
        expect(res.status).toBe(401);
    });

    test('deve retornar 400 sem arquivo', async () => {
        const res = await request(app)
            .post('/admin/service_annotations/import')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Nenhum arquivo enviado.');
    });

    test('deve importar linhas válidas e reportar inválidas', async () => {
        const buffer = buildXlsx([
            { TIPO: 'Remanejamento', IDENTIFICACAO_TIPO: 'Medidor', IDENTIFICACAO_VALOR: '12345', DESCRICAO: 'Trocar medidor', ESTADO: 'PI', REGIONAL: 'NORTE', SECCIONAL: 'A', EXPIRA_EM: '2030-01-01' },
            { TIPO: 'Anotação', DESCRICAO: 'Cliente reclamou de vazamento', ESTADO: 'ma', LATITUDE: '-5.0892', LONGITUDE: '-42.8016' },
            { TIPO: 'Invalido', DESCRICAO: 'Tipo não permitido', ESTADO: 'pi' },
        ]);

        const res = await request(app)
            .post('/admin/service_annotations/import')
            .set('Authorization', `Bearer ${token}`)
            .attach('file', buffer, 'anotacoes.xlsx');

        expect(res.status).toBe(200);
        expect(res.body.totalProcessed).toBe(3);
        expect(res.body.successCount).toBe(2);
        expect(res.body.errorCount).toBe(1);
        expect(res.body.created).toBe(2);
        expect(res.body.errors.length).toBe(1);

        const { rows } = await sinergia_pool.query(
            'SELECT id, expires_at FROM service_annotations WHERE autor = $1 AND descricao = $2',
            [String(userId), 'Trocar medidor']
        );
        expect(rows.length).toBe(1);
        expect(rows[0].expires_at).not.toBeNull();
        createdIds = rows.map(r => r.id);
        const { rows: more } = await sinergia_pool.query(
            'SELECT id FROM service_annotations WHERE autor = $1 AND descricao = $2',
            [String(userId), 'Cliente reclamou de vazamento']
        );
        createdIds = [...createdIds, ...more.map(r => r.id)];
    });

    test('deve rejeitar linha com data de expiração inválida', async () => {
        const buffer = buildXlsx([
            { TIPO: 'Coordenada', DESCRICAO: 'Data inválida', ESTADO: 'pi', EXPIRA_EM: 'data-invalida' },
        ]);

        const res = await request(app)
            .post('/admin/service_annotations/import')
            .set('Authorization', `Bearer ${token}`)
            .attach('file', buffer, 'anotacoes_invalidas.xlsx');

        expect(res.status).toBe(200);
        expect(res.body.successCount).toBe(0);
        expect(res.body.errorCount).toBe(1);
        expect(res.body.errors[0]).toContain('EXPIRA_EM');
    });
});
