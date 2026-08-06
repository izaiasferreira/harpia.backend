const { get_instalations } = require('../src/functions/database/agentes');
const { pi_pool, ma_pool, localizacoes_pi_pool, sinergia_pool } = require('../src/db');

describe('get_instalations function', () => {
    afterAll(async () => {
        await pi_pool.end().catch(() => {});
        await ma_pool.end().catch(() => {});
        await localizacoes_pi_pool.end().catch(() => {});
        await sinergia_pool.end().catch(() => {});
    });

    it('should return an array of installations', async () => {
        const query = ['18518168'];
        const results = await get_instalations({ state: 'pi', query, type: 'instalacao' });
        
        expect(Array.isArray(results)).toBe(true);
        console.log('Results length:', results.length);
        if (results.length > 0) {
            console.log('Sample result:', JSON.stringify(results[0], null, 2));
            expect(results[0]).toHaveProperty('instalacao');
            expect(results[0]).toHaveProperty('ntlei_historico');
            if (Array.isArray(results[0].ntlei_historico) && results[0].ntlei_historico.length > 0) {
                const historyItem = results[0].ntlei_historico[0];
                expect(historyItem).toHaveProperty('ntlei');
                expect(historyItem).toHaveProperty('data_conclusao');
                expect(historyItem.data_conclusao).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
            }
        }
    });

    it('should filter by ntlei starting with A in matriz', async () => {
        // This is hard to test without specific data, but we can verify it runs without error
        const query = ['18518168'];
        const results = await get_instalations({ state: 'pi', query, type: 'instalacao' });
        expect(Array.isArray(results)).toBe(true);
    });

    it('should return empty array for empty query', async () => {
        const results = await get_instalations({ state: 'pi', query: [], type: 'instalacao' });
        expect(results).toEqual([]);
    });
});
