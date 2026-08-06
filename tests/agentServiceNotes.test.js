const request = require('supertest');
const app = require('../src/app');

jest.mock('../src/functions/database/serviceNotes', () => {
    const mockNotes = [
        { id: 1, group_id: 1, title: 'Nota 1', status: 'PENDENTE', assigned_to: 'T001', group_name: 'Grupo A' },
        { id: 2, group_id: 1, title: 'Nota 2', status: 'CONCLUIDO', assigned_to: 'T001', group_name: 'Grupo A' },
    ];
    return {
        getAssignedNotes: jest.fn().mockResolvedValue(mockNotes),
        getServiceNoteById: jest.fn().mockImplementation((id) => {
            if (id === '1') return Promise.resolve(mockNotes[0]);
            if (id === '2') return Promise.resolve(mockNotes[1]);
            return Promise.resolve(null);
        }),
        completeServiceNote: jest.fn().mockImplementation((id, { agentId }) => {
            if (id === '1') return Promise.resolve({ ...mockNotes[0], status: 'CONCLUIDO', completed_by: agentId });
            return Promise.resolve(null);
        }),
        selfRegisterServiceNote: jest.fn().mockImplementation(({ groupId, agentId }) => {
            return Promise.resolve({ id: 99, group_id: groupId, title: 'Registro – Grupo A', status: 'CONCLUIDO', assigned_to: agentId, self_registered: true });
        }),
        createAgentServiceNote: jest.fn().mockImplementation(({ group_id, title, agentId, assignToSelf }) => {
            return Promise.resolve({ id: 100, group_id, title, status: 'PENDENTE', assigned_to: assignToSelf ? agentId : null });
        }),
        listCreatableGroups: jest.fn().mockResolvedValue([
            { id: 1, name: 'Grupo A', allow_agent_creation: true, allow_all_agents: true, allowed_agents: [] },
        ]),
        listVisibleGroups: jest.fn().mockResolvedValue([
            { id: 1, name: 'Grupo A', allow_all_agents: true, allowed_agents: [] },
            { id: 2, name: 'Grupo B (privado)', allow_all_agents: false, allowed_agents: ['T001'] },
        ]),
        listCategoriesByGroup: jest.fn().mockResolvedValue([
            { id: 1, group_id: 1, name: 'Categoria 1', color: '#FF0000' },
        ]),
        ensureServiceNotesTables: jest.fn().mockResolvedValue(true),
    };
});

jest.mock('../src/db', () => ({
    sinergia_pool: { query: jest.fn().mockResolvedValue({ rows: [] }) },
    pi_pool: { query: jest.fn().mockResolvedValue({ rows: [] }) },
    ma_pool: { query: jest.fn().mockResolvedValue({ rows: [] }) },
    localizacoes_pi_pool: { query: jest.fn().mockResolvedValue({ rows: [] }) },
}));

jest.mock('../src/middlewares/telegramAuth', () => ({
    telegramAuth: (req, res, next) => {
        req.colaborador = { id: 'T001', estado: 'pi', telegramId: '12345' };
        next();
    },
}));

const serviceNotes = require('../src/functions/database/serviceNotes');

describe('Agent Service Notes Routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /agent/service-notes', () => {
        test('deve listar notas atribuidas ao agente', async () => {
            const res = await request(app)
                .get('/agent/service-notes')
                .set('X-Telegram-Init-Data', 'valid_token');

            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(2);
            expect(res.body[0].title).toBe('Nota 1');
            expect(serviceNotes.getAssignedNotes).toHaveBeenCalledWith('T001');
        });

        test('deve retornar 500 se o service lancar erro', async () => {
            serviceNotes.getAssignedNotes.mockRejectedValueOnce(new Error('DB error'));
            const res = await request(app)
                .get('/agent/service-notes')
                .set('X-Telegram-Init-Data', 'valid_token');
            expect(res.status).toBe(500);
        });
    });

    describe('GET /agent/service-notes/:id', () => {
        test('deve retornar detalhes de uma nota existente', async () => {
            const res = await request(app)
                .get('/agent/service-notes/1')
                .set('X-Telegram-Init-Data', 'valid_token');

            expect(res.status).toBe(200);
            expect(res.body.title).toBe('Nota 1');
            expect(serviceNotes.getServiceNoteById).toHaveBeenCalledWith('1');
        });

        test('deve retornar 404 para nota inexistente', async () => {
            const res = await request(app)
                .get('/agent/service-notes/999')
                .set('X-Telegram-Init-Data', 'valid_token');

            expect(res.status).toBe(404);
        });
    });

    describe('PUT /agent/service-notes/:id/complete', () => {
        test('deve concluir uma nota atribuida ao agente', async () => {
            const res = await request(app)
                .put('/agent/service-notes/1/complete')
                .set('X-Telegram-Init-Data', 'valid_token')
                .send({ coordinates: '-5.0,-42.0', completionData: { obs: 'ok' } });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.note.status).toBe('CONCLUIDO');
            expect(serviceNotes.completeServiceNote).toHaveBeenCalledWith('1', {
                agentId: 'T001',
                coordinates: '-5.0,-42.0',
                completionData: { obs: 'ok' },
                completedAt: undefined,
            });
        });

        test('deve retornar 404 para nota nao atribuida ao agente', async () => {
            const res = await request(app)
                .put('/agent/service-notes/999/complete')
                .set('X-Telegram-Init-Data', 'valid_token')
                .send({});

            expect(res.status).toBe(404);
        });
    });

    describe('POST /agent/service-notes/self-register', () => {
        test('deve criar auto-registro com sucesso', async () => {
            const res = await request(app)
                .post('/agent/service-notes/self-register')
                .set('X-Telegram-Init-Data', 'valid_token')
                .send({ groupId: 1, coordinates: '-5.0,-42.0' });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.note.self_registered).toBe(true);
            expect(res.body.note.status).toBe('CONCLUIDO');
            expect(serviceNotes.selfRegisterServiceNote).toHaveBeenCalledWith({
                groupId: 1,
                agentId: 'T001',
                title: undefined,
                coordinates: '-5.0,-42.0',
                completionData: undefined,
                completedAt: undefined,
            });
        });

        test('deve retornar 400 se groupId nao for informado', async () => {
            const res = await request(app)
                .post('/agent/service-notes/self-register')
                .set('X-Telegram-Init-Data', 'valid_token')
                .send({});

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('groupId');
        });

        test('deve retornar 403 se grupo nao permitir criacao', async () => {
            serviceNotes.selfRegisterServiceNote.mockRejectedValueOnce(new Error('Voce nao tem permissao para registrar servicos neste grupo'));
            const res = await request(app)
                .post('/agent/service-notes/self-register')
                .set('X-Telegram-Init-Data', 'valid_token')
                .send({ groupId: 99 });

            expect(res.status).toBe(403);
        });
    });

    describe('GET /agent/service-notes/groups/visible', () => {
        test('deve listar grupos visiveis para o agente', async () => {
            const res = await request(app)
                .get('/agent/service-notes/groups/visible')
                .set('X-Telegram-Init-Data', 'valid_token');

            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(2);
            expect(serviceNotes.listVisibleGroups).toHaveBeenCalledWith('T001');
        });
    });

    describe('GET /agent/service-notes/groups/creatable', () => {
        test('deve listar grupos onde agente pode criar servicos', async () => {
            const res = await request(app)
                .get('/agent/service-notes/groups/creatable')
                .set('X-Telegram-Init-Data', 'valid_token');

            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(1);
            expect(res.body[0].allow_agent_creation).toBe(true);
            expect(serviceNotes.listCreatableGroups).toHaveBeenCalledWith('T001');
        });
    });

    describe('GET /agent/service-notes/groups/:groupId/categories', () => {
        test('deve listar categorias de um grupo', async () => {
            const res = await request(app)
                .get('/agent/service-notes/groups/1/categories')
                .set('X-Telegram-Init-Data', 'valid_token');

            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(1);
            expect(res.body[0].name).toBe('Categoria 1');
            expect(serviceNotes.listCategoriesByGroup).toHaveBeenCalledWith('1');
        });
    });

    describe('POST /agent/service-notes/create', () => {
        test('deve criar nota PENDENTE com auto-atribuicao', async () => {
            const res = await request(app)
                .post('/agent/service-notes/create')
                .set('X-Telegram-Init-Data', 'valid_token')
                .send({ group_id: 1, title: 'Nova nota', assignToSelf: true });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.note.status).toBe('PENDENTE');
            expect(res.body.note.assigned_to).toBe('T001');
            expect(serviceNotes.createAgentServiceNote).toHaveBeenCalledWith({
                group_id: 1,
                title: 'Nova nota',
                description: undefined,
                coordinates: undefined,
                latitude: undefined,
                longitude: undefined,
                address: undefined,
                marker_category_id: undefined,
                agentId: 'T001',
                assignToSelf: true,
            });
        });

        test('deve criar nota PENDENTE sem auto-atribuicao', async () => {
            const res = await request(app)
                .post('/agent/service-notes/create')
                .set('X-Telegram-Init-Data', 'valid_token')
                .send({ group_id: 1, title: 'Nova nota', assignToSelf: false });

            expect(res.status).toBe(201);
            expect(res.body.note.assigned_to).toBeNull();
        });

        test('deve retornar 400 sem group_id', async () => {
            const res = await request(app)
                .post('/agent/service-notes/create')
                .set('X-Telegram-Init-Data', 'valid_token')
                .send({ title: 'Sem grupo' });

            expect(res.status).toBe(400);
        });

        test('deve retornar 400 sem title', async () => {
            const res = await request(app)
                .post('/agent/service-notes/create')
                .set('X-Telegram-Init-Data', 'valid_token')
                .send({ group_id: 1, title: '' });

            expect(res.status).toBe(400);
        });

        test('deve retornar 403 se grupo nao permitir criacao', async () => {
            serviceNotes.createAgentServiceNote.mockRejectedValueOnce(new Error('Voce nao tem permissao para criar servicos neste grupo'));
            const res = await request(app)
                .post('/agent/service-notes/create')
                .set('X-Telegram-Init-Data', 'valid_token')
                .send({ group_id: 99, title: 'Teste' });

            expect(res.status).toBe(403);
        });
    });
});
