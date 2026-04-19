# AGENTS.md - Diretrizes de Desenvolvimento

## Regras Obrigatórias

### Ao criar endpoint/feature:
1. **Atualizar documentação** em `API_DOC.md`
   - Adicionar descrição do endpoint
   - Documentar parâmetros e response
   - Incluir exemplos de request/response

2. **Criar teste** em `tests/`
   - Nome do arquivo: `{feature}.test.js`
   - Cobrir casos happy path e erros
   - Usar padrão: `test('descricao', async () => { ... })`

### Ao modificar código existente:
- Atualizar documentação afetada
- Adicionar/atualizar testes relevantes

## DIRECTRIZ CRÍTICA: Não Mexer em Rotas Existentes

**REGRA:** Nunca modificar endpoints, rotas ou funcionalidades existentes.
- Apenas criar NOVOS arquivos, NOVAS rotas, NOVAS features
- Sempre reaproveitar tabelas/funções existentes
- Se precisar adaptar algo, criar nova função em vez de modificar

**Exemplo de erro:**
- Mudar parâmetros de uma função existente

**Exemplo correto:**
- Criar nova função com parâmetros diferentes

### Estrutura de documentação (API_DOC.md):
```markdown
## POST /endpoint

Descrição breve.

### Body
| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| campo | string | sim | descrição |

### Response 200
```json
{}
```
```

### Padrão de teste:
```javascript
const request = require('supertest');
const app = require('../src/app');

describe('nome feature', () => {
  test('deve retornar 200', async () => {
    const res = await request(app).post('/endpoint').send({});
    expect(res.status).toBe(200);
  });
});
```