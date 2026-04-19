# 08 — Módulos (Features)

> **Módulo**: `modules`  
> **Prefixo de rota**: `/api/v1/modules`

---

## 8.1. Visão Geral

**Módulo** é uma funcionalidade (feature) do sistema que vem do **próprio código**. São imutáveis - cada feature que você desenvolve vira um módulo:

- Desenvolveu feature de análise de pendências → vira módulo `analyze_pending`
- Desenvolveu consulta de instalações → vira módulo `installations`
- Desenvolveu busca de instalações → vira módulo `search_in`

### Exemplos

| ID | Nome | Descrição |
|----|------|----------|
| `search_in` | Busca de Instalações | Feature de busca por instalação, medidor ou conta |
| `justify_pending` | Justificar Pendências | Feature de justificar pendências |
| `create_justify` | Criar Justificativa | Feature de criar justificativas |
| `edit_justify` | Editar Justificativa | Feature de editar justificativas |
| `installations` | Instalações com Mapa | Feature de busca com mapa |
| `audit` | Auditoria | Feature de logs |
| `users` | Usuários | Feature de gerenciamento de usuários |
| `branches` | Filiais | Feature de gerenciamento de filiais |

---

## 8.2. Listar Módulos

### `GET /api/v1/modules`

**Descrição**: Listar todos os módulos disponíveis no sistema.

**Permissão**: `SUPER_ADMIN`, `SUPPORT`

**Response 200**:
```json
{
  "success": true,
  "data": [
    { "id": "search_in", "name": "Busca de Instalações" },
    { "id": "justify_pending", "name": "Justificar Pendências" },
    { "id": "create_justify", "name": "Criar Justificativa" },
    { "id": "installations", "name": "Instalações com Mapa" },
    { "id": "audit", "name": "Auditoria" }
  ]
}
```

---

## 8.3. Testes E2E

```typescript
describe('Modules', () => {
  describe('GET /api/v1/modules', () => {
    it('should list all modules for SUPER_ADMIN');
  });
});
```