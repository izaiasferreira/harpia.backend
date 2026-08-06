const app = require('../src/app');
const request = require('supertest');
const crypto = require('crypto');
const { sinergia_pool } = require('../src/db');
const { insertStagingPoints, getStagingPendingCount, claimPendingBatch, markBatchDone } = require('../src/functions/database/trackingStaging');

const TEST_TELEGRAM_ID = '8469360771';
let AUTH_TOKEN = '';

beforeAll(async () => {
    // Insere agente de teste
    await sinergia_pool.query(
        "INSERT INTO login (id, estado, telegram_id) VALUES ('T12345', 'pi', $1) ON CONFLICT (id) DO UPDATE SET telegram_id = $1, estado = 'pi'",
        [TEST_TELEGRAM_ID]
    );

    AUTH_TOKEN = crypto.randomBytes(32).toString('hex');
    await sinergia_pool.query(
        `INSERT INTO telegram_tokens (token, telegram_user_id, expires_at) 
         VALUES ($1, $2, CURRENT_TIMESTAMP + interval '1 hour')`,
        [AUTH_TOKEN, TEST_TELEGRAM_ID]
    );
});

afterAll(async () => {
    // Limpa banco de dados de teste
    await sinergia_pool.query("DELETE FROM tracking_staging WHERE agent_id = 'T12345'").catch(() => {});
    await sinergia_pool.query("DELETE FROM tracking_session_points WHERE agent_id = 'T12345'").catch(() => {});
    await sinergia_pool.query("DELETE FROM telegram_tokens WHERE token = $1", [AUTH_TOKEN]).catch(() => {});
    await sinergia_pool.query("DELETE FROM login WHERE id = 'T12345'").catch(() => {});
});

const authHeader = () => ({ 'X-Telegram-Init-Data': AUTH_TOKEN });

describe('Staging Pipeline & sync-unified E2E', () => {
    it('deve aceitar pontos válidos no sync-unified e enfileirar no staging', async () => {
        const payload = {
            points: [
                {
                    lat: -3.7319,
                    lng: -38.5267,
                    speed: 10,
                    accuracy: 15.5,
                    batteryLevel: 0.85,
                    isCharging: false,
                    networkType: 'WIFI',
                    gpsEnabled: true,
                    deviceModel: 'TestPhone',
                    devicePlatform: 'Android',
                    osVersion: '13',
                    timestamp: Date.now()
                }
            ]
        };

        const res = await request(app)
            .post('/agent/tracking/sync-unified')
            .set(authHeader())
            .send(payload);

        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('synced', 1);
        expect(res.body).toHaveProperty('violations', 0); // Sempre 0 inicialmente no staging-first

        // Verifica se o ponto foi parar no staging
        const pendingCount = await getStagingPendingCount();
        expect(pendingCount).toBeGreaterThanOrEqual(1);
    });

    it('deve rejeitar requisições de sync-unified com payload inválido', async () => {
        const res = await request(app)
            .post('/agent/tracking/sync-unified')
            .set(authHeader())
            .send({});

        expect(res.statusCode).toBe(400);
    });
});
