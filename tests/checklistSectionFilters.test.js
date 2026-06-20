const { cenos_pool } = require('../src/db');
const { getTemplateById } = require('../src/functions/database/checklists');

jest.mock('../src/db', () => ({
  cenos_pool: { query: jest.fn() },
  pi_pool: { query: jest.fn() },
  ma_pool: { query: jest.fn() },
  localizacoes_pi_pool: { query: jest.fn() }
}));

const TEMPLATE_ID = '550e8400-e29b-41d4-a716-446655440000';
const AGENT_ID = 42;

function makeTemplate(data) {
  return { id: TEMPLATE_ID, title: 'Teste', is_active: true, data };
}

function makeProfile(cargo, regional, seccional, processo) {
  return { rows: [{ Cargo: cargo, regional, seccional, processo }] };
}

beforeEach(() => {
  jest.clearAllMocks();
  cenos_pool.query.mockResolvedValue({ rows: [] });
});

describe('getTemplateById — seção com filtros', () => {
  test('deve retornar null se template não existe', async () => {
    cenos_pool.query.mockResolvedValueOnce({ rows: [] });
    const result = await getTemplateById(TEMPLATE_ID, AGENT_ID);
    expect(result).toBeNull();
  });

  test('admin (sem agentId) vê todas as seções', async () => {
    cenos_pool.query.mockResolvedValueOnce({ rows: [makeTemplate({
      sections: [
        { title: 'Sec1', questions: [] },
        { title: 'Sec2', filters: { cargo: ['NEG'] }, questions: [] }
      ]
    })] });
    const result = await getTemplateById(TEMPLATE_ID);
    expect(result.data.sections).toHaveLength(2);
  });

  test('seção sem filters fica visível para todos', async () => {
    cenos_pool.query
      .mockResolvedValueOnce({ rows: [makeTemplate({
        sections: [{ title: 'Sec1', questions: [{ label: 'P1', exemption_days: 0 }] }]
      })] })
      .mockResolvedValueOnce(makeProfile('NEG', null, null, null));
    const result = await getTemplateById(TEMPLATE_ID, AGENT_ID);
    expect(result.data.sections).toHaveLength(1);
    expect(result.data.sections[0].title).toBe('Sec1');
  });

  test('agente com cargo correspondente vê a seção', async () => {
    cenos_pool.query
      .mockResolvedValueOnce({ rows: [makeTemplate({
        sections: [{ title: 'EPI', filters: { cargo: ['NEG'] }, questions: [] }]
      })] })
      .mockResolvedValueOnce(makeProfile('NEG', null, null, null));
    const result = await getTemplateById(TEMPLATE_ID, AGENT_ID);
    expect(result.data.sections).toHaveLength(1);
  });

  test('agente com cargo diferente NÃO vê a seção', async () => {
    cenos_pool.query
      .mockResolvedValueOnce({ rows: [makeTemplate({
        sections: [{ title: 'EPI', filters: { cargo: ['NEG'] }, questions: [] }]
      })] })
      .mockResolvedValueOnce(makeProfile('TEC', null, null, null));
    const result = await getTemplateById(TEMPLATE_ID, AGENT_ID);
    expect(result.data.sections).toHaveLength(0);
  });

  test('match OR dentro da lista de cargos', async () => {
    cenos_pool.query
      .mockResolvedValueOnce({ rows: [makeTemplate({
        sections: [{ title: 'Geral', filters: { cargo: ['NEG', 'SUP'] }, questions: [] }]
      })] })
      .mockResolvedValueOnce(makeProfile('SUP', null, null, null));
    const result = await getTemplateById(TEMPLATE_ID, AGENT_ID);
    expect(result.data.sections).toHaveLength(1);
  });

  test('match AND entre cargo e regional', async () => {
    cenos_pool.query
      .mockResolvedValueOnce({ rows: [makeTemplate({
        sections: [{
          title: 'Norte',
          filters: { cargo: ['NEG'], regional: ['NORTE'] },
          questions: []
        }]
      })] })
      .mockResolvedValueOnce(makeProfile('NEG', 'NORTE', null, null));
    const result = await getTemplateById(TEMPLATE_ID, AGENT_ID);
    expect(result.data.sections).toHaveLength(1);
  });

  test('AND entre categorias — falha se uma não bater', async () => {
    cenos_pool.query
      .mockResolvedValueOnce({ rows: [makeTemplate({
        sections: [{
          title: 'Norte',
          filters: { cargo: ['NEG'], regional: ['NORTE'] },
          questions: []
        }]
      })] })
      .mockResolvedValueOnce(makeProfile('NEG', 'SUL', null, null));
    const result = await getTemplateById(TEMPLATE_ID, AGENT_ID);
    expect(result.data.sections).toHaveLength(0);
  });

  test('filtro por seccional', async () => {
    cenos_pool.query
      .mockResolvedValueOnce({ rows: [makeTemplate({
        sections: [{ title: 'UAC01', filters: { seccional: ['UAC01'] }, questions: [] }]
      })] })
      .mockResolvedValueOnce(makeProfile(null, null, 'UAC01', null));
    const result = await getTemplateById(TEMPLATE_ID, AGENT_ID);
    expect(result.data.sections).toHaveLength(1);
  });

  test('filtro por processo', async () => {
    cenos_pool.query
      .mockResolvedValueOnce({ rows: [makeTemplate({
        sections: [{ title: 'ProcA', filters: { processo: ['PROC_A'] }, questions: [] }]
      })] })
      .mockResolvedValueOnce(makeProfile(null, null, null, 'PROC_A'));
    const result = await getTemplateById(TEMPLATE_ID, AGENT_ID);
    expect(result.data.sections).toHaveLength(1);
  });

  test('case-insensitive matching', async () => {
    cenos_pool.query
      .mockResolvedValueOnce({ rows: [makeTemplate({
        sections: [{ title: 'EPI', filters: { cargo: ['neg'] }, questions: [] }]
      })] })
      .mockResolvedValueOnce(makeProfile('NEG', null, null, null));
    const result = await getTemplateById(TEMPLATE_ID, AGENT_ID);
    expect(result.data.sections).toHaveLength(1);
  });

  test('agente sem perfil no JOIN vê seções sem filtro', async () => {
    cenos_pool.query
      .mockResolvedValueOnce({ rows: [makeTemplate({
        sections: [
          { title: 'Geral', questions: [] },
          { title: 'Restrito', filters: { cargo: ['NEG'] }, questions: [] }
        ]
      })] })
      .mockResolvedValueOnce({ rows: [{}] });
    const result = await getTemplateById(TEMPLATE_ID, AGENT_ID);
    expect(result.data.sections).toHaveLength(1);
    expect(result.data.sections[0].title).toBe('Geral');
  });
});
