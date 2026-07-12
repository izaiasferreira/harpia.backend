# Sistema de Gestão de Equipamentos e Inventário

Este documento descreve a arquitetura do novo sistema de equipamentos e inventário (reformulado para ser agnóstico e extensível), separando a entidade de equipamento da entidade do agente.

## 1. Arquitetura de Banco de Dados

O sistema de inventário deixou de ser um conjunto de colunas (ou linha única) atrelado diretamente ao `users_agents`. Passou a ser um sistema baseado em 3 tabelas principais que garantem a rastreabilidade (tracking) de posse e a extensibilidade de tipos de equipamentos:

### 1.1 `equipment`
Armazena a entidade física do equipamento de forma genérica.
- `id`: Identificador único.
- `tipo`: String definindo a categoria do equipamento (ex: `pda`, `impressora`, `maquineta`).
- `estado`: Estado geográfico do equipamento (UF).
- `regional`: Regional ao qual o equipamento está associado.
- `seccional`: Seccional ao qual o equipamento está associado.
- `status`: Status do equipamento (ex: `disponivel`, `em_uso`, `manutencao`, `descartado`, `perdido`).
- `condicao`: Estado de conservação atual (ex: `otimo`, `bom`, `regular`, `ruim`, `danificado`).
- `dados`: Coluna **JSONB** que armazena atributos flexíveis específicos de cada tipo. Por exemplo, para um `pda`, guarda `imei_1`, `imei_2`, `numero_serie`, `marca`, `versao_android`. Para uma `maquineta`, guarda `numero_logico`, `numero_serie`. Isso permite cadastrar novos equipamentos no futuro sem alterar o schema do banco.
- `fotos`: Array de URLs com fotos gerais/cadastro do equipamento (armazenadas no MinIO).

### 1.2 `equipment_assignments`
Tabela de histórico e rastreamento de vínculo (posse) de um equipamento.
- `id`: Identificador único.
- `equipment_id`: Referência ao equipamento.
- `agente`: ID do agente (`telegram_id` / username) com quem o equipamento está/esteve.
- `assigned_by`: ID do admin que aprovou/atribuiu.
- `assigned_at`: Data e hora do início do vínculo.
- `unassigned_at`: Data e hora da devolução/desvínculo (se nulo, ainda está com o agente).
- `unassigned_by`: ID do admin ou agente que devolveu.
- `assignment_notes`: Observações gerais no momento do vínculo.
- `unassignment_notes`: Observações preenchidas ao devolver (ex: tela trincada).
- `latitude` / `longitude`: Localização GPS no momento da associação (via solicitação do agente).

### 1.3 `equipment_requests`
Fluxo de aprovação quando um agente solicita vincular um equipamento a si próprio ou devolver um equipamento (desvincular).
- `id`: Identificador da requisição.
- `equipment_id`: Equipamento solicitado.
- `agente`: ID do agente que está solicitando.
- `tipo_solicitacao`: Tipo da requisição (`associacao` ou `devolucao`).
- `foto_url`: (Obrigatório) URL da foto de comprovação anexada pelo agente/admin no momento do pedido.
- `latitude` / `longitude`: Localização GPS obrigatória capturada no momento do pedido.
- `status`: Estado da solicitação (`pendente`, `aprovado`, `rejeitado`).
- `observacao_agente`: Observação extra do agente.
- `observacao_admin`: Justificativa do admin (ex: em caso de rejeição).
- `processado_por` / `data_processamento`: Registro de qual admin aprovou ou rejeitou.

### 1.4 `equipment_events`
Tabela de histórico unificado do equipamento. Cada ação no ciclo de vida de um equipamento gera um evento auditável (trackeamento).
- `id`: Identificador do evento.
- `equipment_id`: ID do equipamento afetado.
- `event_type`: Tipo do evento (ex: `criacao`, `edicao`, `associacao_solicitada`, `devolucao_solicitada`, `solicitacao_aprovada`, `solicitacao_rejeitada`, `associacao_direta`, `desassociacao_direta`, `mudanca_condicao`).
- `agente`: ID do agente envolvido (se aplicável).
- `actor_id`: ID do usuário/admin que realizou a ação (COMPANY_ADMIN ou Admin comum).
- `metadata`: Coluna JSONB para salvar detalhes ricos do evento (como fotos da solicitação, notas, campos alterados, localização).
- `created_at`: Data e hora da ocorrência.

## 2. Permissões e Regras de Edição

- **Criação e Edição Genérica**: Qualquer administrador com permissão (`equipments`) pode editar os dados restritos: `estado`, `regional`, `seccional`, `status`, e `condicao`.
- **COMPANY_ADMIN**: Apenas usuários com a flag `COMPANY_ADMIN` podem editar informações sensíveis do equipamento (`dados` JSONB, como IMEI, MAC, N/S) após ele já ter sido cadastrado.
- **Eventos de Edição**: Toda edição, inclusive por `COMPANY_ADMIN`, gera um evento `edicao` na tabela `equipment_events`.

## 3. Dicionário e Tipagem Central (Single Source of Truth)

Toda a validação de formato e as definições de campos obrigatórios para cada tipo de equipamento ficam no arquivo:
**`src/constants/equipmentTypes.js`**

Este arquivo dita:
- A lista de tipos permitidos (`pda`, `impressora`, `maquineta`).
- O schema Zod dinâmico aplicável à coluna JSONB `dados` para cada tipo.
- Isso significa que, se no futuro a empresa precisar registrar "Tablets", "Veículos" ou "Capacetes", basta adicionar uma nova chave neste arquivo, e as validações do backend (e a listagem no frontend) vão se adaptar automaticamente.

## 3. Endpoints da API

### Admin (`/admin/equipment/*`)
- **GET `/`**: Lista todos os equipamentos (suporta paginação, busca e filtro por tipo/status).
- **GET `/:id`**: Detalhes de um equipamento específico.
- **POST `/`**: Criação de um novo equipamento (o payload valida de acordo com `equipmentTypes.js`).
- **PUT `/:id`**: Atualiza dados de um equipamento (regras de bloqueio via `COMPANY_ADMIN` aplicadas).
- **DELETE `/:id`**: Exclui (soft/hard) o equipamento.
- **GET `/:id/history`**: Retorna o histórico consolidado (eventos unificados) a partir da tabela `equipment_events`.
- **POST `/:id/assign`**: Admin associa diretamente o equipamento a um agente sem passar por fluxo de aprovação (gera evento).
- **POST `/:id/unassign`**: Admin retira o equipamento do agente atual, gerando obrigatoriamente uma requisição de `devolucao` (para incluir foto e GPS), que é aprovada automaticamente pelo sistema ou enviada para fila.
- **GET `/requests`**: Lista as solicitações (`equipment_requests`) pendentes (associações e devoluções).
- **POST `/requests/:requestId/approve`**: Admin aprova uma solicitação. O backend transaciona o status do request para `aprovado`, cria uma nova linha ativa em `equipment_assignments` copiando as coordenadas geográficas, e atualiza o status do equipamento principal para `em_uso`.
- **POST `/requests/:requestId/reject`**: Admin rejeita a solicitação.

### Agente (`/agent/equipment/*`)
- **GET `/mine`**: Retorna os equipamentos ativamente associados ao agente autenticado, combinando os dados da tabela `equipment` com as informações ativas da `equipment_assignments` e eventuais solicitações `pendentes` (tanto de vinculação quanto devolução).
- **GET `/available`**: Retorna lista de equipamentos com `status = 'disponivel'` (com filtros de tipo e busca).
- **POST `/:id/request`**: (Multipart Form) O agente envia `foto`, `latitude`, `longitude` e o tipo da requisição (`associacao` ou `devolucao`). O backend faz o upload da foto no MinIO, e cria a requisição.
- **POST `/:id/unassign`**: Agente solicita a devolução (mesmo endpoint via `request` sob o capô, exige foto e GPS).

## 4. Integração de Mídia e Permissões

- **Uploads:** Todas as imagens são enviadas via multipart/form-data, processadas e otimizadas pelo `sharp`, e salvas no provedor de storage (MinIO) no bucket configurado para o inventário (ex: `inventory`).
- **Permissões Administrativas:** Toda a parte de Admin é protegida pelo middleware `requirePermission('equipments')`. 
- **Geolocalização Nativa:** O frontend móvel obtém as coordenadas do request via Web Geolocation API e envia junto ao form, garantindo que o Admin saiba *onde* o agente estava ao bater a foto de comprovação.
