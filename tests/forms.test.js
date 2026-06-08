const request = require('supertest');
const app = require('../src/app');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const createToken = (user) => {
    return jwt.sign(
        { id: user.id, email: user.email, modules: user.modules || [] },
        JWT_SECRET,
        { expiresIn: '1d' }
    );
};

describe('Forms', () => {
    let token;
    let adminToken;
    let formId;

    beforeAll(() => {
        token = createToken({ id: 998, email: 'user@test.com', modules: ['create_form', 'forms', 'update_form', 'delete_form'] });
        adminToken = createToken({ id: 997, email: 'admin@test.com', modules: [] });
    });

    describe('POST /admin/forms', () => {
        test('deve criar formulário com 201', async () => {
            const res = await request(app)
                .post('/admin/forms')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    title: 'Formulário Teste',
                    description: 'Descrição teste',
                    structure: [
                        {
                            title: 'Página 1',
                            elements: [
                                { id: 'q1', type: 'question', field_type: 'text', label: 'Nome', required: true }
                            ]
                        }
                    ]
                });

            expect(res.status).toBe(201);
            expect(res.body).toHaveProperty('id');
            expect(res.body.title).toBe('Formulário Teste');
            formId = res.body.id;
        });

        test('deve retornar 400 sem título', async () => {
            const res = await request(app)
                .post('/admin/forms')
                .set('Authorization', `Bearer ${token}`)
                .send({ structure: [] });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Título é obrigatório');
        });

        test('deve retornar 401 sem token', async () => {
            const res = await request(app)
                .post('/admin/forms')
                .send({ title: 'Teste' });

            expect(res.status).toBe(401);
        });
    });

    describe('GET /admin/forms', () => {
        test('deve listar formulários com 200', async () => {
            const res = await request(app)
                .get('/admin/forms')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('data');
            expect(res.body).toHaveProperty('total');
        });
    });

    describe('GET /admin/forms/:id', () => {
        test('deve buscar formulário por id', async () => {
            const res = await request(app)
                .get(`/admin/forms/${formId}`)
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.id).toBe(formId);
        });

        test('deve retornar 404 para formulário inexistente', async () => {
            const res = await request(app)
                .get('/admin/forms/999999')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(404);
        });
    });

    describe('PUT /admin/forms/:id', () => {
        test('deve atualizar formulário com 200', async () => {
            const res = await request(app)
                .put(`/admin/forms/${formId}`)
                .set('Authorization', `Bearer ${token}`)
                .send({ title: 'Título Atualizado', isActive: true });

            expect(res.status).toBe(200);
            expect(res.body.title).toBe('Título Atualizado');
            expect(res.body.is_active).toBe(true);
        });
    });

    describe('Form submission', () => {
        test('deve ativar formulário antes de submeter', async () => {
            await request(app)
                .put(`/admin/forms/${formId}`)
                .set('Authorization', `Bearer ${token}`)
                .send({ isActive: true });
        });

        test('deve retornar 400 se formulário inativo', async () => {
            await request(app)
                .put(`/admin/forms/${formId}`)
                .set('Authorization', `Bearer ${token}`)
                .send({ isActive: false });

            const res = await request(app)
                .post(`/public/form/submit/${formId}`)
                .send({ answers: {} });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Formulário não está ativo');
        });

        test('deve submeter resposta com sucesso', async () => {
            await request(app)
                .put(`/admin/forms/${formId}`)
                .set('Authorization', `Bearer ${token}`)
                .send({ isActive: true });

            const res = await request(app)
                .post(`/public/form/submit/${formId}`)
                .send({ answers: { q1: 'João Silva' } });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
        });

        test('deve validar campos obrigatórios', async () => {
            const res = await request(app)
                .post(`/public/form/submit/${formId}`)
                .send({ answers: {} });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('obrigatório');
        });
    });

    describe('GET /public/form/:id', () => {
        test('deve retornar dados públicos do formulário', async () => {
            const res = await request(app)
                .get(`/public/form/${formId}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('title');
            expect(res.body).toHaveProperty('structure');
        });
    });

    describe('DELETE /admin/forms/:id', () => {
        test('deve deletar formulário com 200', async () => {
            const res = await request(app)
                .delete(`/admin/forms/${formId}`)
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });
});