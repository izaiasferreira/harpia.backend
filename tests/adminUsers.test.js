const request = require('supertest');
const app = require('../src/app');

describe('API Admin Users', () => {
    const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin_secret_change_me';

    describe('POST /admin/user/login', () => {
        test('deve retornar 400 se email não fornecido', async () => {
            const res = await request(app).post('/admin/user/login').send({ senha: '123' });
            expect(res.status).toBe(400);
        });

        test('deve retornar 400 se senha não fornecida', async () => {
            const res = await request(app).post('/admin/user/login').send({ email: 'teste@email.com' });
            expect(res.status).toBe(400);
        });
    });

    describe('GET /admin/user/me', () => {
        test('deve retornar 401 sem authorization', async () => {
            const res = await request(app).get('/admin/user/me');
            expect(res.status).toBe(401);
        });

        test('deve retornar 401 sem x-user-id', async () => {
            const res = await request(app)
                .get('/admin/user/me')
                .set('Authorization', `Basic ${ADMIN_SECRET}`);
            expect(res.status).toBe(401);
        });
    });

    describe('GET /admin/user/modules', () => {
        test('deve retornar 401 sem authorization', async () => {
            const res = await request(app).get('/admin/user/modules');
            expect(res.status).toBe(401);
        });
    });

    describe('GET /admin/branch', () => {
        test('deve retornar 401 sem authorization', async () => {
            const res = await request(app).get('/admin/branch');
            expect(res.status).toBe(401);
        });
    });

    describe('GET /admin/permission', () => {
        test('deve retornar 401 sem authorization', async () => {
            const res = await request(app).get('/admin/permission');
            expect(res.status).toBe(401);
        });
    });

    describe('PUT /admin/user/me/password', () => {
        test('deve retornar 401 sem token', async () => {
            const res = await request(app).put('/admin/user/me/password').send({
                senha_atual: 'Senha@123',
                nova_senha: 'NovaSenha@123'
            });
            expect(res.status).toBe(401);
        });

        test('deve retornar 400 sem senha_atual', async () => {
            const res = await request(app).put('/admin/user/me/password').send({
                nova_senha: 'NovaSenha@123'
            }).set('Authorization', 'Bearer any');
            expect(res.status).toBe(400);
        });

        test('deve retornar 400 se nova_senha nao atender requisitos', async () => {
            const res = await request(app).put('/admin/user/me/password').send({
                senha_atual: 'Senha@123',
                nova_senha: 'fraca'
            }).set('Authorization', 'Bearer any');
            expect(res.status).toBe(400);
        });

        test('deve retornar 400 se nova_senha nao tiver maiuscula', async () => {
            const res = await request(app).put('/admin/user/me/password').send({
                senha_atual: 'Senha@123',
                nova_senha: 'semmaiuscula@123'
            }).set('Authorization', 'Bearer any');
            expect(res.status).toBe(400);
        });

        test('deve retornar 400 se nova_senha nao tiver especial', async () => {
            const res = await request(app).put('/admin/user/me/password').send({
                senha_atual: 'Senha@123',
                nova_senha: 'SemEspecial123'
            }).set('Authorization', 'Bearer any');
            expect(res.status).toBe(400);
        });
    });

    describe('PUT /admin/user/users/:id/password', () => {
        test('deve retornar 401 sem token', async () => {
            const res = await request(app).put('/admin/user/users/1/password').send({
                senha: 'NovaSenha@123'
            });
            expect(res.status).toBe(401);
        });

        test('deve retornar 400 sem senha', async () => {
            const res = await request(app).put('/admin/user/users/1/password').send({})
                .set('Authorization', 'Bearer any');
            expect(res.status).toBe(400);
        });

        test('deve retornar 400 se senha nao atender requisitos', async () => {
            const res = await request(app).put('/admin/user/users/1/password').send({
                senha: 'fraca'
            }).set('Authorization', 'Bearer any');
            expect(res.status).toBe(400);
        });
    });

    describe('PUT /admin/user/me', () => {
        test('deve retornar 401 sem token', async () => {
            const res = await request(app).put('/admin/user/me').send({ nome: 'Teste' });
            expect(res.status).toBe(401);
        });

        test('deve retornar 400 se nome for vazio', async () => {
            const res = await request(app).put('/admin/user/me').send({ nome: '' })
                .set('Authorization', 'Bearer any');
            expect(res.status).toBe(400);
        });

        test('deve retornar 400 se foto for string muito longa', async () => {
            const res = await request(app).put('/admin/user/me').send({ foto: 'x'.repeat(501) })
                .set('Authorization', 'Bearer any');
            expect(res.status).toBe(400);
        });
    });

    describe('POST /admin/user/me/foto', () => {
        test('deve retornar 401 sem token', async () => {
            const res = await request(app).post('/admin/user/me/foto');
            expect(res.status).toBe(401);
        });

        test('deve retornar 400 sem arquivo', async () => {
            const res = await request(app).post('/admin/user/me/foto')
                .set('Authorization', 'Bearer any');
            expect(res.status).toBe(400);
        });
    });
});