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