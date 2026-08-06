const { sinergia_pool } = require('../src/db');
const request = require('supertest');
const app = require('../src/app');

describe('telegramAuth - testa gate de gestor na rota de pending', () => {
    
    beforeAll(async () => {
        await sinergia_pool.query(`ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS is_gestor boolean DEFAULT false;`);
        // Inserir gestor e nao-gestor
        await sinergia_pool.query(`
            INSERT INTO colaboradores ("ID", "MAT", "Nome", "estado", is_gestor)
            VALUES ('TEST_AUTH_GESTOR', 'TEST_AUTH_GESTOR', 'Gestor Auth', 'pi', true),
                   ('TEST_AUTH_NAO_GESTOR', 'TEST_AUTH_NAO_GESTOR', 'Nao Gestor Auth', 'pi', false)
            ON CONFLICT ("ID") DO UPDATE SET is_gestor = EXCLUDED.is_gestor
        `);

        // Inserir tokens validos no banco para dar bypass no hash check do telegramAuth
        await sinergia_pool.query(`
            INSERT INTO telegram_tokens (token, agent_id, telegram_user_id, expires_at)
            VALUES ('DUMMY_TOKEN_GESTOR', 'TEST_AUTH_GESTOR', '100001', CURRENT_TIMESTAMP + interval '1 day'),
                   ('DUMMY_TOKEN_NAO_GESTOR', 'TEST_AUTH_NAO_GESTOR', '100002', CURRENT_TIMESTAMP + interval '1 day')
        `);
    });

    afterAll(async () => {
        await sinergia_pool.query(`DELETE FROM telegram_tokens WHERE token IN ('DUMMY_TOKEN_GESTOR', 'DUMMY_TOKEN_NAO_GESTOR')`);
        await sinergia_pool.query(`DELETE FROM colaboradores WHERE "ID" IN ('TEST_AUTH_GESTOR', 'TEST_AUTH_NAO_GESTOR')`);
    });

    test('perfil do agente não expõe is_gestor na resposta json', async () => {
        const response = await request(app)
            .get('/agent/profile') 
            .set('x-telegram-init-data', 'DUMMY_TOKEN_GESTOR');
            
        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();
        // The key part: is_gestor should NOT be present in the response body!
        expect(response.body.is_gestor).toBeUndefined();
    });

    test('acesso a rota do gestor bloqueia não-gestores e permite gestores', async () => {
        // Nao gestor
        const resBlock = await request(app)
            .get('/agent/checklists/manager-checklists/pending?mes=08&ano=2026')
            .set('x-telegram-init-data', 'DUMMY_TOKEN_NAO_GESTOR');
        
        expect(resBlock.status).toBe(403);

        // Gestor
        const resAllow = await request(app)
            .get('/agent/checklists/manager-checklists/pending?mes=08&ano=2026')
            .set('x-telegram-init-data', 'DUMMY_TOKEN_GESTOR');
        
        expect(resAllow.status).toBe(200);
    });
});


