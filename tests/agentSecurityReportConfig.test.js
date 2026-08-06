const request = require('supertest');
const crypto = require('crypto');
const app = require('../src/app');
const { cenos_pool } = require('../src/db');

const AGENT_ID = 'TCFG01';
const TEST_TELEGRAM_ID = String(Math.floor(Math.random() * 1e9));
let AUTH_TOKEN = '';
let configId = null;

describe('Agent Security Report Config (GET /agent/v2/config)', () => {
    beforeAll(async () => {
        await cenos_pool.query(
            "INSERT INTO login (id, estado, telegram_id) VALUES ($1, 'pi', $2) ON CONFLICT (id) DO UPDATE SET telegram_id = $2, estado = 'pi'",
            [AGENT_ID, TEST_TELEGRAM_ID]
        );

        AUTH_TOKEN = crypto.randomBytes(32).toString('hex');
        await cenos_pool.query(
            `INSERT INTO telegram_tokens (token, telegram_user_id, expires_at)
             VALUES ($1, $2, NOW() + INTERVAL '1 day')`,
            [AUTH_TOKEN, TEST_TELEGRAM_ID]
        );

        const { rows } = await cenos_pool.query(
            `INSERT INTO security_report_configs (title, config_type, estado, data, is_active)
             VALUES ($1, 'hazards', 'pi', $2, true) RETURNING id`,
            ['Config teste', JSON.stringify({ perigos: [{ valor: 'Cão bravo', ordem: 1 }] })]
        );
        configId = rows[0].id;
    }, 30000);

    afterAll(async () => {
        if (configId) {
            await cenos_pool.query('DELETE FROM security_report_configs WHERE id = $1', [configId]);
        }
        await cenos_pool.query('DELETE FROM telegram_tokens WHERE token = $1', [AUTH_TOKEN]).catch(() => {});
        await cenos_pool.query('DELETE FROM login WHERE id = $1', [AGENT_ID]).catch(() => {});
    }, 15000);

    test('deve retornar 401 sem token', async () => {
        const res = await request(app).get('/agent/v2/config');
        expect(res.status).toBe(401);
    });

    test('deve retornar a config com perigos e tipos_acidente', async () => {
        const res = await request(app)
            .get('/agent/v2/config')
            .set('X-Telegram-Init-Data', AUTH_TOKEN);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('hasAccess', true);
        expect(res.body).toHaveProperty('perigos');
        expect(res.body).toHaveProperty('tipos_acidente');
        expect(res.body.perigos.some((p) => p.valor === 'Cão bravo')).toBe(true);
    });
});
