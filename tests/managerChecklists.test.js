const request = require('supertest');
const app = require('../src/app');
const { cenos_pool } = require('../src/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Mock telegramAuth to simulate logged in user
jest.mock('../src/middlewares/telegramAuth', () => ({
    telegramAuth: (req, res, next) => {
        const agentId = req.headers['x-test-agent-id'];
        req.colaborador = {
            id: agentId,
            matricula: agentId,
            nome: agentId === 'TESTGESTOR' ? 'Gestor Teste' : 'Agente Teste',
            is_gestor: agentId === 'TESTGESTOR'
        };
        next();
    }
}));

describe('Manager Checklists V2', () => {
    let tokenGestor;
    let tokenAgente;
    let templateIdGestor;
    
    beforeAll(async () => {
        const hashedPassword = await bcrypt.hash('123456', 10);
        
        // Cleanup
        await cenos_pool.query(`DELETE FROM login WHERE id IN ('TESTGESTOR', 'TESTAGENTE')`);
        await cenos_pool.query(`DELETE FROM colaboradores WHERE "ID" IN ('TESTGESTOR', 'TESTAGENTE')`);
        await cenos_pool.query(`DELETE FROM checklist_templates WHERE title = 'Template Gestor Teste'`);
        
        // Create Gestor
        await cenos_pool.query(`
            INSERT INTO users (id, email, nome, senha, role, estado)
            VALUES (99990, 'gestor@test.com', 'Gestor', $1, 'COMPANY_ADMIN', 'pi')
            ON CONFLICT (id) DO NOTHING
        `, [hashedPassword]);
        await cenos_pool.query(`
            INSERT INTO colaboradores ("ID", "MAT", "Nome", is_gestor, "GESTOR IMEDIATO", status)
            VALUES ('TESTGESTOR', 'TESTGESTOR', 'Gestor Teste', true, NULL, true)
        `);
        await cenos_pool.query(`
            INSERT INTO login (id, estado)
            VALUES ('TESTGESTOR', 'pi')
        `);
        
        // Create Agente (Subordinate)
        await cenos_pool.query(`
            INSERT INTO colaboradores ("ID", "MAT", "Nome", is_gestor, "GESTOR IMEDIATO", status)
            VALUES ('TESTAGENTE', 'TESTAGENTE', 'Agente Teste', false, 'Gestor Teste', true)
        `);
        await cenos_pool.query(`
            INSERT INTO login (id, estado)
            VALUES ('TESTAGENTE', 'pi')
        `);

        tokenGestor = jwt.sign({ id: 'TESTGESTOR', role: 'AGENT' }, process.env.JWT_SECRET || 'test_secret');
        tokenAgente = jwt.sign({ id: 'TESTAGENTE', role: 'AGENT' }, process.env.JWT_SECRET || 'test_secret');
        
        // Ensure is_gestor column exists for tests
        await cenos_pool.query(`ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS is_gestor boolean DEFAULT false`);
        // Create Gestor Template
        const { rows: tRows } = await cenos_pool.query(`
            INSERT INTO checklist_templates (title, is_gestor, is_active, data)
            VALUES ('Template Gestor Teste', true, true, '{"sections":[]}')
            RETURNING id
        `);
        templateIdGestor = tRows[0].id;
    });

    afterAll(async () => {
        await cenos_pool.query(`DELETE FROM checklists WHERE template_id = $1`, [templateIdGestor]);
        await cenos_pool.query(`DELETE FROM checklist_templates WHERE id = $1`, [templateIdGestor]);
        await cenos_pool.query(`DELETE FROM login WHERE id IN ('TESTGESTOR', 'TESTAGENTE')`);
        await cenos_pool.query(`DELETE FROM colaboradores WHERE "ID" IN ('TESTGESTOR', 'TESTAGENTE')`);
    });

    test('listTemplatesUnified retorna templates mistos', async () => {
        const res = await request(app)
            .get('/agent/checklists/templates-unified')
            .set('x-test-agent-id', 'TESTGESTOR');
            
        expect(res.status).toBe(200);
        // Should find 'Template Gestor Teste'
        const tpl = res.body.find(t => t.id === templateIdGestor);
        expect(tpl).toBeDefined();
        expect(tpl.kind).toBe('gestor');
    });

    test('listSubordinatesPendingMonth do gestor retorna subordinate', async () => {
        const res = await request(app)
            .get('/agent/checklists/manager-checklists/pending')
            .set('x-test-agent-id', 'TESTGESTOR');
            
        expect(res.status).toBe(200);
        const sub = res.body.find(s => s.id === 'TESTAGENTE');
        expect(sub).toBeDefined();
        expect(sub.nome).toBe('Agente Teste');
    });

    test('submit checklist gestor insere target_agent_id e unique gestor_target_mes', async () => {
        const payload = {
            template_id: templateIdGestor,
            type: 'supplementary',
            answers: [],
            target_agent_id: 'TESTAGENTE',
            local_id: 'sync-gestor-123',
            date: new Date().toISOString().split('T')[0]
        };

        const res = await request(app)
            .post('/agent/checklists/manager-checklists')
            .set('x-test-agent-id', 'TESTGESTOR')
            .send(payload);

        expect(res.status).toBe(201);

        // Verify in DB
        const { rows } = await cenos_pool.query(`SELECT * FROM checklists WHERE local_id = 'sync-gestor-123'`);
        expect(rows.length).toBe(1);
        expect(rows[0].target_agent_id).toBe('TESTAGENTE');

        // Submit again for same target should fail due to unique constraint or application logic
        const payload2 = {
            template_id: templateIdGestor,
            type: 'supplementary',
            answers: [],
            target_agent_id: 'TESTAGENTE',
            local_id: 'sync-gestor-124',
            date: new Date().toISOString().split('T')[0]
        };

        const res2 = await request(app)
            .post('/agent/checklists/manager-checklists')
            .set('x-test-agent-id', 'TESTGESTOR')
            .send(payload2);

        expect(res2.status).toBe(409); // Unique constraint violation gestor_target_mes_idx
    });
});
