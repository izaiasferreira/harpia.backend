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

---

## 1. Endpoints de Saúde (Health Check)

### `GET /health`
Verifica se a API está online.
- **Autenticação Requerida:** Não
- **Retorno:** 
  ```json
  {
      "status": "ok",
      "timestamp": "2026-03-12T23:55:00.000Z"
  }
  ```

---

## 2. Endpoints de Consultas Gerais

Estes endpoints consultam a tabela `matriz` do PostgreSQL. Parâmetros de data (`dateinit`, `dateend`) utilizam o formato `DD.MM.YYYY`.

### `GET /pendencias`
Retorna um resumo formatado em texto das pendências por regional e seccional.
- **Parâmetros:** `token`, `regional` (default: 'all').

### `GET /pendencias_json`
Retorna a lista bruta de pendências em formato JSON.
- **Parâmetros:** `token`, `regional` (default: 'all').

### `GET /cnl`
Retorna resumo em texto de serviços concluídos (NTLEI não inicia com 'A' e não é B09/B10/B15).
- **Parâmetros:** `token`, `regional`, `dateinit`, `dateend`.

### `GET /c12_json`
Retorna registros de NTLEI 'C12' com status 'LG' entre as datas informadas.
- **Parâmetros:** `token`, `regional`, `dateinit`, `dateend`.

### `GET /e02_json`
Retorna registros de NTLEI 'E02' entre as datas informadas.
- **Parâmetros:** `token`, `regional`, `dateinit`, `dateend`.

### `GET /c16_json`
Retorna registros de NTLEI 'C16' entre as datas informadas.
- **Parâmetros:** `token`, `regional`, `dateinit`, `dateend`.

### `GET /perdas` e `GET /perdas_json`
Consultam registros onde `tem_perda = 'PERDA'`.
- **Parâmetros:** `token`, `regional`, `dateinit`, `dateend`.

---

## 3. Histórico e Transições (Novos Endpoints)

Estes endpoints utilizam lógicas de janela (Window Functions) para analisar o histórico das instalações.

### `GET /first_c12_json`
Identifica o primeiro registro 'C12' (LG) que foi antecedido por dois registros de leitura (A/B09/B10/B15).
- **Parâmetros:** `token`, `regional`, `dateinit`, `dateend`.

### `GET /first_cnl_json`
Identifica registros de CNL (NTLEI não 'A' ou Bxx) antecedidos por dois registros de leitura.
- **Parâmetros:** `token`, `regional`, `dateinit`, `dateend`.

### `GET /c12_to_lido_json`
Identifica instalações que mudaram de 'C12' para leitura (A/B09/B10/B15) no dia informado.
- **Parâmetros:** `token`, `regional`, `dateinit`.

### `GET /cnl_to_lido_json`
Identifica instalações que mudaram de CNL para leitura no dia informado.
- **Parâmetros:** `token`, `regional`, `dateinit`.

---

## 4. Dashboard de Serviços

Monitoramento de performance dos agentes para o dia atual.

### `GET /not_start_services`
Agentes que possuem pendências mas ainda não concluíram nenhum serviço hoje.
- **Parâmetros:** `token`.

### `GET /completed_services`
Agentes que já completaram todas as suas pendências hoje. Retorna tempos de trabalho e pausas.
- **Parâmetros:** `token`.

### `GET /incompleted_services`
Agentes que iniciaram o trabalho (concluíram > 0) mas ainda possuem mais de 10 pendências.
- **Parâmetros:** `token`.

---

## 5. Webhooks

### `POST /webhook_perdas`
Recebe notificações externas de conclusão de serviço.
- **Evento:** `service.completed`
- **Ação:** Dispara uma mensagem com imagem via WhatsApp (configurado no `.env`).

---

## 6. Revalidação de Fotos (Auditoria)

Endpoints para o fluxo de auditoria de campo.

### `GET /files_for_revalidate`
Busca fotos marcadas como `VALIDACAO = 'FALSO'` e `revalidacao = 'None'`.

### `POST /revalidate_file`
Atualiza o campo `revalidacao` na tabela de auditoria.
- **Body:** `{ "instalacao", "data", "validation" }`

### `GET /filter_options`
Retorna as opções únicas de filtro (agentes, seccionais, regionais, datas) para a interface de auditoria.

### `GET /files_for_view`
Busca fotos validadas (`VERDADEIRO` ou `FALSO` com revalidação feita) para visualização.
- **Parâmetros:** `token`, `date`, `regional`, `seccional`, `agent`, `validation`.

---

## 7. Servidor de Arquivos

### `GET /`
Mensagem de boas-vindas/erro 404 (instrução de uso).

### `GET /*` (Qualquer outro caminho)
Serve arquivos estáticos da pasta definida em `FILES_ROOT`. Possui proteção contra *path traversal*.
