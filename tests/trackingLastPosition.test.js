const { cenos_pool } = require('../src/db');
const { getAgentsLastPositionUnified } = require('../src/functions/database/trackingUnified');

const TEST_ID = 'T12345';
const TEST_ID_NO_POINTS = 'T99999';
const TEST_TELEGRAM_ID = '8469360771';

// Pontos de teste com recorded_at crescente (o mais recente deve ser retornado)
const POINTS = [
    { lat: -3.7319, lng: -38.5267, speed: 10.0, recorded_at: '2026-01-01 10:00:00' },
    { lat: -3.7319, lng: -38.5267, speed: 11.5, recorded_at: '2026-01-01 10:01:00' },
    { lat: -3.7319, lng: -38.5267, speed: 12.5, recorded_at: '2026-01-01 10:02:00' },
];

beforeAll(async () => {
    // Agente com pontos de tracking
    await cenos_pool.query(
        "INSERT INTO login (id, estado, telegram_id) VALUES ($1, 'pi', $2) ON CONFLICT (id) DO UPDATE SET telegram_id = $2, estado = 'pi'",
        [TEST_ID, TEST_TELEGRAM_ID]
    );
    await cenos_pool.query(
        `INSERT INTO colaboradores ("ID", "MAT", "Nome", "GESTOR IMEDIATO", "Cargo", "estado", "status")
         VALUES ($1, '12345', 'Agente de Teste', 'Victor', 'AG.COMER LEITURISTA/MOTOCICLIS', 'pi', TRUE)
         ON CONFLICT ("ID") DO UPDATE SET "status" = TRUE`,
        [TEST_ID]
    );
    for (const p of POINTS) {
        await cenos_pool.query(
            `INSERT INTO tracking_session_points (agent_id, latitude, longitude, speed, recorded_at)
             VALUES ($1, $2, $3, $4, $5)`,
            [TEST_ID, p.lat, p.lng, p.speed, p.recorded_at]
        );
    }

    // Agente sem pontos de tracking (deve ser excluído do resultado)
    await cenos_pool.query(
        `INSERT INTO colaboradores ("ID", "MAT", "Nome", "Cargo", "estado", "status")
         VALUES ($1, '99999', 'Agente Sem Ponto', 'AG.COMER LEITURISTA/MOTOCICLIS', 'pi', TRUE)
         ON CONFLICT ("ID") DO UPDATE SET "status" = TRUE`,
        [TEST_ID_NO_POINTS]
    );
});

afterAll(async () => {
    await cenos_pool.query("DELETE FROM tracking_session_points WHERE agent_id IN ($1, $2)", [TEST_ID, TEST_ID_NO_POINTS]).catch(() => {});
    await cenos_pool.query("DELETE FROM colaboradores WHERE \"ID\" IN ($1, $2)", [TEST_ID, TEST_ID_NO_POINTS]).catch(() => {});
    await cenos_pool.query("DELETE FROM login WHERE id = $1", [TEST_ID]).catch(() => {});
});

describe('getAgentsLastPositionUnified (LATERAL query)', () => {
    test('deve retornar o ponto mais recente de cada agente', async () => {
        const result = await getAgentsLastPositionUnified(null);
        const agent = result.find(r => r.agent_id === TEST_ID);

        expect(agent).toBeDefined();
        expect(Number(agent.latitude)).toBe(POINTS[2].lat);
        expect(Number(agent.longitude)).toBe(POINTS[2].lng);
        expect(Number(agent.speed)).toBe(POINTS[2].speed);

        const { rows } = await cenos_pool.query(
            `SELECT MAX(recorded_at) AS max_ts FROM tracking_session_points WHERE agent_id = $1`,
            [TEST_ID]
        );
        expect(agent.recorded_at.toISOString()).toBe(new Date(rows[0].max_ts).toISOString());
    });

    test('deve excluir agentes sem pontos de tracking', async () => {
        const result = await getAgentsLastPositionUnified(null);
        const missing = result.find(r => r.agent_id === TEST_ID_NO_POINTS);
        expect(missing).toBeUndefined();
    });
});
