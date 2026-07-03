# Sistema de Permissões e Filtros de Acesso

## Visão Geral

Este documento descreve tecnicamente o sistema de permissões implementado no backend, que controla o acesso aos dados dos colaboradores (agentes) baseado em filtros hierárquicos.

---

## Arquitetura

### Estrutura de Permissões

As permissões são armazenadas no banco de dados com a seguinte estrutura:

```sql
-- Tabela de permissões
permissions:
  - id: UUID
  - name: String (nome da permissão)
  - slug: String (identificador único)
  - description: String
  - modules: Array (módulos que a permissão acesso)
  - filters: Array (filtros de acesso)
  - estado: String (estado padrão)
  - ativo: Boolean

-- Tabela de associação usuário-permissão
user_permissions:
  - user_id: UUID
  - permission_id: UUID
  - state: String
```

### Estrutura dos Filtros

Cada permissão pode conter múltiplos filtros no formato:

```javascript
{
  type: 'estado' | 'regional' | 'seccional' | 'gestor',
  value: string  // valor do filtro
}
```

**Tipos de filtro suportados:**
- `estado`: Estado do agente (pi, ma)
- `regional`: Regional dentro do estado
- `seccional`: Seccional/UAC dentro da regional
- `gestor`: Gestor imediato do agente

---

## Funções Principais

### 1. getColaboradoresFilter

Localização: `back/src/functions/database/admin.js`

Esta é a função principal que gera as condições SQL para filtrar colaboradores baseado nas permissões do usuário.

```javascript
const getColaboradoresFilter = (user, options = {}) => {
    const { includeAllStates = true } = options;
    // Retorna: { whereClause, params, allowedStates, isAdmin }
}
```

**Parâmetros:**
- `user`: Objeto do usuário logado (req.user)
- `options`: Opções adicionais
  - `includeAllStates`: Se true, retorna todos os estados permitidos como array

**Retorna:**
```javascript
{
    whereClause: "estado = $1 AND regional = $2",
    params: ['pi', 'norte'],
    allowedStates: ['pi'],
    isAdmin: false
}
```

### 2. checkAgentPermission

Verifica se um agente específico está dentro das permissões do usuário.

```javascript
const checkAgentPermission = (agentData, user) => {
    // agentData: { id, nome, regional, seccional, estado, gestor }
    // Retorna: true | false
}
```

### 3. userIsAdmin

Verifica se o usuário é administrador (papel contém "admin").

```javascript
const userIsAdmin = (user) => {
    // Retorna: true se role contém 'admin'
}
```

---

## Lógica de Filtragem

### Coleta de Permissões

```javascript
// Obtém todas as permissões do usuário
const userFilters = user?.permissions?.map(p => p.filters).flat() || [];

// Organiza por tipo
const userFiltersByType = {
    'estado': ['pi', 'ma'],
    'regional': ['norte', 'sul'],
    'seccional': ['uac1', 'uac2'],
    'gestor': ['joao', 'maria']
};
```

### Aplicação de Filtros

**OR dentro do mesmo tipo:**
```sql
-- Se usuário tem permissão para PI e MA:
estado = ANY(ARRAY['pi', 'ma'])

-- Se usuário tem permissão para Norte e Sul:
regional = ANY(ARRAY['norte', 'sul'])
```

**AND entre tipos diferentes:**
```sql
-- Estado (OR) AND Regional (OR)
(estado = 'pi' OR estado = 'ma') AND (regional = 'norte' OR regional = 'sul')
```

### Exemplo Prático

**Cenário:** Usuário com 2 permissões
- Permissão 1: estado=PI, regional=Norte
- Permissão 2: estado=MA, regional=Sul

**Resultado:** Sistema retorna agentes que são:
- (PI E Norte) OU (MA E Sul)

---

## Fluxo de Execução

### 1. Requisição Chega ao Endpoint

```javascript
// Exemplo: GET /admin/users_agents
router.get('/users_agents', verifyToken(), verifyModule('users_agents'), async (req, res) => {
    const users = await get_users_agents_admin({ user: req.user });
    res.json(users);
});
```

### 2. Função de Banco Recebe user

```javascript
async function get_users_agents_admin({ user, ...params }) {
    const filter = getColaboradoresFilter(user, { includeAllStates: true });
    
    // filter.whereClause contém as condições SQL
    // filter.params contém os valores
    
    let query = `SELECT * FROM colaboradores ${filter.whereClause}`;
    const { rows } = await cenos_pool.query(query, filter.params);
    
    return rows;
}
```

### 3. Retorno Filtrado

O sistema retorna apenas os registros que o usuário tem permissão de visualizar.

---

## Endpoints que Utilizam o Sistema

### Funções de Banco de Dados

| Função | Arquivo | Descrição |
|--------|---------|-----------|
| `get_users_agents_admin` | admin.js | Lista colaboradores |
| `get_inventory_admin` | admin.js | Lista inventário |
| `get_justify_admin` | admin.js | Lista justificativas |
| `get_daily_reports_admin` | admin.js | Lista reports diários |
| `get_accidents_admin` | accidents.js | Lista acidentes |
| `get_rooms_for_admin` | chat.js | Lista salas de chat |
| `listAgents` | serviceNotesChat.js | Lista agentes (service notes) |
| `listPins` | appPins.js | Lista PINs de acesso |
| `getAgentsHeartbeat` | heartbeat.js | Lista heartbeats |
| `getFallIncidents` | tracking.js | Lista incidentes de queda |
| `getDashboardFilterOptions` | checklistDashboard.js | Opções de filtro do dashboard |
| `getDashboardStats` | checklistDashboard.js | Estatísticas do dashboard |
| `listChecklistsAdmin` | checklists.js | Lista checklists |
| `listActiveExemptions` | agentExemptions.js | Lista isenções |

### Rotas HTTP

| Rota | Arquivo | Descrição |
|------|---------|-----------|
| `GET /admin/users_agents` | adminModules.js | Lista colaboradores |
| `GET /admin/users_agents/options` | adminModules.js | Opções de filtro |
| `GET /admin/inventory` | adminModules.js | Lista inventário |
| `GET /admin/justify` | adminModules.js | Lista justificativas |
| `GET /admin/daily-reports` | adminModules.js | Lista reports diários |
| `GET /admin/chat/rooms` | adminChat.js | Lista salas de chat |
| `GET /admin/agent/app_pins` | adminAppPins.js | Lista PINs |
| `GET /admin/tracking/agents-v2` | adminHeartbeat.js | Lista heartbeats |
| `GET /admin/crash-detection` | adminCrashDetection.js | Lista incidentes |
| `GET /admin/checklists` | adminChecklists.js | Lista checklists |
| `GET /admin/checklists/stats` | adminChecklists.js | Estatísticas |
| `GET /admin/checklists-dashboard/*` | adminChecklistDashboard.js | Dashboard de checklists |
| `GET /admin/exemptions/active` | adminActiveExemptions.js | Lista isenções |

---

## Configuração de Permissões

### Criando uma Permissão

```javascript
// Via API ou função createPermission
await createPermission({
    name: 'Gestor Norte PI',
    description: 'Acesso apenas à regional Norte do PI',
    modules: ['users_agents', 'checklists', 'tracking'],
    filters: [
        { type: 'estado', value: 'pi' },
        { type: 'regional', value: 'norte' }
    ],
    state: 'pi'
});
```

### Atribuindo a um Usuário

```javascript
await assignPermissionsToUser(userId, [permissionId], 'pi');
```

### Múltiplas Permissões

Um usuário pode ter múltiplas permissões. O sistema combina todas:

```javascript
// Usuário com 3 permissões
user.permissions = [
    { filters: [{ type: 'estado', value: 'pi' }] },
    { filters: [{ type: 'estado', value: 'ma' }, { type: 'regional', value: 'sul' }] },
    { filters: [{ type: 'gestor', value: 'joao' }] }
];

// Resultado: pode ver
// - Todos os agentes do PI (qualquer regional)
// - Agentes do MA da regional Sul
// - Agentes do gestor João (de qualquer estado/regional)
```

---

## Casos Especiais

### 1. Usuário sem Permissão

Se o usuário não tiver nenhuma permissão configurada, o sistema usa o estado do próprio usuário como fallback:

```javascript
if (estadosPermitidos.length === 0 && user?.estado) {
    estadosPermitidos.push(user.estado.toLowerCase());
}
```

Se não tiver estado, retorna lista vazia.

### 2. Usuário Admin

Usuários com role contendo "admin" veem todos os dados:

```javascript
if (isMainAdmin) {
    return {
        whereClause: '',
        params: [],
        allowedStates: ['pi', 'ma'],
        isAdmin: true
    };
}
```

### 3. Override via Query Param

Alguns endpoints permitem sobrescrever o filtro via parâmetro de query:

```javascript
// GET /admin/users_agents?estado=ma
// Ignora filtro de permissão e retorna apenas MA
```

---

## Boas Práticas

### Ao Criar Novo Endpoint

1. **Sempre passe o `user`** para funções que consultam colaboradores:

```javascript
// ✅ Correto
const result = await get_users_agents_admin({ user: req.user });

// ❌ Errado - sem filtro
const result = await get_users_agents_admin({});
```

2. **Use o parâmetro `user`** em todas as funções de banco:

```javascript
async function getData(params, user = null) {
    const filter = getColaboradoresFilter(user, { includeAllStates: true });
    // ...
}
```

3. **Aplique o filtro tanto no SQL quanto em memória**:

```javascript
// SQL para estados
if (!isAdmin) {
    query += ` AND estado = ANY($1)`;
    params.push(filter.allowedStates);
}

// Memória para regional/seccional/gestor
const filtered = rows.filter(r => checkAgentPermission(r, user));
```

### Consistência

Todas as funções que retornam dados de colaboradores DEVEM usar o sistema de filtro para garantir consistência de segurança.

---

## Histórico de Alterações

| Data | Descrição |
|------|-----------|
| 2026-01 | Implementação inicial do sistema de filtros |
| 2026-01 | Adição de suporte a múltiplas permissões |
| 2026-01 | Integração com checklistDashboard |
| 2026-01 | Integração com tracking e heartbeats |
