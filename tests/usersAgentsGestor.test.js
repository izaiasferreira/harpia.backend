const request = require('supertest');
const app = require('../src/app');
const { sinergia_pool } = require('../src/db');
process.env.JWT_SECRET = 'test_secret_for_tests';
const { generateToken } = require('../src/middlewares/jwtAuth');

describe('users_agents - is_gestor', () => {
    let token;

    beforeAll(async () => {
        // Ensure admin user exists for token verification
        await sinergia_pool.query(`DELETE FROM login WHERE id LIKE 'TESTGESTOR%'`);
        await sinergia_pool.query(`DELETE FROM colaboradores WHERE "ID" LIKE 'TESTGESTOR%'`);
        await sinergia_pool.query(`
            INSERT INTO users (id, email, nome, senha, role, estado)
            VALUES (99999, 'admin_test@test.com', 'Admin', 'hashed', 'COMPANY_ADMIN', 'pi')
            ON CONFLICT (email) DO NOTHING
        `);

        token = generateToken({
            id: 99999,
            estado: 'pi'
        });
    });

    afterAll(async () => {
        await sinergia_pool.query(`DELETE FROM colaboradores WHERE "ID" LIKE 'TESTGESTOR%'`);
        await sinergia_pool.query(`DELETE FROM login WHERE id LIKE 'TESTGESTOR%'`);
    });

    test('criar agente sem is_gestor persiste default false', async () => {
        const payload = {
            id: 'TEST_GESTOR_1',
            matricula: 'TEST_GESTOR_1',
            nome: 'Agente Comum',
            estado: 'pi'
        };
        const res = await request(app)
            .post('/admin/users_agents')
            .set('Authorization', `Bearer ${token}`)
            .send(payload);
        
        expect(res.status).toBe(200);
        expect(res.body.is_gestor).toBe(false);
    });

    test('criar agente com is_gestor true persiste true', async () => {
        const payload = {
            id: 'TEST_GESTOR_2',
            matricula: 'TEST_GESTOR_2',
            nome: 'Agente Gestor',
            estado: 'pi',
            is_gestor: true
        };
        const res = await request(app)
            .post('/admin/users_agents')
            .set('Authorization', `Bearer ${token}`)
            .send(payload);
        
        expect(res.status).toBe(200);
        expect(res.body.is_gestor).toBe(true);
    });

    test('editar agente alternando is_gestor atualiza', async () => {
        const payload = {
            nome: 'Agente Gestor Editado',
            is_gestor: false
        };
        const res = await request(app)
            .put('/admin/users_agents/TEST_GESTOR_2')
            .set('Authorization', `Bearer ${token}`)
            .send(payload);
        
        expect(res.status).toBe(200);
        
        // Verifica no banco
        const { rows } = await sinergia_pool.query(`SELECT is_gestor FROM colaboradores WHERE "ID" = 'TESTGESTOR2'`);
        expect(rows[0].is_gestor).toBe(false);
    });

    test('listagem de agentes inclui is_gestor no payload', async () => {
        const res = await request(app)
            .get('/admin/users_agents?page=1&limit=50&search=TESTGESTOR2')
            .set('Authorization', `Bearer ${token}`);
        
        expect(res.status).toBe(200);
        const agent = res.body.data.find(a => a.id === 'TESTGESTOR2');
        expect(agent).toBeDefined();
        // Since we updated it to false in the previous test, it should be false here
        expect(agent.is_gestor).toBe(false);
    });
});
