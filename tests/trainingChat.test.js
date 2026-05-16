const request = require('supertest');
const { generateToken } = require('../src/middlewares/jwtAuth');

jest.mock('../src/functions/database/users', () => ({
    getUserById: jest.fn(),
    createUser: jest.fn(),
    createUsersTable: jest.fn(() => Promise.resolve()),
    verifyUser: jest.fn(),
    updateLastLogin: jest.fn(),
    listUsers: jest.fn(),
    updateUser: jest.fn(),
    changePassword: jest.fn(),
    deleteUser: jest.fn()
}));

jest.mock('../src/functions/database/permissions', () => ({
    getUserModules: jest.fn(() => Promise.resolve(['trainings'])),
    createPermissionsTable: jest.fn(() => Promise.resolve()),
    getUserPermissions: jest.fn(() => Promise.resolve([]))
}));

jest.mock('../src/functions/database/trainingProjects', () => ({
    createTrainingProject: jest.fn(),
    getTrainingProjectById: jest.fn(),
    listTrainingProjects: jest.fn(),
    updateTrainingProject: jest.fn(),
    deleteTrainingProject: jest.fn(),
    updateTrainingFlow: jest.fn(),
    completeTrainingAndAssignBadge: jest.fn(),
}));

const mockGetChatMessages = jest.fn();
const mockAddChatMessage = jest.fn();
const mockClearChatMessages = jest.fn();
const mockSendTrainingChatMessage = jest.fn();

jest.mock('../src/functions/database/trainingChat', () => {
    const actual = jest.requireActual('../src/functions/database/trainingChat');
    return {
        ...actual,
        getChatMessages: mockGetChatMessages,
        addChatMessage: mockAddChatMessage,
        clearChatMessages: mockClearChatMessages,
        sendTrainingChatMessage: mockSendTrainingChatMessage,
    };
});

jest.mock('../src/llm', () => ({
    generateResponse: jest.fn(),
    generateResponseStream: jest.fn(),
    generateWithTools: jest.fn(),
}));

const llm = require('../src/llm');
const { getUserById } = require('../src/functions/database/users');
const { createTrainingProject } = require('../src/functions/database/trainingProjects');

describe('Training Chat', () => {
    let app;
    let token;
    let trainingId;
    const fakeTraining = { id: 42, name: 'Chat Test Training', description: 'For chat tests', user_id: 999 };

    beforeAll(async () => {
        const testUser = { id: 999, email: 'test@test.com', role: 'COMPANY_ADMIN', estado: 'pi' };
        getUserById.mockResolvedValue({ ...testUser, nome: 'Test User' });
        createTrainingProject.mockResolvedValue(fakeTraining);
        token = generateToken(testUser);

        app = require('../src/app');

        const res = await request(app)
            .post('/admin/training')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Chat Test Training', description: 'For chat tests' });
        trainingId = res.body.id;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockGetChatMessages.mockResolvedValue([]);
        mockAddChatMessage.mockImplementation((_trainingId, role, content) =>
            Promise.resolve({ id: Date.now(), role, content, created_at: new Date().toISOString() })
        );
        mockClearChatMessages.mockResolvedValue(undefined);
        mockSendTrainingChatMessage.mockImplementation((_trainingId, _message, _flowData, _selectedNodeIds) =>
            Promise.resolve({
                message: { id: 1, role: 'assistant', content: 'Resposta simulada', created_at: new Date().toISOString() },
                parsedStructure: null,
            })
        );
    });

    describe('GET /training/:id/chat', () => {
        test('deve retornar historico vazio para novo chat', async () => {
            const res = await request(app)
                .get(`/admin/training/${trainingId}/chat`)
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(mockGetChatMessages).toHaveBeenCalledWith(trainingId);
        });

        test('deve retornar 401 sem token', async () => {
            const res = await request(app).get(`/admin/training/${trainingId}/chat`);
            expect(res.status).toBe(401);
        });
    });

    describe('POST /training/:id/chat (non-streaming legacy)', () => {
        test('deve retornar 400 quando mensagem vazia', async () => {
            const res = await request(app)
                .post(`/admin/training/${trainingId}/chat`)
                .set('Authorization', `Bearer ${token}`)
                .send({ message: '' });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Mensagem é obrigatória');
        });

        test('deve processar mensagem com sucesso', async () => {
            const res = await request(app)
                .post(`/admin/training/${trainingId}/chat`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    message: 'Crie um slide de introducao',
                    currentFlowData: { nodes: [], edges: [] },
                });

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('message');
            expect(res.body).toHaveProperty('parsedStructure');
            expect(res.body.message.role).toBe('assistant');
            expect(res.body.message.content).toBe('Resposta simulada');
            expect(mockSendTrainingChatMessage).toHaveBeenCalledTimes(1);
        });
    });

    describe('POST /training/:id/chat/llm (LLM Proxy)', () => {
        test('deve retornar 400 quando messages vazio', async () => {
            const res = await request(app)
                .post(`/admin/training/${trainingId}/chat/llm`)
                .set('Authorization', `Bearer ${token}`)
                .send({ messages: [] });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Messages é obrigatório');
        });

        test('deve retornar toolCalls do LLM', async () => {
            llm.generateWithTools.mockResolvedValue({
                content: '',
                toolCalls: [
                    {
                        id: 'call_1',
                        type: 'function',
                        function: { name: 'list_nodes', arguments: '{}' },
                    },
                ],
            });

            const res = await request(app)
                .post(`/admin/training/${trainingId}/chat/llm`)
                .set('Authorization', `Bearer ${token}`)
                .send({ messages: [{ role: 'user', content: 'Liste os slides' }] });

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('content');
            expect(res.body).toHaveProperty('toolCalls');
            expect(res.body.toolCalls).toHaveLength(1);
            expect(res.body.toolCalls[0].function.name).toBe('list_nodes');
            expect(llm.generateWithTools).toHaveBeenCalledTimes(1);
        });

        test('deve retornar texto quando LLM nao usa tools', async () => {
            llm.generateWithTools.mockResolvedValue({
                content: 'Existem 5 slides no treinamento.',
                toolCalls: null,
            });

            const res = await request(app)
                .post(`/admin/training/${trainingId}/chat/llm`)
                .set('Authorization', `Bearer ${token}`)
                .send({ messages: [{ role: 'user', content: 'Quantos slides existem?' }] });

            expect(res.status).toBe(200);
            expect(res.body.content).toBe('Existem 5 slides no treinamento.');
            expect(res.body.toolCalls).toBeNull();
        });

        test('deve retornar 401 sem token', async () => {
            const res = await request(app)
                .post(`/admin/training/${trainingId}/chat/llm`)
                .send({ messages: [{ role: 'user', content: 'teste' }] });

            expect(res.status).toBe(401);
        });
    });

    describe('POST /training/:id/chat/messages', () => {
        test('deve salvar mensagem com sucesso', async () => {
            mockAddChatMessage.mockResolvedValue({
                id: 100, role: 'user', content: 'Mensagem de teste', created_at: new Date().toISOString()
            });

            const res = await request(app)
                .post(`/admin/training/${trainingId}/chat/messages`)
                .set('Authorization', `Bearer ${token}`)
                .send({ role: 'user', content: 'Mensagem de teste' });

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('id');
            expect(res.body.role).toBe('user');
            expect(res.body.content).toBe('Mensagem de teste');
            expect(mockAddChatMessage).toHaveBeenCalledWith(trainingId, 'user', 'Mensagem de teste');
        });

        test('deve retornar 400 sem role', async () => {
            const res = await request(app)
                .post(`/admin/training/${trainingId}/chat/messages`)
                .set('Authorization', `Bearer ${token}`)
                .send({ content: 'teste' });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('role e content são obrigatórios');
        });
    });

    describe('DELETE /training/:id/chat', () => {
        test('deve limpar historico com 200', async () => {
            const res = await request(app)
                .delete(`/admin/training/${trainingId}/chat`)
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(mockClearChatMessages).toHaveBeenCalledWith(trainingId);
        });
    });

    afterAll(async () => {
        jest.restoreAllMocks();
    });
});
