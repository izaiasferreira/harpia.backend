const request = require('supertest');
const app = require('../src/app');
const jwt = require('jsonwebtoken');

jest.mock('../src/functions/database/configs', () => ({
    listEtapas: jest.fn(),
    updateEtapa: jest.fn(),
    listFeriados: jest.fn(),
    addFeriado: jest.fn(),
    deleteFeriado: jest.fn()
}));

jest.mock('../src/functions/database/users', () => ({
    getUserById: jest.fn().mockImplementation((id) => {
        if (id === 2) return { id: 2, role: 'AGENTE', estado: 'pi' };
        return { id: 1, role: 'COMPANY_ADMIN', estado: 'pi' };
    }),
    createUsersTable: jest.fn().mockResolvedValue(true)
}));

jest.mock('../src/functions/database/permissions', () => ({
    getUserModules: jest.fn().mockResolvedValue(['configs']),
    getUserPermissions: jest.fn().mockResolvedValue([{ id: 1, name: 'Admin', modules: ['configs'], filters: [] }]),
    createPermissionsTable: jest.fn().mockResolvedValue(true)
}));

const {
    listEtapas,
    updateEtapa,
    listFeriados,
    addFeriado,
    deleteFeriado
} = require('../src/functions/database/configs');

describe('Admin Config Module - Etapas e Feriados', () => {
    let token;

    beforeAll(() => {
        token = jwt.sign({ id: 1, estado: 'pi' }, process.env.JWT_SECRET || 'jwt_secret_change_me');
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /admin/config/etapas', () => {
        it('deve listar etapas do estado informado', async () => {
            listEtapas.mockResolvedValue([
                { etapa: '1', data: '15/05/2026' },
                { etapa: '2', data: '22/05/2026' }
            ]);

            const res = await request(app)
                .get('/admin/config/etapas')
                .query({ state: 'pi' })
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(2);
            expect(res.body[0]).toHaveProperty('etapa', '1');
            expect(listEtapas).toHaveBeenCalledWith('pi');
        });

        it('deve usar estado do usuario como fallback', async () => {
            listEtapas.mockResolvedValue([]);

            const res = await request(app)
                .get('/admin/config/etapas')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(listEtapas).toHaveBeenCalledWith('pi');
        });
    });

    describe('PUT /admin/config/etapas', () => {
        it('deve atualizar data de uma etapa', async () => {
            updateEtapa.mockResolvedValue({ etapa: '1', data: '20/05/2026' });

            const res = await request(app)
                .put('/admin/config/etapas')
                .query({ state: 'pi' })
                .set('Authorization', `Bearer ${token}`)
                .send({ etapa: '1', data: '20/05/2026' });

            expect(res.status).toBe(200);
            expect(res.body.updated.etapa).toBe('1');
            expect(updateEtapa).toHaveBeenCalledWith('pi', '1', '20/05/2026');
        });

        it('deve validar campos obrigatorios', async () => {
            const res = await request(app)
                .put('/admin/config/etapas')
                .query({ state: 'pi' })
                .set('Authorization', `Bearer ${token}`)
                .send({});

            expect(res.status).toBe(400);
        });
    });

    describe('GET /admin/config/feriados', () => {
        it('deve listar feriados do estado', async () => {
            listFeriados.mockResolvedValue([
                { id: 1, date: '03/04/2026' },
                { id: 2, date: '21/04/2026' }
            ]);

            const res = await request(app)
                .get('/admin/config/feriados')
                .query({ state: 'ma' })
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(2);
            expect(listFeriados).toHaveBeenCalledWith('ma');
        });
    });

    describe('POST /admin/config/feriados', () => {
        it('deve adicionar feriado', async () => {
            addFeriado.mockResolvedValue({ id: 1, date: '12/10/2026' });

            const res = await request(app)
                .post('/admin/config/feriados')
                .query({ state: 'pi' })
                .set('Authorization', `Bearer ${token}`)
                .send({ date: '12/10/2026' });

            expect(res.status).toBe(201);
            expect(res.body).toHaveProperty('id');
            expect(addFeriado).toHaveBeenCalledWith('pi', '12/10/2026');
        });

        it('deve rejeitar data no formato invalido', async () => {
            const res = await request(app)
                .post('/admin/config/feriados')
                .query({ state: 'pi' })
                .set('Authorization', `Bearer ${token}`)
                .send({ date: '2026-10-12' });

            expect(res.status).toBe(400);
        });
    });

    describe('DELETE /admin/config/feriados/:id', () => {
        it('deve remover feriado por ID', async () => {
            deleteFeriado.mockResolvedValue(true);

            const res = await request(app)
                .delete('/admin/config/feriados/1')
                .query({ state: 'pi' })
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(deleteFeriado).toHaveBeenCalledWith('pi', '1');
        });

        it('deve retornar 404 se feriado nao existir', async () => {
            deleteFeriado.mockResolvedValue(false);

            const res = await request(app)
                .delete('/admin/config/feriados/999')
                .query({ state: 'pi' })
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(404);
        });
    });

    describe('Autenticacao e Permissoes', () => {
        it('deve rejeitar request sem token', async () => {
            const res = await request(app)
                .get('/admin/config/etapas');

            expect(res.status).toBe(401);
        });

        it('deve rejeitar usuario sem modulo configs', async () => {
            const restrictedToken = jwt.sign({ id: 2, estado: 'pi' }, process.env.JWT_SECRET || 'jwt_secret_change_me');
            const perms = require('../src/functions/database/permissions');
            perms.getUserModules.mockResolvedValue(['dashboard']);

            const res = await request(app)
                .get('/admin/config/etapas')
                .set('Authorization', `Bearer ${restrictedToken}`);

            expect(res.status).toBe(403);
            perms.getUserModules.mockResolvedValue(['configs']);
        });
    });
});
