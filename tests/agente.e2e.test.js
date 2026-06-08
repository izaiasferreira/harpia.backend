const app = require('../src/app');
const request = require('supertest');
const crypto = require('crypto');
const { pi_pool, cenos_pool } = require('../src/db');

// ─── Configuração de teste ───────────────────────────────────────────────────
const TEST_TELEGRAM_ID = process.env.TEST_TELEGRAM_ID || '8469360771';
let AUTH_TOKEN = '';

// Dados de justificativa para os testes CRUD
const JUSTIFY_DATA = {
    instalacao: '18518168',
    data_leit_prev: '10/04/2026',
    tipo: 'cnl',
    motivo: 'Medidor com defeito',
    justificativa: 'Realmente estava com defeito',
    foto: 'base64_string_aqui'
};

let createdJustifyId = null;

// ─── Setup / Teardown ────────────────────────────────────────────────────────
beforeAll(async () => {
    // Insert agent to satisfy authentication
    await cenos_pool.query(
        "INSERT INTO login (id, estado, telegram_id) VALUES ('T12345', 'pi', $1) ON CONFLICT (id) DO UPDATE SET telegram_id = $1, estado = 'pi'",
        [TEST_TELEGRAM_ID]
    );
    await pi_pool.query("DELETE FROM colaboradores WHERE \"ID\" = 'T12345'").catch(() => {});
    await pi_pool.query(
        `INSERT INTO colaboradores ("ID", "MAT", "Nome", "GESTOR IMEDIATO", "Cargo") 
         VALUES ('T12345', '12345', 'Agente de Teste', 'Victor', 'AG.COMER LEITURISTA/MOTOCICLIS')`
    ).catch(() => {});
    // Criar token de teste programaticamente
    AUTH_TOKEN = crypto.randomBytes(32).toString('hex');

    

    await pi_pool.query(
        `INSERT INTO telegram_tokens (token, telegram_user_id, expires_at) 
         VALUES ($1, $2, CURRENT_TIMESTAMP + interval '1 hour')`,
        [AUTH_TOKEN, TEST_TELEGRAM_ID]
    );

    // Limpar justificativas de teste anteriores (caso existam)
    await pi_pool.query(
        `DELETE FROM justificativas WHERE instalacao = $1 AND data_leit_prev = $2`,
        [JUSTIFY_DATA.instalacao, JUSTIFY_DATA.data_leit_prev]
    ).catch(() => { /* tabela pode não existir ainda */ });
}, 30000);

afterAll(async () => {
    await cenos_pool.query("DELETE FROM login WHERE id = 'T12345'").catch(() => {});
    await pi_pool.query("DELETE FROM colaboradores WHERE \"ID\" = 'T12345'").catch(() => {});
    // Limpar token de teste
    await cenos_pool.query('DELETE FROM telegram_tokens WHERE token = $1', [AUTH_TOKEN]).catch(() => {});

    // Limpar justificativas de teste
    await pi_pool.query(
        `DELETE FROM justificativas WHERE instalacao = $1 AND data_leit_prev = $2`,
        [JUSTIFY_DATA.instalacao, JUSTIFY_DATA.data_leit_prev]
    ).catch(() => {});

    // Fechar pools
    await pi_pool.end().catch(() => {});
}, 15000);

// ─── Helper ──────────────────────────────────────────────────────────────────
const authHeader = () => ({ 'X-Telegram-Init-Data': AUTH_TOKEN });

// ═══════════════════════════════════════════════════════════════════════════════
// TESTES
// ═══════════════════════════════════════════════════════════════════════════════

describe('Agente Routes (E2E)', () => {

    // ─── Autenticação ────────────────────────────────────────────────────────
describe('Autenticação', () => {
        it('deve retornar 401 sem header de autenticação', async () => {
            const res = await request(app).get('/agent/agent_data');
            expect(res.statusCode).toBe(401);
            expect(res.body).toHaveProperty('error');
        }, 15000);

        it('deve retornar 403 com token inválido', async () => {
            const res = await request(app)
                .get('/agent/agent_data')
                .set('X-Telegram-Init-Data', 'token_invalido_123');
            expect(res.statusCode).toBe(403);
        }, 15000);
    });

    // ─── Dados do Agente ─────────────────────────────────────────────────────
    describe('GET /agent_data', () => {
        it('deve retornar id e estado do colaborador', async () => {
            const res = await request(app)
                .get('/agent/agent_data')
                .set(authHeader());
            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('id');
            expect(res.body).toHaveProperty('estado');
        }, 15000);
    });

    // ─── Dashboard ───────────────────────────────────────────────────────────
    describe('GET /agent_dashboard', () => {
        it('deve retornar layout e array de widgets', async () => {
            const res = await request(app)
                .get('/agent/agent_dashboard')
                .set(authHeader());
            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('layout');
            expect(res.body.layout).toHaveProperty('columns');
            expect(res.body).toHaveProperty('widgets');
            expect(Array.isArray(res.body.widgets)).toBe(true);
            
            if (res.body.widgets.length > 0) {
                expect(res.body.widgets[0]).toHaveProperty('id');
                expect(res.body.widgets[0]).toHaveProperty('type');
                expect(res.body.widgets[0]).toHaveProperty('data');
            }
        }, 30000);
    });

    // ─── Estatísticas (Legado) ───────────────────────────────────────────────
    describe('GET /agent_statistics', () => {
        it('deve retornar array de estatísticas com campos obrigatórios', async () => {
            const res = await request(app)
                .get('/agent/agent_statistics')
                .set(authHeader());
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            if (res.body.length > 0) {
                expect(res.body[0]).toHaveProperty('title');
                expect(res.body[0]).toHaveProperty('value');
                expect(res.body[0]).toHaveProperty('color');
                expect(res.body[0]).toHaveProperty('filter');
            }
        }, 90000);
    });

    describe('GET /agent_statistics_more', () => {
        it('deve retornar array de estatísticas complementares', async () => {
            const res = await request(app)
                .get('/agent/agent_statistics_more')
                .set(authHeader());
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            if (res.body.length > 0) {
                expect(res.body[0]).toHaveProperty('title');
                expect(res.body[0]).toHaveProperty('filter');
            }
        }, 90000);
    });

    // ─── Serviços ────────────────────────────────────────────────────────────
    describe('GET /agent_services', () => {
        it('deve retornar array de leituras', async () => {
            const res = await request(app)
                .get('/agent/agent_services')
                .set(authHeader());
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        }, 90000);

        it('deve aceitar filtro por tipo', async () => {
            const res = await request(app)
                .get('/agent/agent_services?filter=cnl')
                .set(authHeader());
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        }, 90000);
    });

    // ─── Last Update ─────────────────────────────────────────────────────────
    describe('GET /last_update_agent', () => {
        it('deve retornar objeto com title e value', async () => {
            const res = await request(app)
                .get('/agent/last_update_agent')
                .set(authHeader());
            expect(res.statusCode).toBe(200);
            // Pode retornar null se não houver dados, ou um objeto com title
            if (res.body) {
                expect(res.body).toHaveProperty('title');
            }
        }, 30000);
    });

    // ─── Custom Links ────────────────────────────────────────────────────────
    describe('GET /custom_links', () => {
        it('deve retornar array de links', async () => {
            const res = await request(app)
                .get('/agent/custom_links')
                .set(authHeader());
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        }, 15000);
    });

    // ─── Predicted ───────────────────────────────────────────────────────────
    describe('GET /predicted', () => {
        it('deve retornar array de serviços com perdas', async () => {
            const res = await request(app)
                .get('/agent/predicted')
                .set(authHeader());
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        }, 90000);
    });

    // ─── Search In ───────────────────────────────────────────────────────────
    describe('POST /search_in', () => {
        it('deve retornar 400 se queries vazio', async () => {
            const res = await request(app)
                .post('/agent/search_in')
                .set(authHeader())
                .send({ type: 'instalacao', queries: [] });
            expect(res.statusCode).toBe(400);
            expect(res.body).toHaveProperty('error');
        }, 15000);

        it('deve retornar 400 se mais de 10 queries', async () => {
            const queries = Array.from({ length: 11 }, (_, i) => `${10000000 + i}`);
            const res = await request(app)
                .post('/agent/search_in')
                .set(authHeader())
                .send({ type: 'instalacao', queries });
            expect(res.statusCode).toBe(400);
            expect(res.body.error).toContain('máximo 10');
        }, 15000);

        it('deve retornar resultado para queries válidas', async () => {
            const res = await request(app)
                .post('/agent/search_in')
                .set(authHeader())
                .send({ type: 'instalacao', queries: ['18518168'] });
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        }, 30000);
    });

    // ═══════════════════════════════════════════════════════════════════════════════
    // CRUD de JUSTIFICATIVAS (fluxo sequencial)
    // ═══════════════════════════════════════════════════════════════════════════════
    describe('Justificativas CRUD Flow', () => {

        // 1. Criar
        it('POST /create_justify — deve criar uma justificativa', async () => {
            const res = await request(app)
                .post('/agent/create_justify')
                .set(authHeader())
                .send(JUSTIFY_DATA);

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('id');
            expect(res.body.instalacao).toBe(JUSTIFY_DATA.instalacao);
            expect(res.body.tipo).toBe(JUSTIFY_DATA.tipo);
            expect(res.body.motivo).toBe(JUSTIFY_DATA.motivo);
            expect(res.body.justificativa).toBe(JUSTIFY_DATA.justificativa);
            createdJustifyId = res.body.id;
        }, 30000);

        // 2. Duplicata
        it('POST /create_justify — deve rejeitar duplicata', async () => {
            const res = await request(app)
                .post('/agent/create_justify')
                .set(authHeader())
                .send(JUSTIFY_DATA);

            expect(res.statusCode).toBe(400);
            expect(res.body.error).toContain('já criada');
        }, 30000);

        // 3. Consultar
        it('GET /get_justify — deve encontrar a justificativa criada', async () => {
            const res = await request(app)
                .get(`/agent/get_justify?instalacao=${JUSTIFY_DATA.instalacao}&tipo=${JUSTIFY_DATA.tipo}&data_leit_prev=${encodeURIComponent(JUSTIFY_DATA.data_leit_prev)}`)
                .set(authHeader());

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('id');
            expect(res.body.instalacao).toBe(JUSTIFY_DATA.instalacao);
        }, 30000);

        // 4. Atualizar
        it('PUT /update_justify — deve atualizar o motivo', async () => {
            expect(createdJustifyId).not.toBeNull();

            const res = await request(app)
                .put('/agent/update_justify')
                .set(authHeader())
                .send({
                    id: createdJustifyId,
                    motivo: 'Medidor trocado pelo eletricista'
                });

            expect(res.statusCode).toBe(200);
            expect(res.body.id).toBe(createdJustifyId);
            expect(res.body.motivo).toBe('Medidor trocado pelo eletricista');
            expect(res.body.updated_at).toBeTruthy();
        }, 30000);

        // 5. Verificar atualização
        it('GET /get_justify — deve refletir a atualização', async () => {
            const res = await request(app)
                .get(`/agent/get_justify?instalacao=${JUSTIFY_DATA.instalacao}&tipo=${JUSTIFY_DATA.tipo}&data_leit_prev=${encodeURIComponent(JUSTIFY_DATA.data_leit_prev)}`)
                .set(authHeader());

            expect(res.statusCode).toBe(200);
            expect(res.body.motivo).toBe('Medidor trocado pelo eletricista');
        }, 30000);

        // 6. Update sem ID retorna 400
        it('PUT /update_justify — deve retornar 400 sem ID', async () => {
            const res = await request(app)
                .put('/agent/update_justify')
                .set(authHeader())
                .send({ motivo: 'Teste sem ID' });

            expect(res.statusCode).toBe(400);
            expect(res.body.error).toContain('obrigatório');
        }, 15000);

        // 7. Update com ID inexistente retorna 404
        it('PUT /update_justify — deve retornar 404 para ID inexistente', async () => {
            const res = await request(app)
                .put('/agent/update_justify')
                .set(authHeader())
                .send({ id: 999999, motivo: 'Teste' });

            expect(res.statusCode).toBe(404);
        }, 15000);

        // 8. Delete com ID inexistente retorna 404
        it('DELETE /delete_justify/:id — deve retornar 404 para ID inexistente', async () => {
            const res = await request(app)
                .delete('/agent/delete_justify/999999')
                .set(authHeader());

            expect(res.statusCode).toBe(404);
        }, 15000);

        // 9. Deletar
        it('DELETE /delete_justify/:id — deve deletar a justificativa', async () => {
            expect(createdJustifyId).not.toBeNull();

            const res = await request(app)
                .delete(`/agent/delete_justify/${createdJustifyId}`)
                .set(authHeader());

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('success', true);
            expect(res.body.deleted).toHaveProperty('id', createdJustifyId);
        }, 30000);

        // 10. Confirmar exclusão
        it('GET /get_justify — não deve encontrar após exclusão', async () => {
            const res = await request(app)
                .get(`/agent/get_justify?instalacao=${JUSTIFY_DATA.instalacao}&tipo=${JUSTIFY_DATA.tipo}&data_leit_prev=${encodeURIComponent(JUSTIFY_DATA.data_leit_prev)}`)
                .set(authHeader());

            expect(res.statusCode).toBe(200);
            // Deve retornar objeto vazio (sem id) quando não encontra
            expect(res.body).not.toHaveProperty('id');
        }, 30000);
    });

    // ─── Dados do Agente ─────────────────────────────────────────────────────
    describe('GET /agent_data', () => {
        it('deve retornar id e estado do colaborador', async () => {
            const res = await request(app)
                .get('/agent/agent_data')
                .set(authHeader());
            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('id');
            expect(res.body).toHaveProperty('estado');
        }, 15000);
    });

    // ─── Dashboard ───────────────────────────────────────────────────────────
    describe('GET /agent_dashboard', () => {
        it('deve retornar layout e array de widgets', async () => {
            const res = await request(app)
                .get('/agent/agent_dashboard')
                .set(authHeader());
            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('layout');
            expect(res.body.layout).toHaveProperty('columns');
            expect(res.body).toHaveProperty('widgets');
            expect(Array.isArray(res.body.widgets)).toBe(true);
            
            if (res.body.widgets.length > 0) {
                expect(res.body.widgets[0]).toHaveProperty('id');
                expect(res.body.widgets[0]).toHaveProperty('type');
                expect(res.body.widgets[0]).toHaveProperty('data');
            }
        }, 30000);
    });

    // ─── Estatísticas (Legado) ────────────────────────────────────────────────
    describe('GET /agent_statistics', () => {
        it('deve retornar array de estatísticas com campos obrigatórios', async () => {
            const res = await request(app)
                .get('/agent/agent_statistics')
                .set(authHeader());
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            if (res.body.length > 0) {
                expect(res.body[0]).toHaveProperty('title');
                expect(res.body[0]).toHaveProperty('value');
                expect(res.body[0]).toHaveProperty('color');
                expect(res.body[0]).toHaveProperty('filter');
            }
        }, 90000);
    });

    describe('GET /agent_statistics_more', () => {
        it('deve retornar array de estatísticas complementares', async () => {
            const res = await request(app)
                .get('/agent/agent_statistics_more')
                .set(authHeader());
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            if (res.body.length > 0) {
                expect(res.body[0]).toHaveProperty('title');
                expect(res.body[0]).toHaveProperty('filter');
            }
        }, 90000);
    });

    // ─── Serviços ────────────────────────────────────────────────────────────
    describe('GET /agent_services', () => {
        it('deve retornar array de leituras', async () => {
            const res = await request(app)
                .get('/agent/agent_services')
                .set(authHeader());
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        }, 90000);

        it('deve aceitar filtro por tipo', async () => {
            const res = await request(app)
                .get('/agent/agent_services?filter=cnl')
                .set(authHeader());
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        }, 90000);
    });

    // ─── Last Update ─────────────────────────────────────────────────────���───
    describe('GET /last_update_agent', () => {
        it('deve retornar objeto com title e value', async () => {
            const res = await request(app)
                .get('/agent/last_update_agent')
                .set(authHeader());
            expect(res.statusCode).toBe(200);
            // Pode retornar null se não houver dados, ou um objeto com title
            if (res.body) {
                expect(res.body).toHaveProperty('title');
            }
        }, 30000);
    });

    // ─── Custom Links ────────────────────────────────────────────────────────
    describe('GET /custom_links', () => {
        it('deve retornar array de links', async () => {
            const res = await request(app)
                .get('/agent/custom_links')
                .set(authHeader());
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        }, 15000);
    });

    // ─── Predicted ───────────────────────────────────────────────────────────
    describe('GET /predicted', () => {
        it('deve retornar array de serviços com perdas', async () => {
            const res = await request(app)
                .get('/agent/predicted')
                .set(authHeader());
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        }, 90000);
    });

    // ─── Search In ───────────────────────────────────────────────────────────
    describe('POST /search_in', () => {
        it('deve retornar 400 se queries vazio', async () => {
            const res = await request(app)
                .post('/agent/search_in')
                .set(authHeader())
                .send({ type: 'instalacao', queries: [] });
            expect(res.statusCode).toBe(400);
            expect(res.body).toHaveProperty('error');
        }, 15000);

        it('deve retornar 400 se mais de 10 queries', async () => {
            const queries = Array.from({ length: 11 }, (_, i) => `${10000000 + i}`);
            const res = await request(app)
                .post('/agent/search_in')
                .set(authHeader())
                .send({ type: 'instalacao', queries });
            expect(res.statusCode).toBe(400);
            expect(res.body.error).toContain('máximo 10');
        }, 15000);

        it('deve retornar resultado para queries válidas', async () => {
            const res = await request(app)
                .post('/agent/search_in')
                .set(authHeader())
                .send({ type: 'instalacao', queries: ['18518168'] });
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        }, 30000);
    });

    // ═════════════════════════════════════════════════════════════════
    // CRUD de JUSTIFICATIVAS (fluxo sequencial)
    // ═════════════════════════════════════════════════════════════════
    describe('Justificativas CRUD Flow', () => {

        // 1. Criar
        it('POST /create_justify — deve criar uma justificativa', async () => {
            const res = await request(app)
                .post('/agent/create_justify')
                .set(authHeader())
                .send(JUSTIFY_DATA);

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('id');
            expect(res.body.instalacao).toBe(JUSTIFY_DATA.instalacao);
            expect(res.body.tipo).toBe(JUSTIFY_DATA.tipo);
            expect(res.body.motivo).toBe(JUSTIFY_DATA.motivo);
            expect(res.body.justificativa).toBe(JUSTIFY_DATA.justificativa);
            createdJustifyId = res.body.id;
        }, 30000);

        // 2. Duplicata
        it('POST /create_justify — deve rejeitar duplicata', async () => {
            const res = await request(app)
                .post('/agent/create_justify')
                .set(authHeader())
                .send(JUSTIFY_DATA);

            expect(res.statusCode).toBe(400);
            expect(res.body.error).toContain('já criada');
        }, 30000);

        // 3. Consultar
        it('GET /get_justify — deve encontrar a justificativa criada', async () => {
            const res = await request(app)
                .get(`/agent/get_justify?instalacao=${JUSTIFY_DATA.instalacao}&tipo=${JUSTIFY_DATA.tipo}&data_leit_prev=${encodeURIComponent(JUSTIFY_DATA.data_leit_prev)}`)
                .set(authHeader());

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('id');
            expect(res.body.instalacao).toBe(JUSTIFY_DATA.instalacao);
        }, 30000);

        // 4. Atualizar
        it('PUT /update_justify — deve atualizar o motivo', async () => {
            expect(createdJustifyId).not.toBeNull();

            const res = await request(app)
                .put('/agent/update_justify')
                .set(authHeader())
                .send({
                    id: createdJustifyId,
                    motivo: 'Medidor trocado pelo eletricista'
                });

            expect(res.statusCode).toBe(200);
            expect(res.body.id).toBe(createdJustifyId);
            expect(res.body.motivo).toBe('Medidor trocado pelo eletricista');
            expect(res.body.updated_at).toBeTruthy();
        }, 30000);

        // 5. Verificar atualização
        it('GET /get_justify — deve refletir a atualização', async () => {
            const res = await request(app)
                .get(`/agent/get_justify?instalacao=${JUSTIFY_DATA.instalacao}&tipo=${JUSTIFY_DATA.tipo}&data_leit_prev=${encodeURIComponent(JUSTIFY_DATA.data_leit_prev)}`)
                .set(authHeader());

            expect(res.statusCode).toBe(200);
            expect(res.body.motivo).toBe('Medidor trocado pelo eletricista');
        }, 30000);

        // 6. Update sem ID retorna 400
        it('PUT /update_justify — deve retornar 400 sem ID', async () => {
            const res = await request(app)
                .put('/agent/update_justify')
                .set(authHeader())
                .send({ motivo: 'Teste sem ID' });

            expect(res.statusCode).toBe(400);
            expect(res.body.error).toContain('obrigatório');
        }, 15000);

        // 7. Update com ID inexistente retorna 404
        it('PUT /update_justify — deve retornar 404 para ID inexistente', async () => {
            const res = await request(app)
                .put('/agent/update_justify')
                .set(authHeader())
                .send({ id: 999999, motivo: 'Teste' });

            expect(res.statusCode).toBe(404);
        }, 15000);

        // 8. Delete com ID inexistente retorna 404
        it('DELETE /delete_justify/:id — deve retornar 404 para ID inexistente', async () => {
            const res = await request(app)
                .delete('/agent/delete_justify/999999')
                .set(authHeader());

            expect(res.statusCode).toBe(404);
        }, 15000);

        // 9. Deletar
        it('DELETE /delete_justify/:id — deve deletar a justificativa', async () => {
            expect(createdJustifyId).not.toBeNull();

            const res = await request(app)
                .delete(`/agent/delete_justify/${createdJustifyId}`)
                .set(authHeader());

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('success', true);
            expect(res.body.deleted).toHaveProperty('id', createdJustifyId);
        }, 30000);

        // 10. Confirmar exclusão
        it('GET /get_justify — não deve encontrar após exclusão', async () => {
            const res = await request(app)
                .get(`/agent/get_justify?instalacao=${JUSTIFY_DATA.instalacao}&tipo=${JUSTIFY_DATA.tipo}&data_leit_prev=${encodeURIComponent(JUSTIFY_DATA.data_leit_prev)}`)
                .set(authHeader());

            expect(res.statusCode).toBe(200);
            // Deve retornar objeto vazio (sem id) quando não encontra
            expect(res.body).not.toHaveProperty('id');
        }, 30000);
    });
});
