const { cenos_pool } = require('../src/db');

jest.mock('../src/db', () => ({
    cenos_pool: { query: jest.fn() },
    pi_pool: { query: jest.fn() },
    ma_pool: { query: jest.fn() },
    localizacoes_pi_pool: { query: jest.fn() }
}));

const {
    delete_user_agent_admin
} = require('../src/functions/database/admin');

const ADMIN = { id: 1, role: 'COMPANY_ADMIN', permissions: [] };

// Agente armazenado com ID em minúsculo no banco (caso real: t61130)
const COLAB = [
    { 'ID': 't61130', 'MAT': '61130', 'Nome': 'Agente X', 'estado': 'pi', 'GESTOR IMEDIATO': 'G1', 'Cargo': 'FISCAL DE CAMPO', 'processo': 'LEITURA', regional: 'NORTE', seccional: 'S1', status: true, situacao: 'active' }
];

const mockPool = (overrides = {}) => {
    cenos_pool.query.mockImplementation((sql) => {
        const s = String(sql);
        if (s.includes('SELECT COUNT')) return Promise.resolve({ rows: overrides.count || [] });
        if (s.startsWith('SELECT * FROM colaboradores')) return Promise.resolve({ rows: overrides.colab || [] });
        if (s.includes('FROM login WHERE id IN')) return Promise.resolve({ rows: overrides.login || [] });
        if (s.includes('pin_status')) return Promise.resolve({ rows: overrides.pins || [] });
        if (s.includes('FROM inventory')) return Promise.resolve({ rows: overrides.inventory || [] });
        if (s.trim().toUpperCase().startsWith('DELETE')) return Promise.resolve({ rows: [], rowCount: 1 });
        return Promise.resolve({ rows: [] });
    });
};

beforeEach(() => {
    jest.clearAllMocks();
    cenos_pool.query.mockResolvedValue({ rows: [] });
});

describe('delete_user_agent_admin — exclusão case-insensitive', () => {
    test('deve usar TRIM(UPPER("ID")) no DELETE de colaboradores', async () => {
        mockPool({ colab: COLAB });
        const result = await delete_user_agent_admin({ id: 'T61130', user: ADMIN, deleteLogin: true });

        const delCall = cenos_pool.query.mock.calls.find(([sql]) => String(sql).includes('DELETE FROM colaboradores'));
        expect(delCall).toBeTruthy();
        expect(delCall[0]).toContain('TRIM(UPPER("ID")) = TRIM(UPPER($1))');
        expect(delCall[1][0]).toBe('T61130');
        expect(result).toEqual({ message: 'Usuário deletado com sucesso' });
    });

    test('deve encontrar agente com ID em case diferente no lookup', async () => {
        mockPool({ colab: COLAB });
        await delete_user_agent_admin({ id: 'T61130', user: ADMIN, deleteLogin: false });

        const colabCall = cenos_pool.query.mock.calls.find(([sql]) => String(sql).startsWith('SELECT * FROM colaboradores'));
        expect(colabCall[0]).toContain('UPPER("ID") = ANY(');
        expect(colabCall[1].find(p => Array.isArray(p) && p.includes('T61130'))).toEqual(['T61130']);
    });

    test('deve deletar da login quando deleteLogin=true', async () => {
        mockPool({ colab: COLAB });
        await delete_user_agent_admin({ id: 'T61130', user: ADMIN, deleteLogin: true });

        const loginDelCall = cenos_pool.query.mock.calls.find(([sql]) => String(sql).includes('DELETE FROM login'));
        expect(loginDelCall).toBeTruthy();
        expect(loginDelCall[0]).toContain('TRIM(UPPER(id)) = TRIM(UPPER($1))');
    });

    test('deve retornar erro quando usuário não existe', async () => {
        mockPool({ colab: [] });
        const result = await delete_user_agent_admin({ id: 'NAOEXISTE', user: ADMIN });
        expect(result.error).toBe('Usuário não encontrado');
    });
});
