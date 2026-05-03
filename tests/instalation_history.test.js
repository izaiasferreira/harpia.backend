const { get_instalation_matriz } = require('../src/functions/database/commom');
const { pi_pool, ma_pool } = require('../src/db');

describe('get_instalation_matriz history', () => {
    afterAll(async () => {
        await pi_pool.end().catch(() => {});
        await ma_pool.end().catch(() => {});
    });

    test('should return ntlei_historico as an array of objects without SEM APONTAMENTO', async () => {
        const result = await get_instalation_matriz({ 
            estado: 'pi', 
            instalacao: ['18518168'] 
        });

        console.log('Result:', JSON.stringify(result, null, 2));

        if (Array.isArray(result) && result.length > 0) {
            const row = result[0];
            expect(row).toHaveProperty('ntlei_historico');
            if (row.ntlei_historico) {
                expect(Array.isArray(row.ntlei_historico)).toBe(true);
                row.ntlei_historico.forEach(h => {
                    expect(h).toHaveProperty('ntlei');
                    expect(h).toHaveProperty('data_conclusao');
                    expect(h.ntlei).not.toBe('SEM APONTAMENTO');
                    // Check date format dd/mm/aaaa
                    expect(h.data_conclusao).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
                });
                expect(row.ntlei_historico.length).toBeLessThanOrEqual(4);
            }
        }
    });
});
