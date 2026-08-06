const request = require('supertest');
const app = require('../src/app');
const jwt = require('jsonwebtoken');
const { createUser } = require('../src/functions/database/users');
const { sinergia_pool } = require('../src/db');

const JWT_SECRET = process.env.JWT_SECRET || 'jwt_secret_change_me';

describe('Admin Security Report Configs Merged (GET /admin/security_reports/configs/merged)', () => {
    let token;
    let userId;
    let configIds = [];

    beforeAll(async () => {
        const email = `test_admin_cfg_${Date.now()}@example.com`;
        const user = await createUser({
            email,
            senha: 'password123',
            nome: 'Test Admin Cfg',
            role: 'COMPANY_ADMIN',
            estado: 'pi'
        });
        userId = user.id;
        token = jwt.sign({ id: userId, estado: 'pi' }, JWT_SECRET);

        const hazards = await sinergia_pool.query(
            `INSERT INTO security_report_configs (title, config_type, estado, data, is_active)
             VALUES ($1, 'hazards', 'pi', $2, true) RETURNING id`,
            ['Perigos PI', JSON.stringify({ perigos: [{ valor: 'Cão bravo', cor: '#ef4444', ordem: 1 }, { valor: 'Risco elétrico', cor: '#3b82f6', ordem: 2 }] })]
        );
        configIds.push(hazards.rows[0].id);

        const accidents = await sinergia_pool.query(
            `INSERT INTO security_report_configs (title, config_type, estado, data, is_active)
             VALUES ($1, 'accidents', 'pi', $2, true) RETURNING id`,
            ['Acidentes PI', JSON.stringify({ tipos_acidente: [{ valor: 'Queda de Moto', ordem: 1 }, { valor: 'Colisão de Trânsito', ordem: 2 }] })]
        );
        configIds.push(accidents.rows[0].id);

        const seccionalCfg = await sinergia_pool.query(
            `INSERT INTO security_report_configs (title, config_type, estado, data, is_active)
             VALUES ($1, 'hazards', 'pi', $2, true) RETURNING id`,
            ['Perigos Seccional', JSON.stringify({
                perigos: [{ valor: 'Perigo seccional teste', cor: '#10b981', ordem: 1 }],
                filters: { seccional: ['UAC TESTE'] }
            })]
        );
        configIds.push(seccionalCfg.rows[0].id);
    }, 30000);

    afterAll(async () => {
        for (const id of configIds) {
            await sinergia_pool.query('DELETE FROM security_report_configs WHERE id = $1', [id]);
        }
        if (userId) {
            await sinergia_pool.query('DELETE FROM users WHERE id = $1', [userId]);
        }
    }, 15000);

    test('deve retornar 401 sem token', async () => {
        const res = await request(app).get('/admin/security_reports/configs/merged');
        expect(res.status).toBe(401);
    });

    test('deve retornar perigos e tipos_acidente mergeados por estado', async () => {
        const res = await request(app)
            .get('/admin/security_reports/configs/merged?estado=pi')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('perigos');
        expect(res.body).toHaveProperty('tipos_acidente');
        expect(res.body.perigos.some(p => p.valor === 'Cão bravo')).toBe(true);
        expect(res.body.tipos_acidente.some(t => t.valor === 'Queda de Moto')).toBe(true);
    });

    test('deve filtrar configs pelo seccional informado', async () => {
        const res = await request(app)
            .get('/admin/security_reports/configs/merged?estado=pi&seccional=UAC%20TESTE')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.perigos.some(p => p.valor === 'Perigo seccional teste')).toBe(true);
    });

    test('deve excluir configs de seccional quando o seccional não bate', async () => {
        const res = await request(app)
            .get('/admin/security_reports/configs/merged?estado=pi&seccional=OUTRA')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.perigos.some(p => p.valor === 'Perigo seccional teste')).toBe(false);
        expect(res.body.perigos.some(p => p.valor === 'Cão bravo')).toBe(true);
    });
});
