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

### `GET /fast_c12_json`
Identifica execuções de 'C12' com tempo extremamente curto (menor que 90 segundos), indicando possível fraude ou erro de processo.
- **Parâmetros:** `token`, `regional`, `dateinit`, `dateend`.

### `GET /licacao_nova_c12_json`
Identifica registros de 'C12' (LG) em instalações que iniciam com o prefixo '200', caracterizando ligações novas.
- **Parâmetros:** `token`, `regional`, `dateinit`, `dateend`.

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

---

## 8. Agente (Evolução e Estatísticas)

### `GET /agent_statistics`
Retorna o dashboard principal de indicadores consolidados para a performance de um agente específico.
- **Query Params:** `token`, `id` (matrícula do agente), `state` (default: 'pi'), `date` (opcional, formato YYYY-MM-DD ou DD.MM.YYYY, padrão: hoje).
- **Retorno:**
  ```json
  [
      { "title": "Leituras Realizadas", "value": 150, "color": "#00c742ff", "unity": "" },
      { "title": "Perdas Geradas", "value": 450, "color": "#EF4444", "unity": "Kwh" },
      { "title": "CNL", "value": "10/9", "color": "#00c742ff", "unity": "" },
      { "title": "Percentual de CNL", "value": "6.5", "color": "#00c742ff", "unity": "%" },
      { "title": "Qtd. de C12", "value": 5, "color": "#00c742ff", "unity": "" },
      { "title": "C12 Fora de Horário", "value": 0, "color": "#00c742ff", "unity": "" }
  ]
  ```

### `GET /agent_statistics_more`
Retorna indicadores adicionais e mais sensíveis de qualidade da leitura do agente, focados no registro de C12.
- **Query Params:** `token`, `id`, `state` (default: 'pi'), `date` (opcional).
- **Retorno:**
  ```json
  [
      { "title": "C12 Rápidos", "value": 2, "color": "#EF4444", "unity": "" },
      { "title": "C12 em Ligação Nova", "value": 0, "color": "#00c742ff", "unity": "" },
      { "title": "C12 Entrante", "value": 1, "color": "#00c742ff", "unity": "" }
  ]
  ```

### `POST /agent_services`
Retorna a lista detalhada e ordenada cronologicamente de todos os serviços realizados pelo agente na data informada, incluindo os cálculos de produtividade (`tempo_execucao`).
- **Query Params:** `token`, `id`, `state` (default: 'pi').
- **Body:** `{ "page": 1, "date": "2026-03-23" }` (A data e a página são opcionais).
- **Retorno:** Array de objetos com dados de cada instalação lida.

### `GET /calendar`
Busca e retorna a tabela de etapas de roteiro e calendário do sistema.
- **Query Params:** `token`, `state` (default: 'pi').
- **Retorno:** Array com o calendário da filial selecionada.

### `GET /agent_telegram_id`
Recupera o ID do Telegram vinculado à matrícula (login) do agente para realizar os disparos do bot.
- **Query Params:** `token`, `id`, `state` (default: 'pi').
- **Retorno:** `{ "telegram_id": "123456789" }` ou `{ "telegram_id": null }` caso não seja encontrado.
