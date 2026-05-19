# 📚 Central de Documentação da API Banco

Bem-vindo à documentação oficial do ecossistema backend Cenos. Para otimizar a manutenção e facilitar a leitura, as especificações técnicas da API foram divididas em módulos independentes descritos abaixo.

---

## 🗂️ Sumário de Documentos

Consulte o documento específico na pasta `back/docs/` para obter detalhes de endpoints, payloads e regras de negócio:

| Documento | Descrição | Cobertura de APIs |
| :--- | :--- | :--- |
| **[1. Configuração e Variáveis](docs/ENVIRONMENT.md)** | Variáveis de ambiente vigentes e integrações necessárias. | `.env`, Provedores IA (OpenAI/Gemini), MinIO/S3. |
| **[2. Arquitetura da API](docs/ARCHITECTURE.md)** | Estrutura de arquivos, pools de conexões e base transacional local e remota. | Estrutura de rotas, PostgreSQL, cache de logs Redis. |
| **[3. Camadas de Autenticação](docs/AUTHENTICATION.md)** | Os 4 modos de autenticação suportados pelo backend. | JWT Bearer Admin, Telegram TMA Auth, PIN login, Log Auth. |
| **[4. APIs Públicas e Consultas Gerais](docs/ENDPOINTS_PUBLIC.md)** | Rotas abertas para rate-limit e endpoints de extração de relatórios estruturados para BI. | `/public/*`, `/api/pendencias`, `/api/c12`, `/api/perdas`. |
| **[5. APIs do Técnico de Campo (Agente)](docs/ENDPOINTS_AGENT.md)** | Endpoints de consulta, vistorias e monitoramento consumidos pelo aplicativo móvel. | `/agent/profile`, `/agent/predicted`, `/agent/daily_report`. |
| **[6. APIs do Painel de Controle (Admin)](docs/ENDPOINTS_ADMIN.md)** | Rotas administrativas e seguras protegidas por escopo de perfis e regras de jurisdição. | `/admin/forms`, `/admin/tracking`, `/admin/users_agents`. |
| **[7. APIs de Notas de Serviço (Service Notes)](docs/SERVICE_NOTES.md)** | Endpoints operacionais e administrativos de gestão de Notas e Grupos. | `/admin/service-notes`, `/admin/service-groups`, auto-registro. |
| **[8. APIs de Gamificação e Aprendizado](docs/GAMIFICATION_TRAINING.md)** | Trilhas CenEduc e Construtor de Treinamentos Interativos baseados em grafos. | `/agent/ceneduc`, `/admin/training`, concessão de badges. |

---

## 📌 Diretrizes e Protocolo de Atualização (IMPORTANTE)

Para garantir que a equipe de engenharia e os agentes de IA mantenham o alinhamento com a evolução do codebase, **todo desenvolvimento de novas features obrigatoriamente segue as seguintes regras de documentação:**

### 1. Inclusão de Novas Features
* Sempre que uma nova funcionalidade ou endpoint for implementado no backend, **um arquivo de especificação novo** correspondente ao módulo deve ser criado na pasta `back/docs/`.
* Exemplo: Se for desenvolvido um módulo de *Notificações Push*, crie `back/docs/PUSH_NOTIFICATIONS.md`.

### 2. Mapeamento de Payload e Respostas
* O novo arquivo de documentação deve especificar detalhadamente:
  * **Método HTTP e Endpoint** (ex: `POST /admin/push/send`).
  * **Headers de Autenticação** e nível de permissão/módulo exigido.
  * **Payload esperado no Body** com tabela de tipos e campos obrigatórios.
  * **Modelo de Resposta JSON** em caso de sucesso (`200` / `201`) e erros comuns (`400`, `401`, `403`).

### 3. Registro no Sumário Principal (Este Arquivo)
* Após criar o novo documento em `back/docs/`, você **deve** adicionar uma nova linha na tabela do **Sumário de Documentos** neste arquivo `back/API_DOC.md`, linkando-o corretamente com uma breve descrição do escopo.

### 4. Correções e Alterações
* Alterações em endpoints existentes (mudanças de nomes de parâmetros ou novas regras de negócios) devem ser aplicadas diretamente no arquivo correspondente na pasta `back/docs/` no exato momento da codificação para evitar documentações obsoletas.
