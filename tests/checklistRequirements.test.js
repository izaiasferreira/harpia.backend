const { sinergia_pool } = require('../src/db');
const {
  getRequiredTemplatesForAgent,
  getAgentTemplatesStatus,
} = require('../src/functions/database/checklists');

jest.mock('../src/db', () => ({
  sinergia_pool: { query: jest.fn() },
  pi_pool: { query: jest.fn() },
  ma_pool: { query: jest.fn() },
  localizacoes_pi_pool: { query: jest.fn() }
}));

const AGENT_ID = '42';

function makeProfile(overrides = {}) {
  return {
    rows: [{
      cargo: 'NEGOCIADOR MOTOCICLISTA',
      regional: 'NORTE',
      seccional: 'UAC01',
      processo: 'PROC_A',
      estado: 'PI',
      situacao: 'active',
      is_gestor: false,
      ...overrides,
    }]
  };
}

function makeTemplate(id, data, overrides = {}) {
  return { id, title: `Template ${id}`, is_active: true, data, ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  sinergia_pool.query.mockResolvedValue({ rows: [] });
});

describe('getRequiredTemplatesForAgent', () => {
  test('agente inativo (situacao != active) retorna lista vazia', async () => {
    sinergia_pool.query.mockResolvedValueOnce(makeProfile({ situacao: 'inactive' }));
    const result = await getRequiredTemplatesForAgent(AGENT_ID);
    expect(result).toEqual([]);
    expect(sinergia_pool.query).toHaveBeenCalledTimes(1);
  });

  test('template sem filters é obrigatório para todos agentes ativos', async () => {
    sinergia_pool.query
      .mockResolvedValueOnce(makeProfile())
      .mockResolvedValueOnce({ rows: [makeTemplate('t1', null), makeTemplate('t2', {})] });
    const result = await getRequiredTemplatesForAgent(AGENT_ID);
    expect(result).toHaveLength(2);
    expect(result).toEqual([{ id: 't1', title: 'Template t1' }, { id: 't2', title: 'Template t2' }]);
  });

  test('filtro de cargo correspondente mantém o template', async () => {
    sinergia_pool.query
      .mockResolvedValueOnce(makeProfile())
      .mockResolvedValueOnce({ rows: [makeTemplate('t1', { filters: { cargo: ['NEGOCIADOR MOTOCICLISTA'] } })] });
    const result = await getRequiredTemplatesForAgent(AGENT_ID);
    expect(result).toHaveLength(1);
  });

  test('filtro de cargo diferente exclui o template', async () => {
    sinergia_pool.query
      .mockResolvedValueOnce(makeProfile())
      .mockResolvedValueOnce({ rows: [makeTemplate('t1', { filters: { cargo: ['COBRADOR MOTOCICLISTA'] } })] });
    const result = await getRequiredTemplatesForAgent(AGENT_ID);
    expect(result).toEqual([]);
  });

  test('OR dentro da mesma dimensão — qualquer valor casa', async () => {
    sinergia_pool.query
      .mockResolvedValueOnce(makeProfile())
      .mockResolvedValueOnce({ rows: [makeTemplate('t1', { filters: { cargo: ['LEITURISTA A PÉ', 'NEGOCIADOR MOTOCICLISTA'] } })] });
    const result = await getRequiredTemplatesForAgent(AGENT_ID);
    expect(result).toHaveLength(1);
  });

  test('AND entre dimensões — todas precisam casar', async () => {
    sinergia_pool.query
      .mockResolvedValueOnce(makeProfile())
      .mockResolvedValueOnce({ rows: [makeTemplate('t1', { filters: { cargo: ['NEGOCIADOR MOTOCICLISTA'], regional: ['NORTE'], seccional: ['UAC01'], processo: ['PROC_A'] } })] });
    const result = await getRequiredTemplatesForAgent(AGENT_ID);
    expect(result).toHaveLength(1);
  });

  test('AND entre dimensões — falha se uma dimensão não casar', async () => {
    sinergia_pool.query
      .mockResolvedValueOnce(makeProfile())
      .mockResolvedValueOnce({ rows: [makeTemplate('t1', { filters: { cargo: ['NEGOCIADOR MOTOCICLISTA'], regional: ['SUL'] } })] });
    const result = await getRequiredTemplatesForAgent(AGENT_ID);
    expect(result).toEqual([]);
  });

  test('matching case-insensitive', async () => {
    sinergia_pool.query
      .mockResolvedValueOnce(makeProfile({ cargo: 'negociador motociclista' }))
      .mockResolvedValueOnce({ rows: [makeTemplate('t1', { filters: { cargo: ['NEGOCIADOR MOTOCICLISTA'] } })] });
    const result = await getRequiredTemplatesForAgent(AGENT_ID);
    expect(result).toHaveLength(1);
  });
});

describe('getAgentTemplatesStatus', () => {
  test('sem templates obrigatórios → checklist_required false', async () => {
    sinergia_pool.query.mockResolvedValueOnce(makeProfile({ situacao: 'inactive' }));
    const result = await getAgentTemplatesStatus(AGENT_ID, '2026-08-06');
    expect(result).toEqual({ checklist_required: false, required_templates: [] });
  });

  test('marca submitted conforme checklists do dia', async () => {
    sinergia_pool.query
      .mockResolvedValueOnce(makeProfile())
      .mockResolvedValueOnce({ rows: [makeTemplate('t1', null), makeTemplate('t2', null)] })
      .mockResolvedValueOnce({ rows: [{ template_id: 't1' }] });
    const result = await getAgentTemplatesStatus(AGENT_ID, '2026-08-06');
    expect(result).toEqual({
      checklist_required: true,
      all_submitted: false,
      total_required: 2,
      total_submitted: 1,
      required_templates: [
        { id: 't1', title: 'Template t1', submitted: true },
        { id: 't2', title: 'Template t2', submitted: false },
      ],
    });
  });
});
