const request = require('supertest');
const app = require('../src/app');
const jwt = require('jsonwebtoken');
const { createUser } = require('../src/functions/database/users');
const { cenos_pool } = require('../src/db');

const JWT_SECRET = process.env.JWT_SECRET || 'jwt_secret_change_me';

describe('Message Templates', () => {
    let token;
    let userId;
    let templateId;

    beforeAll(async () => {
        // Create a test user with COMPANY_ADMIN role to bypass module checks or have all modules
        const email = `test_admin_${Date.now()}@example.com`;
        try {
            const user = await createUser({
                email,
                senha: 'password123',
                nome: 'Test Admin',
                role: 'COMPANY_ADMIN',
                estado: 'pi'
            });
            userId = user.id;
            token = jwt.sign({ id: userId, estado: 'pi' }, JWT_SECRET);
        } catch (err) {
            // If user already exists or other error, try to find it or just use a dummy token if mocked
            console.error('Error creating test user:', err.message);
            // Fallback for environments where DB is not writable
            token = jwt.sign({ id: 1, estado: 'pi' }, JWT_SECRET);
        }
    });

    afterAll(async () => {
        if (userId) {
            await cenos_pool.query('DELETE FROM users WHERE id = $1', [userId]);
        }
        if (templateId) {
            await cenos_pool.query('DELETE FROM message_templates_admin WHERE id = $1', [templateId]);
        }
    });

    test('POST /admin/message_templates - deve criar um template com todos os campos', async () => {
        const res = await request(app)
            .post('/admin/message_templates')
            .set('Authorization', `Bearer ${token}`)
            .send({
                name: 'Template Completo',
                text: 'Conteúdo do template',
                file: 'https://example.com/image.jpg',
                webAppButtonText: 'Abrir Site',
                webAppButtonUrl: 'https://example.com'
            });

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('id');
        expect(res.body.name).toBe('Template Completo');
        expect(res.body.file).toBe('https://example.com/image.jpg');
        expect(res.body.web_app_button_text).toBe('Abrir Site');
        templateId = res.body.id;
    });

    test('POST /admin/message_templates - deve falhar sem nome', async () => {
        const res = await request(app)
            .post('/admin/message_templates')
            .set('Authorization', `Bearer ${token}`)
            .send({ text: 'Só texto' });

        expect(res.status).toBe(400);
    });

    test('GET /admin/message_templates - deve listar templates', async () => {
        const res = await request(app)
            .get('/admin/message_templates')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('data');
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.total).toBeGreaterThanOrEqual(1);
    });

    test('GET /admin/message_templates - deve filtrar por busca', async () => {
        const res = await request(app)
            .get('/admin/message_templates?search=Completo')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    test('PUT /admin/message_templates/:id - deve atualizar template', async () => {
        const res = await request(app)
            .put(`/admin/message_templates/${templateId}`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                name: 'Nome Atualizado',
                text: 'Texto Atualizado'
            });

        expect(res.status).toBe(200);
        expect(res.body.name).toBe('Nome Atualizado');
        expect(res.body.text).toBe('Texto Atualizado');
    });

    test('DELETE /admin/message_templates/:id - deve deletar template', async () => {
        const res = await request(app)
            .delete(`/admin/message_templates/${templateId}`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.deleted.id).toBe(templateId);
        templateId = null; // Mark as deleted for afterAll
    });

    test('GET /admin/message_templates - deve retornar 401 sem token', async () => {
        const res = await request(app).get('/admin/message_templates');
        expect(res.status).toBe(401);
    });

    test('Privacidade - um usuário não deve ver templates de outro', async () => {
        // Criar segundo usuário
        const email2 = `test_admin2_${Date.now()}@example.com`;
        const user2 = await createUser({
            email: email2,
            senha: 'password123',
            nome: 'Test Admin 2',
            role: 'COMPANY_ADMIN',
            estado: 'pi'
        });
        const token2 = jwt.sign({ id: user2.id, estado: 'pi' }, JWT_SECRET);

        try {
            // Usuário 1 cria um template
            const res1 = await request(app)
                .post('/admin/message_templates')
                .set('Authorization', `Bearer ${token}`)
                .send({ name: 'Template User 1', text: 'Privado' });
            
            const templateId1 = res1.body.id;

            // Usuário 2 tenta listar e não deve ver o template do Usuário 1
            const res2 = await request(app)
                .get('/admin/message_templates')
                .set('Authorization', `Bearer ${token2}`);
            
            const foundNode = res2.body.data.find(t => t.id === templateId1);
            expect(foundNode).toBeUndefined();

            // Usuário 2 tenta deletar o template do Usuário 1 e deve falhar/retornar 404
            const resDelete = await request(app)
                .delete(`/admin/message_templates/${templateId1}`)
                .set('Authorization', `Bearer ${token2}`);
            
            expect(resDelete.status).toBe(404);

        } finally {
            // Cleanup user 2
            await cenos_pool.query('DELETE FROM users WHERE id = $1', [user2.id]);
        }
    });
});
