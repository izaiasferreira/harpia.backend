# Documentação da API Banco

Esta é a documentação dos endpoints disponíveis na **API Banco**, desenvolvida utilizando o framework **FastAPI**.

## Visão Geral e Autenticação

A maioria dos endpoints da API requer autenticação através de um parâmetro de query chamado `token`. Para usar a API validamente, você deve enviar o valor do token que corresponde variável de ambiente `API_TOKEN`.

Caso o token enviado não seja válido, a API retornará:
```json
{
  "error": "Token inválido"
}
```

---

## 1. Endpoints de Saúde (Health Check)

### `GET /health`
Verifica se a API está no ar e funcionando.
- **Autenticação Required:** Não
- **Parâmetros:** Nenhum
- **Retorno de Sucesso:**
  ```json
  {
      "status": "ok",
      "timestamp": "2023-10-25T12:00:00.000000Z"
  }
  ```

---

## 2. Endpoints de Consultas

Todos os endpoints desta seção efetuam consultas na base de dados (PostgreSQL) e requerem autenticação (`token`). O comportamento de filtros de data (`dateinit` e `dateend`) tem como padrão o dia atual no formato `DD.MM.YYYY`.

### `GET /pendencias`
Consulta dados de pendências, com a possibilidade de retorno ou envio de arquivo (faturado através do postgres_functions).
- **Parâmetros de Query:**
  - `token` (obrigatório): Token de autenticação.
  - `regional` (opcional): Filtra por regional. Padrão: `'all'`.
  - `dateinit` (opcional): Data inicial da consulta. Padrão: data atual.
  - `dateend` (opcional): Data final da consulta. Padrão: data atual.

### `GET /pendencias_json`
Retorna de forma explícita os dados de pendências em formato JSON.
- **Parâmetros de Query:**
  - `token` (obrigatório): Token de autenticação.
  - `regional` (opcional): Filtra por regional. Padrão: `'all'`.

### `GET /cnl`
Consulta dados relacionados a "CNL". 
- **Parâmetros de Query:**
  - `token` (obrigatório): Token de autenticação.
  - `regional` (opcional): Filtra por regional. Padrão: `'all'`.
  - `dateinit` (opcional): Data de início (formato esperado ou ajustado com \`.`). Padrão: data atual.
  - `dateend` (opcional): Data final (formato esperado ou ajustado com \`.`). Padrão: data atual.

### `GET /c12_json`
Consulta dados formato JSON relacionados a "C12".
- **Parâmetros de Query:**
  - `token` (obrigatório): Token de autenticação.
  - `regional` (opcional): Filtra por regional. Padrão: `'all'`.
  - `dateinit` (opcional): Data de início. Padrão: data atual.
  - `dateend` (opcional): Data final. Padrão: data atual.

### `GET /perdas`
Consulta registros de perdas. 
- **Parâmetros de Query:**
  - `token` (obrigatório): Token de autenticação.
  - `regional` (opcional): Filtra por regional. Padrão: `'all'`.
  - `dateinit` (opcional): Data de início. Padrão: data atual.
  - `dateend` (opcional): Data final. Padrão: data atual.

### `GET /perdas_json`
Consulta registros de perdas retornando em formato JSON.
- **Parâmetros de Query:**
  - `token` (obrigatório): Token de autenticação.
  - `regional` (opcional): Filtra por regional. Padrão: `'all'`.
  - `dateinit` (opcional): Data de início. Padrão: data atual.
  - `dateend` (opcional): Data final. Padrão: data atual.

---

## 3. Webhooks

### `POST /webhook_perdas`
Endpoint destinado a receber notificações de eventos (webhooks). Exige autenticação por token no query param e um body JSON vindo da requisição que disparou o evento.
- **Parâmetros de Query:**
  - `token` (obrigatório): Token de autenticação.
- **Body Esperado (JSON):**
  A estrutura baseia-se no evento processado. Para recuperar a imagem e disparar o WhatsApp:
  ```json
  {
      "event": "service.completed",
      "data": {
          "title": "...",
          "description": "...",
          "completionData": {
              "key": "image_url_aqui"
          }
      }
  }
  ```
- **Fluxo do Endpoint:**
  - Se o evento for `service.completed`, envia uma mensagem de arquivo via WhatsApp avisando sobre a "Perda Recuperada".
  - Retorna erro caso o evento recebido seja inválido.

---

## 4. Revalidação de Fotos (Auditoria)

### `GET /files_for_revalidate`
Recupera os dados que precisam de revalidação de fotos.
- **Parâmetros de Query:**
  - `token` (obrigatório): Token de autenticação.
- **Retorno:**
   ```json
  [{"instalacao": "ID ou codigo da instalacao", "data_foto": "Data da conclusao do item", "hora_foto":"Hora da conclusao do item", "apontamento": "Apontamento do item", "foto":"URL da foto"}, ...]
  ```

### `POST /revalidate_file`
Salva o status consolidado de uma revalidação.
- **Parâmetros de Query:**
  - `token` (obrigatório): Token de autenticação.
- **Body Esperado (JSON):**
  ```json
  {
      "instalacao": "ID ou codigo da instalacao",
      "data": "Data da conclusao do item",
      "validation": "Status da revalidação (ex: VERDADEIRO, FALSO)"
  }
  ```
- **Retorno:** Confirmação do update na base de dados (`{"status": "success"}`).

---

## 5. Servidor de Arquivos Estáticos / Publicos

Endpoints dinâmicos projetados para expor e servir arquivos estaticamente.

### `GET /` e `GET /{file_path:path}`
Serve arquivos contidos no diretório especificado na variável de ambiente `FILES_ROOT` ou em uma subpasta denominada `public` na raiz do projeto.
- **Parâmetros de Rota:**
  - `file_path`: O caminho para o arquivo sendo buscado.
- **Comportamentos:**
  - Um acesso à raiz do server (`/`) sem especificar arquivo gera um Erro 404 seguro com detalhamento amigável.
  - Bloqueia e corrige tentativas de *Path Traversal* mantendo o serviço confinado à pasta raiz pretendida.
  - Se um arquivo for encontrado será retornado através do `FileResponse`.
  - Se não for encontrado nada, retorna 404 em formato JSON.
