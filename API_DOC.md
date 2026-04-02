# Documentação da API Banco

Esta é a documentação atualizada dos endpoints disponíveis na **API Banco**, desenvolvida em **Node.js** com **Express**.

## Visão Geral e Autenticação

A maioria dos endpoints da API requer autenticação através de um parâmetro de query chamado `token`. O valor deve corresponder à variável de ambiente `API_TOKEN`.

Caso o token enviado não seja válido, a API retornará:
```json
{
  "error": "Token inválido"
}
```

### Configurações de CORS
A API utiliza uma lista de permissão (whitelist) para o controle de CORS. A variável de ambiente `CORS_ORIGINS` define quais origens podem acessar os recursos.
- Exemplo: `CORS_ORIGINS=localhost,generic2.cattalk.com.br,177.136.248.84`
- O caractere `*` pode ser usado para liberar acesso global (não recomendado para produção).

---

## 1. Endpoints de Saúde (Health Check)

### `GET /health`
Verifica se a API está online e retorna o horário configurado no servidor.
- **Autenticação Requerida:** Não
- **Retorno:** 
  ```json
  {
      "status": "ok",
      "timestamp": "01/04/2026, 11:53:00",
      "atual_time": "Wed Apr 01 2026 11:53:00 GMT-0300 (Brasilia Standard Time)"
  }
  ```

---

## 2. Endpoints de Consultas Gerais (Matriz)

Estes endpoints consultam a tabela `matriz` do PostgreSQL principal (PI/MA). Parâmetros de data (`dateinit`, `dateend`) utilizam o formato `DD.MM.YYYY`.

### `GET /pendencias` / `GET /pendencias_json`
Retorna resumo formatado ou lista bruta de pendências por regional.
- **Parâmetros:** `token`, `regional` (default: 'all').

### `GET /c12_json`, `GET /e02_json`, `GET /c16_json`
Retorna registros de códigos específicos (NTLEI) entre as datas informadas.
- **Parâmetros:** `token`, `regional`, `dateinit`, `dateend`.

### `GET /perdas` e `GET /perdas_json`
Consultam registros onde `tem_perda = 'PERDA'`.
- **Parâmetros:** `token`, `regional`, `dateinit`, `dateend`.

---

## 3. Dashboard e Monitoramento Agentes

### `GET /agent_statistics`
Painel principal de indicadores do agente para o dia.
- **Query Params:** `token`, `id`, `state` (default: 'pi'), `date` (opcional).
- **Indicadores:** Leituras Realizadas, Perdas, Quantidade/Percentual de CNL, C12 (Total, Fora de Horário, Ligação Nova).

### `GET /agent_statistics_more`
Indicadores complementares (C12 Rápidos e C12 Entrantes).
- **Query Params:** `token`, `id`, `state` (default: 'pi'), `date` (opcional).

### `GET /agent_services`
Lista detalhada de leituras sincronizadas pelo agente.
- **Query Params:** `token`, `id`, `state`, `date`, `filter`, `page`.
- **Filtros Disponíveis:** `all`, `cnl`, `c12`, `c12_out_time`, `c12_ligacao_nova`, `fast_c12`, `first_c12`.

### `GET /predicted`
Busca serviços com perdas previstas que ainda estão pendentes.
- **Query Params:** `token`, `id`, `state`, `status` (padrão: 'PENDENTE'), `page`, `limit`.
- **Ordenação:** Do mais antigo para o mais novo (por data de leitura prevista).

---

## 4. Busca em Localizações (Cadastro de Instalações)

Estes endpoints consultam a base de dados de **Localizações** (`localizacoes_pi_pool`).

### `POST /search_in`
Pesquisa instalações no cadastro técnico.
- **Query Params:** `token`, `state` (default: 'pi').
- **Body:** 
  ```json
  {
      "type": "instalacao" | "medidor" | "contacontrato",
      "queries": ["10000001", "10000002"]
  }
  ```
- **Retorno:** Dados completos de cadastro (coordenadas, endereço, cliente, etc).

---

## 5. Outros Endpoints de Suporte

### `GET /calendar`
Busca o calendário de etapas de roteiro por filial.
- **Query Params:** `token`, `state`.

### `GET /agent_telegram_id`
Recupera o ID do Telegram vinculado à matrícula para alertas.
- **Query Params:** `token`, `id`, `state`.

### `POST /webhook_perdas`
Webhook para recebimento de notificações e disparo automático de fotos via WhatsApp.

---

## 6. Auditoria de Fotos

Fluxo utilizado pela equipe de Viewer para validar fotos de campo.

### `GET /files_for_revalidate`
Fotos marcadas como suspeitas que aguardam revalidação manual.

### `POST /revalidate_file`
Confirmar revalidação (`VERDADEIRO`/`FALSO`).
- **Body:** `{ "instalacao", "data", "validation" }`

### `GET /files_for_view`
Filtro de visualização para fotos já auditadas.
