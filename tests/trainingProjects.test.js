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

describe('Training Projects', () => {
    let token;
    let userId;

    beforeAll(() => {
        userId = 999;
        token = createToken({ id: userId, email: 'test@test.com', modules: [] });
    });

    test('deve criar projeto com 201', async () => {
        const res = await request(app)
            .post('/training')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Projeto Teste', description: 'Descrição teste' });

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('id');
        expect(res.body.name).toBe('Projeto Teste');
    });

    test('deve retornar 400 quando nome vazio', async () => {
        const res = await request(app)
            .post('/training')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: '' });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Nome é obrigatório');
    });

    test('deve listar projetos com 200', async () => {
        const res = await request(app)
            .get('/training')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('data');
        expect(res.body).toHaveProperty('total');
        expect(res.body).toHaveProperty('page');
        expect(res.body).toHaveProperty('limit');
    });

    test('deve buscar projeto por id com 200', async () => {
        const createRes = await request(app)
            .post('/training')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Busca por ID' });

        const res = await request(app)
            .get(`/training/${createRes.body.id}`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.id).toBe(createRes.body.id);
    });

    test('deve retornar 404 para projeto inexistente', async () => {
        const res = await request(app)
            .get('/training/999999')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(404);
    });

    test('deve atualizar projeto com 200', async () => {
        const createRes = await request(app)
            .post('/training')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Original' });

        const res = await request(app)
            .put(`/training/${createRes.body.id}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Atualizado', description: 'Nova descrição' });

        expect(res.status).toBe(200);
        expect(res.body.name).toBe('Atualizado');
    });

    test('deve deletar projeto com 200', async () => {
        const createRes = await request(app)
            .post('/training')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Para deletar' });

        const res = await request(app)
            .delete(`/training/${createRes.body.id}`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test('deve retornar 401 sem token', async () => {
        const res = await request(app).get('/training');
        expect(res.status).toBe(401);
    });
});