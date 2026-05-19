# Métodos de Autenticação da API

Este documento descreve detalhadamente as 4 camadas de autenticação da API Banco, permitindo interações seguras tanto de agentes em campo quanto de administradores da central de controle.

---

## 1. Token Simples (Query Param)

Utilizado exclusivamente em rotas internas de integrações automatizadas e relatórios consolidados em formato JSON.

* **Parâmetro:** `token` (via query string).
* **Configuração:** O token esperado pelo backend é definido na variável `API_TOKEN` no arquivo `.env`.

**Exemplo de Requisição:**
```bash
curl "http://localhost:3040/api/pendencias?token=API_TOKEN_DEFINIDO"
```

---

## 2. Autenticação Telegram (TMA - Telegram Mini App)

Utilizado pelo aplicativo móvel principal do Técnico de Campo quando executado como um Telegram Mini App.

* **Header Requerido:** `X-Telegram-Init-Data`
* **Funcionamento:** O header deve conter a string `initData` gerada pelo Telegram WebApp na abertura do Mini App.
* **Validação:** O middleware `telegramAuth` valida a integridade dos dados usando um HMAC-SHA256 gerado a partir do token do Bot do Telegram. Após autenticado, recupera a matrícula e informações do colaborador a partir do `telegram_id` na tabela `login`.

**Exemplo de Requisição:**
```bash
curl "http://localhost:3040/agent/agent_data" \
     -H "X-Telegram-Init-Data: query_id=AA...&user=%7B%22id%22%3A123456...&hash=..."
```

---

## 3. Autenticação por PIN (App Nativo / Web Standalone)

Utilizado para autenticar agentes de campo fora do ambiente do Telegram, como em aplicativos nativos (Capacitor/Android) ou acessos Web Standalone.

### Fluxo Operacional:
1. **Geração do PIN (Admin):** O gestor gera um PIN de 6 dígitos temporário para o agente via API `POST /admin/agent/generate_app_pin`.
2. **Login do Técnico:** O agente inicia o aplicativo standalone e insere sua **Matrícula** e o **PIN** recebido. O app faz uma requisição `POST /public/app_login`.
3. **Entrega de Token:** O backend valida a matrícula e a expiração do PIN. Retorna um token JWT customizado com duração padrão de **30 dias**.
4. **Consumo de Rotas:** O aplicativo armazena localmente o token e o envia no cabeçalho `X-Telegram-Init-Data` em todas as chamadas futuras.

**Exemplo de Login:**
```bash
curl -X POST "http://localhost:3040/public/app_login" \
     -H "Content-Type: application/json" \
     -d '{"matricula": "T60702", "pin": "482917"}'
```

**Exemplo de Resposta de Login:**
```json
{
  "token": "a1b2c3d4e5f6...",
  "expires_at": "2026-06-16T15:00:00.000Z",
  "agent": { "id": "T60702", "estado": "pi", "nome": "João Silva" }
}
```

**Consumo subsequente das rotas do agente:**
```bash
curl "http://localhost:3040/agent/agent_data" \
     -H "X-Telegram-Init-Data: a1b2c3d4e5f6..."
```

---

## 4. Autenticação Administrativa (JWT Bearer Token)

Utilizado no Painel de Controle Administrativo (Control Center) pelas rotas `/admin/*` para garantir acessos seguros de gestores e supervisores.

* **Header Requerido:** `Authorization: Bearer <token>`
* **Funcionamento:** O token é gerado no login administrativo (`POST /admin/user/login`) e assinado utilizando a chave privada definida em `JWT_SECRET`.
* **Guardas de Módulo (Permissions):** O middleware intercepta o token, extrai os módulos e permissões geográficas vinculadas ao usuário e valida se o usuário possui posse do `ModuleId` correspondente daquela rota (ex: `forms` para construtor de formulários ou `tracking` para monitoramento de rotas).

**Exemplo de Requisição:**
```bash
curl "http://localhost:3040/admin/forms" \
     -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## 5. Autenticação de Auditoria de Logs (Header Authorization)

Utilizado especificamente para endpoints de monitoramento de infraestrutura (`/api/logs/*`).

* **Header Requerido:** `Authorization`
* **Validação:** Compara diretamente com o valor estático configurado na variável de ambiente `LOGS_PASSWORD`.

**Exemplo de Requisição:**
```bash
curl "http://localhost:3040/api/logs/data" \
     -H "Authorization: SENHA_DE_LOGS"
```
