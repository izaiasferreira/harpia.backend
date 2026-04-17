# Documentação das Queries SQL do Repositório

Este repositório é uma API de gestão de leituras de medidores para agentes de campo. O banco de dados principal é **PostgreSQL**, com tabelas principais: `matriz`, `vars`, `login`, `etapas`, `feriados`, além de tabelas auxiliares criadas automaticamente.

---

## Tabelas Principais

### `matriz`
Tabela central com registros de instalações, leituras e serviços:
- `instalacao` (TEXT) - Número da instalação
- `etapa` (TEXT) - Etapa do ciclo de leitura
- `seccional` (TEXT) - Seção territorial
- `regional` (TEXT) - Regional
- `agente` (TEXT) - Código do agente responsável
- `nome_agente` (TEXT) - Nome do agente
- `supervisor` (TEXT) - Supervisor do agente
- `ntlei` (TEXT) - Código do tipo de leitura (C12, A01, E02, C16, B09, B10, B15, etc.)
- `status_ds` (TEXT) - Status do serviço (LG = Ligado, etc.)
- `data_leit_prev` (DATE) - Data de leitura prevista
- `data_conclusao` (TIMESTAMP) - Data/hora de conclusão do serviço
- `concluido` (TEXT) - Status: 'CONCLUIDO' ou 'PENDENTE'
- `tem_perda` (TEXT) - Indica se há perda ('PERDA')
- `perda_prevista_mensal` (TEXT) - Quantidade de perda prevista em kWh
- `tipo_perda` (TEXT) - Tipo da perda
- `status_perda` (TEXT) - Status da perda
- `motivo_perda` (TEXT) - Motivo da perda
- `latitude`, `longitude` (TEXT) - Coordenadas geográficas
- `apontamento` (TEXT) - Código de apontamento

### `vars`
Armazena variáveis de sistema/data de atualização:
- `nome` (TEXT) - Nome da variável
- `data` (TIMESTAMP) - Valor da variável

### `login`
Cadastro de agentes:
- `id` (TEXT) - Código do agente
- `telegram_id` (BIGINT) - ID do Telegram do agente

### `etapas`
Calendário de etapas de leitura

### `feriados`
Datas de feriados para cálculo de pontualidade

### `dados_instalacoes`
Dados complementares das instalações:
- `instalacao` (TEXT)
- `medidor` (TEXT)
- `conta_contrato` (TEXT)
- `lat_cad`, `long_cad` (TEXT) - Coordenadas de cadastro
- `lat_leitura`, `long_leitura` (TEXT) - Coordenadas de leitura
- `lat_lig`, `long_lig` (TEXT) - Coordenadas de ligação

---

## Bancos de Dados

O sistema usa múltiplas conexões PostgreSQL:
- **`pi_pool`** - Banco do Piauí
- **`ma_pool`** - Banco do Maranhão
- **`localizacoes_pi_pool`** - Banco de lokalizações (instalações)

---

## QUERIES DETALHADAS

---

### 1. Tabela: `justificativas`

**Criação:**
```sql
CREATE TABLE IF NOT EXISTS justificativas (
    id SERIAL PRIMARY KEY,
    instalacao TEXT,
    tipo TEXT,
    motivo TEXT,
    justificativa TEXT,
    foto TEXT,
    data_leit_prev TEXT,
    author TEXT,
    estado TEXT,
    quantidade INTEGER,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```
**Objetivo:** Armazenar justificativas criadas por agentes para instalações pendentes.

---

#### 1.1 `checkJustifiedByInstallations` (agentes.js:36)

**Query:**
```sql
SELECT DISTINCT instalacao 
FROM justificativas 
WHERE TRIM(instalacao) IN (${placeholders})
AND estado = $${installations.length + 1}
```

**Descrição:** Verifica quais instalações têm justificativas respondidas no estado especificado.

**Parâmetros:**
- `installations` (ARRAY) - Lista de números de instalação
- `estado` (STRING) - 'pi' ou 'ma'

**Retorno:** Mapa `{ instalacao: true/false }`

**Endpoints que usam:**
- `/agent_services` (verificação automática)

---

#### 1.2 `save_justify` (agentes.js:406)

**Query:**
```sql
INSERT INTO justificativas (
    instalacao, tipo, motivo, justificativa, foto, data_leit_prev, 
    author, estado, quantidade, created_at, updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
RETURNING *;
```

**Descrição:** Insere uma nova justificativa no banco de dados.

**Parâmetros:**
- `$1` - instalacao (TEXT)
- `$2` - tipo (TEXT)
- `$3` - motivo (TEXT)
- `$4` - justificativa (TEXT)
- `$5` - foto (TEXT)
- `$6` - data_leit_prev (TEXT)
- `$7` - author (TEXT)
- `$8` - estado (TEXT)
- `$9` - quantidade (INTEGER)
- `$10` - created_at (TIMESTAMP)
- `$11` - updated_at (TIMESTAMP)

**Retorno:** Registro criado completo

**Endpoints que usam:**
- `POST /create_justify`

---

#### 1.3 `get_justify` (agentes.js:454)

**Query:**
```sql
SELECT * FROM justificativas WHERE 1=1
[AND TRIM(instalacao) = $1]
[AND TRIM(data_leit_prev) = $2]
[AND LOWER(estado) = $3]
[AND author = $4]
[AND LOWER(tipo) = $5]
ORDER BY created_at DESC
```

**Descrição:** Busca justificativas com filtros dinâmicos opcionais.

**Parâmetros (todos opcionais):**
- `instalacao` - Número da instalação
- `data_leit_prev` - Data de leitura prevista
- `estado` - Estado (pi/ma)
- `author` - Autor da justificativa
- `tipo` - Tipo da justificativa

**Retorno:** Lista de justificativas ordenadas por data de criação (DESC)

**Endpoints que usam:**
- `GET /get_justify`
- `POST /create_justify` (validação)

---

#### 1.4 `update_justify` (agentes.js:519)

**Query:**
```sql
UPDATE justificativas
SET instalacao = $1, tipo = $2, motivo = $3, justificativa = $4, foto = $5, 
    data_leit_prev = $6, quantidade = $7, updated_at = $N
WHERE id = $${paramIndex}
RETURNING *;
```

**Descrição:** Atualiza campos de uma justificativa existente.

**Campos permitidos para atualização:**
- instalacao
- tipo
- motivo
- justificativa
- foto
- data_leit_prev
- quantidade

**Parâmetros:** Campos acima + id da justificativa

**Retorno:** Registro atualizado ou null se não encontrado

**Endpoints que usam:**
- `PUT /update_justify`

---

#### 1.5 `delete_justify` (agentes.js:535)

**Query:**
```sql
DELETE FROM justificativas WHERE id = $1 RETURNING *;
```

**Descrição:** Remove uma justificativa pelo ID.

**Parâmetros:**
- `$1` - id (INTEGER)

**Retorno:** Registro deletado ou null se não encontrado

**Endpoints que usam:**
- `DELETE /delete_justify/:id`

---

### 2. Tabela: `justify_pending`

**Criação:**
```sql
CREATE TABLE IF NOT EXISTS justify_pending (
    id SERIAL PRIMARY KEY,
    autor TEXT NOT NULL,
    quantidade INTEGER NOT NULL,
    tipo TEXT,
    unidade_leitura TEXT,
    motivo TEXT,
    observacao TEXT,
    foto TEXT,
    estado TEXT DEFAULT 'pi',
    status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente', 'respondido')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

**Objetivo:** Armazenar justificativas pré-criadas pendentes de resposta pelos agentes.

---

#### 2.1 `pre_create_pending_justify` (agentes.js:622)

**Query:**
```sql
INSERT INTO justify_pending (autor, quantidade, tipo, unidade_leitura, foto, estado, status, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, 'pendente', $7, $8)
RETURNING *;
```

**Descrição:** Cria uma justificativa pendente (pré-criada para posterior resposta).

**Parâmetros:**
- `$1` - autor (TEXT)
- `$2` - quantidade (INTEGER)
- `$3` - tipo (TEXT)
- `$4` - unidade_leitura (TEXT)
- `$5` - foto (TEXT)
- `$6` - estado (TEXT)
- `$7` - created_at (TIMESTAMP)
- `$8` - updated_at (TIMESTAMP)

**Retorno:** Registro criado

**Endpoints que usam:** Uso interno (não exposto publicamente)

---

#### 2.2 `respond_pending_justify` (agentes.js:662)

**Query:**
```sql
UPDATE justify_pending 
SET motivo = $1, observacao = $2, foto = COALESCE($3, foto), 
    status = 'respondido', updated_at = $4
WHERE id = $5
RETURNING *;
```

**Descrição:** Responde uma justificativa pendente, alterando status para 'respondido'.

**Parâmetros:**
- `$1` - motivo (TEXT)
- `$2` - observacao (TEXT)
- `$3` - foto (TEXT, opcional)
- `$4` - updated_at (TIMESTAMP)
- `$5` - id (INTEGER)

**Retorno:** Registro atualizado

**Endpoints que usam:**
- `PUT /justify_pending/:id/respond`

---

#### 2.3 `get_pending_justify_by_id` (agentes.js:695)

**Query:**
```sql
SELECT * FROM justify_pending WHERE id = $1;
```

**Descrição:** Busca uma justificativa pendente específica pelo ID.

**Parâmetros:**
- `$1` - id (INTEGER)

**Retorno:** Registro único ou null

**Endpoints que usam:**
- `GET /justify_pending/:id`
- `PUT /justify_pending/:id/respond` (verificação)

---

#### 2.4 `get_pending_justifies` (agentes.js:725)

**Query:**
```sql
SELECT * FROM justify_pending WHERE 1=1
[AND LOWER(autor) = $1]
[AND LOWER(status) = $2]
ORDER BY created_at DESC 
LIMIT $3 OFFSET $4
```

**Descrição:** Lista justificativas pendentes com filtros opcionais e paginação.

**Parâmetros:**
- `autor` (opcional) - Filtrar por autor
- `status` (opcional) - Filtrar por status ('pendente' ou 'respondido')
- `limit` - Limite de resultados
- `offset` - Deslocamento para paginação

**Retorno:** Objeto com `{ data: [], total, page, limit, totalPages }`

**Endpoints que usam:**
- `GET /justify_pending`

---

#### 2.5 `delete_pending_justify` (agentes.js:758)

**Query:**
```sql
DELETE FROM justify_pending WHERE id = $1 RETURNING *;
```

**Descrição:** Remove uma justificativa pendente.

**Parâmetros:**
- `$1` - id (INTEGER)

**Retorno:** Registro deletado ou null

**Endpoints que usam:** Uso interno

---

### 3. Tabela: `daily_report`

**Criação:**
```sql
CREATE TABLE IF NOT EXISTS daily_report (
    id SERIAL PRIMARY KEY,
    autor TEXT NOT NULL,
    nota INTEGER NOT NULL CHECK (nota >= 1 AND nota <= 5),
    motivo TEXT,
    observacao TEXT,
    foto TEXT,
    estado TEXT DEFAULT 'pi',
    data_report DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

**Objetivo:** Armazenar reportes diários dos agentes com nota de 1-5.

---

#### 3.1 `save_daily_report` (agentes.js:809)

**Query:**
```sql
INSERT INTO daily_report (autor, nota, motivo, observacao, foto, estado, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;
```

**Descrição:** Cria um novo reporte diário. Valida que só existe 1 reporte por dia por autor.

**Validação:** Verifica se já existe reporte para o mesmo autor hoje.

**Parâmetros:**
- `$1` - autor (TEXT)
- `$2` - nota (INTEGER, 1-5)
- `$3` - motivo (TEXT)
- `$4` - observacao (TEXT)
- `$5` - foto (TEXT)
- `$6` - estado (TEXT)
- `$7` - created_at (TIMESTAMP)
- `$8` - updated_at (TIMESTAMP)

**Retorno:** Registro criado

**Endpoints que usam:**
- `POST /daily_report`

---

#### 3.2 `get_daily_reports` (agentes.js:836)

**Query:**
```sql
SELECT * FROM daily_report WHERE 1=1
[AND LOWER(autor) = $1]
[AND DATE(created_at) = TO_DATE($2, 'YYYY-MM-DD')]
ORDER BY created_at DESC 
LIMIT $3
```

**Descrição:** Lista reportes com filtros opcionais.

**Parâmetros:**
- `autor` (opcional)
- `data` (opcional, formato YYYY-MM-DD)
- `limit` (padrão 10)

**Retorno:** Lista de reportes ordenados por data

**Endpoints que usam:**
- `GET /daily_report`

---

#### 3.3 `get_daily_report_today` (agentes.js:873)

**Query:**
```sql
SELECT * FROM daily_report 
WHERE LOWER(autor) = LOWER($1) AND DATE(created_at) = CURRENT_DATE;
```

**Descrição:** Verifica se existe reporte do dia atual para o autor.

**Parâmetros:**
- `$1` - autor (TEXT)

**Retorno:** Reporte do dia ou null

**Endpoints que usam:**
- `GET /daily_report/check_today`
- `POST /daily_report` (validação)

---

#### 3.4 `delete_daily_report` (agentes.js:884)

**Query:**
```sql
DELETE FROM daily_report WHERE id = $1 RETURNING *;
```

**Descrição:** Remove um reporte diário.

**Parâmetros:**
- `$1` - id (INTEGER)

**Retorno:** Registro deletado ou null

---

### 4. Tabela: `inventory`

**Criação:**
```sql
CREATE TABLE IF NOT EXISTS inventory (
    id SERIAL PRIMARY KEY,
    agente TEXT NOT NULL,
    pda_imei_1 TEXT,
    pda_imei_2 TEXT,
    pda_numero_serie TEXT,
    pda_marca TEXT,
    pda_modelo TEXT,
    pda_numero_chip TEXT,
    pda_versao_android TEXT,
    pda_versao_bluetooth TEXT,
    impressora_numero_serie TEXT,
    impressora_modelo TEXT,
    impressora_marca TEXT,
    estado TEXT DEFAULT 'pi',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

**Objetivo:** Inventário de equipamentos (PDA e impressora) dos agentes.

---

#### 4.1 `get_inventory_by_agent` (agentes.js:918)

**Query:**
```sql
SELECT * FROM inventory 
WHERE LOWER(agente) = LOWER($1)
ORDER BY id DESC
LIMIT 1;
```

**Descrição:** Busca o último inventário registrado para um agente.

**Parâmetros:**
- `$1` - agente (TEXT)

**Retorno:** Último inventário ou null

**Endpoints que usam:**
- `GET /inventory`

---

#### 4.2 `save_inventory` (agentes.js:996)

**Query:**
```sql
INSERT INTO inventory (
    agente, pda_imei_1, pda_imei_2, pda_numero_serie, pda_marca, pda_modelo,
    pda_numero_chip, pda_versao_android, pda_versao_bluetooth,
    impressora_numero_serie, impressora_modelo, impressora_marca,
    estado, created_at, updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
RETURNING *;
```

**Descrição:** Salva/atualiza inventário de equipamentos. Se dados iguais já existem, apenas atualiza `updated_at`.

**Comportamento especial:**
- Se inventário existente tem mesmos dados → atualiza apenas `updated_at`
- Se dados diferentes → cria novo registro

**Parâmetros:**
- `$1` - agente (TEXT)
- `$2` - pda_imei_1 (TEXT)
- `$3` - pda_imei_2 (TEXT)
- `$4` - pda_numero_serie (TEXT)
- `$5` - pda_marca (TEXT)
- `$6` - pda_modelo (TEXT)
- `$7` - pda_numero_chip (TEXT)
- `$8` - pda_versao_android (TEXT)
- `$9` - pda_versao_bluetooth (TEXT)
- `$10` - impressora_numero_serie (TEXT)
- `$11` - impressora_modelo (TEXT)
- `$12` - impressora_marca (TEXT)
- `$13` - estado (TEXT)
- `$14` - created_at (TIMESTAMP)
- `$15` - updated_at (TIMESTAMP)

**Retorno:** `{ ...registro, action: 'created' | 'updated_at' }`

**Endpoints que usam:**
- `POST /inventory`

---

### 5. Tabela: `telegram_tokens`

**Criação:**
```sql
CREATE TABLE IF NOT EXISTS telegram_tokens (
    id SERIAL PRIMARY KEY, 
    token VARCHAR(255) NOT NULL UNIQUE, 
    telegram_user_id BIGINT NOT NULL, 
    expires_at TIMESTAMP NOT NULL, 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
    last_used_at TIMESTAMP
);
```

**Objetivo:** Armazenar tokens de autenticação via Telegram.

---

#### 5.1 `generate_token` (public.js:107)

**Query:**
```sql
INSERT INTO telegram_tokens (token, telegram_user_id, expires_at) 
VALUES ($1, $2, $3)
```

**Descrição:** Gera um novo token de autenticação Telegram.

**Parâmetros:**
- `$1` - token (32 bytes hex aleatórios)
- `$2` - telegram_user_id (BIGINT)
- `$3` - expires_at (TIMESTAMP, +30 dias)

**Endpoints que usam:**
- `GET /generate_token`

---

### 6. Tabela: `matriz` - Queries de Leitura/Agente

#### 6.1 `getLeiturasForAgent` (agentes.js:98-206)

**Filtro `all`:**
```sql
SELECT 
    instalacao, etapa, ntlei, data_conclusao, data_leit_prev, agente,
    tem_perda, perda_prevista_mensal, nome_agente, latitude, longitude
FROM matriz
WHERE agente IN ($1, $2)
AND data_conclusao >= TO_DATE($3, 'DD/MM/YYYY')
AND data_conclusao < TO_DATE($3, 'DD/MM/YYYY') + interval '1 day'
ORDER BY data_conclusao ASC
LIMIT $4 OFFSET $5;
```

**Descrição:** Busca leituras realizadas por um agente em uma data específica.

**Parâmetros:**
- `$1` - id (uppercase)
- `$2` - id (lowercase)
- `$3` - data (DD/MM/YYYY)
- `$4` - limit
- `$5` - offset

**Retorno:** Lista de leituras ordenadas por data de conclusão

**Filtros disponíveis:**

| Filtro | Diferença |
|--------|-----------|
| `all` | Todas as leituras do dia |
| `cnl` | Apenas CNL (ntlei NOT LIKE 'A%' E não B09/B10/B15) |
| `c12` | Apenas tipo C12 |
| `c12_out_time` | C12 com hora < 8h (PI) ou < 7h (MA) |
| `c12_ligacao_nova` | C12 com instalacao LIKE '200%' E status_ds = 'LG' |
| `pending` | Ver `getLeiturasPendingForAgent` |

**Endpoints que usam:**
- `GET /agent_services`
- `GET /agent_dashboard`

---

#### 6.2 `getLeiturasPendingForAgent` (agentes.js:237)

**Query:**
```sql
SELECT 
    instalacao, etapa, ntlei, data_conclusao, data_leit_prev, agente,
    tem_perda, perda_prevista_mensal, nome_agente, latitude, longitude
FROM matriz
WHERE agente IN ($1, $2)
AND concluido = 'CONCLUIDO'
AND data_leit_prev >= TO_DATE($3, 'DD.MM.YYYY')
AND data_leit_prev < TO_DATE($3, 'DD.MM.YYYY') + interval '1 day'
LIMIT $4 OFFSET $5;
```

**Descrição:** Busca leituras pendentes do agente para o mês atual (a partir do dia 1).

**Parâmetros:**
- `$1` - id (uppercase)
- `$2` - id (lowercase)
- `$3` - primeiro dia do mês (DD.MM.YYYY)
- `$4` - limit
- `$5` - offset

**Retorno:** Lista de leituras pendentes

**Endpoints que usam:**
- `GET /agent_services?filter=pending`

---

#### 6.3 `getCalendarForAgent` (agentes.js:257)

**Query:**
```sql
SELECT * FROM etapas
```

**Descrição:** Retorna o calendário de etapas de leitura.

**Retorno:** Lista de etapas

**Endpoints que usam:**
- `GET /calendar`

---

#### 6.4 `getAgentTelegramId` (agentes.js:268)

**Query:**
```sql
SELECT * FROM login 
WHERE id IN ('${id.toUpperCase()}', '${id.toLowerCase()}')
```

**Descrição:** Busca dados do agente incluindo telegram_id.

**Parâmetros:**
- `id` - Código do agente

**Retorno:** Dados do agente (inclui telegram_id)

**Endpoints que usam:**
- `GET /agent_telegram_id`

---

### 7. Tabela: `matriz` - Queries de Instalações

#### 7.1 `get_instalations` (agentes.js:287)

**Query:**
```sql
SELECT * FROM dados_instalacoes 
WHERE instalacao IN (${placeholders})
-- OU WHERE medidor IN (${placeholders})
-- OU WHERE conta_contrato IN (${placeholders})
```

**Descrição:** Busca dados complementares das instalações por número, medidor ou conta contrato.

**Parâmetros:**
- `query` (ARRAY) - Lista de valores para buscar
- `type` (STRING) - 'instalacao', 'medidor' ou 'contacontrato'

**Retorno:** Dados das instalações

**Endpoints que usam:**
- `POST /search_in`

---

#### 7.2 `get_instalation_matriz` (agentes.js:306)

**Query:**
```sql
SELECT * FROM matriz
WHERE TRIM(instalacao) = TRIM($1)
AND data_leit_prev::date = TO_DATE($2, 'DD/MM/YYYY')
```

**Descrição:** Busca registro único da matriz para uma instalação e data.

**Parâmetros:**
- `$1` - instalacao (TEXT)
- `$2` - data_leit_prev (DD/MM/YYYY)

**Retorno:** Registro único ou objeto vazio

**Endpoints que usam:**
- `GET /get_justify`

---

### 8. Tabela: `matriz` - Queries de Perdas/CNL/C12

#### 8.1 `get_predicted` (agentes.js:330)

**Query:**
```sql
SELECT instalacao, etapa, seccional, regional, agente, nome_agente, ntlei, apontamento, 
       perda_prevista_mensal, tipo_perda, status_perda, tem_perda, concluido, motivo_perda,
       TO_CHAR(data_leit_prev, 'DD/MM/YYYY') as data_leit_prev,
       TO_CHAR(data_conclusao, 'DD/MM/YYYY') as data_conclusao,
       TO_CHAR(data_conclusao, 'HH24:MI') as hora_conclusao,
       CASE 
           WHEN tipo_perda LIKE '%87%' THEN 'LER OU APONTAR ' || COALESCE(apontamento, '')
           WHEN tipo_perda LIKE '%113%' AND status_perda = 'SEM PERDA' THEN 'LER OU APONTAR ' || COALESCE(apontamento, '')
           ELSE 'LER OU ENTRAR EM CONTATO COM A MONITORIA'
       END as action
FROM matriz 
WHERE agente IN ($1, $2) 
AND concluido = $3 
AND (perda_prevista_mensal::TEXT ~ '^[0-9]') 
AND REPLACE(perda_prevista_mensal::TEXT, ',', '.')::NUMERIC > 0
ORDER BY etapa ASC, data_leit_prev ASC
LIMIT $4 OFFSET $5
```

**Descrição:** Busca leituras com perda prevista maior que zero.

**Parâmetros:**
- `$1` - id (uppercase)
- `$2` - id (lowercase)
- `$3` - status ('PENDENTE' ou 'CONCLUIDO')
- `$4` - limit
- `$5` - offset

**Retorno:** Leituras com perda prevista, incluindo coordenadas calculadas via JOIN com `dados_instalacoes`

**Endpoints que usam:**
- `GET /predicted`

---

#### 8.2 `c12_Json` (c12.js:8-51)

**Query Completa:**
```sql
WITH target_installations AS (
    SELECT DISTINCT instalacao 
    FROM matriz 
    WHERE data_conclusao >= TO_DATE($1, 'DD/MM/YYYY') 
    AND data_conclusao < TO_DATE($2, 'DD/MM/YYYY') + interval '1 day'
    AND ntlei = 'C12'
),
base_calculos AS (
    SELECT 
        instalacao, etapa, seccional, regional, ntlei, agente, nome_agente, supervisor,
        status_ds, data_conclusao, latitude, longitude, tipo_perda,
        LAG(ntlei) OVER (PARTITION BY instalacao ORDER BY data_conclusao) as ntlei_ant,
        LAG(ntlei, 2) OVER (PARTITION BY instalacao ORDER BY data_conclusao) as ntlei_ant2,
        LAG(data_conclusao) OVER (PARTITION BY agente, data_conclusao::date ORDER BY data_conclusao) as conclusao_anterior
    FROM matriz
    WHERE instalacao IN (SELECT instalacao FROM target_installations)
),
calculo_tempo AS (
    SELECT *,
        COALESCE(ROUND(EXTRACT(EPOCH FROM (data_conclusao - conclusao_anterior)))::INTEGER, 60) as tempo_execucao_segundos
    FROM base_calculos
)
SELECT 
    instalacao, etapa, seccional, regional, ntlei, ntlei_ant, ntlei_ant2, 
    agente, nome_agente, supervisor, status_ds, data_conclusao, latitude, longitude,
    tempo_execucao_segundos,
    to_char(tempo_execucao_segundos * interval '1 second', 'HH24:MI:SS') as tempo_formatado
FROM calculo_tempo
WHERE data_conclusao >= TO_DATE($1, 'DD/MM/YYYY') 
AND data_conclusao < TO_DATE($2, 'DD/MM/YYYY') + interval '1 day')
AND ntlei = 'C12'
AND status_ds = 'LG'
AND tipo_perda NOT LIKE 'CLIENTE CR SEM EVOLUCAO%'
ORDER BY agente, data_conclusao;
```

**Descrição:** Busca leituras C12 completas com histórico (ntlei anterior) e cálculo de tempo de execução entre serviços.

**Parâmetros:**
- `$1` - dateinit (DD/MM/YYYY)
- `$2` - dateend (DD/MM/YYYY)
- `$3` - regional (opcional)

**Retorno:** Leituras C12 com ntlei_ant, ntlei_ant2, tempo_execucao_segundos

**Endpoints que usam:**
- `GET /c12_json`

---

#### 8.3 `C12ToLidoJson` (c12.js:74-96)

**Query:**
```sql
WITH target_installations AS (
    SELECT DISTINCT instalacao 
    FROM matriz 
    WHERE data_conclusao >= TO_DATE($1, 'DD/MM/YYYY')
    AND data_conclusao < TO_DATE($1, 'DD/MM/YYYY') + interval '1 day'
),
historico_agentes AS (
    SELECT 
        instalacao, etapa, seccional, regional, ntlei, agente, nome_agente,
        status_ds, data_conclusao, latitude, longitude,
        LAG(ntlei) OVER (PARTITION BY instalacao ORDER BY data_conclusao) as ntlei_ant,
        LAG(ntlei, 2) OVER (PARTITION BY instalacao ORDER BY data_conclusao) as ntlei_ant2
    FROM matriz
    WHERE instalacao IN (SELECT instalacao FROM target_installations)
)
SELECT instalacao, etapa, seccional, regional, ntlei, agente, nome_agente,
    status_ds, data_conclusao, latitude, longitude
FROM historico_agentes
WHERE data_conclusao >= TO_DATE($1, 'DD/MM/YYYY')
AND data_conclusao < TO_DATE($1, 'DD/MM/YYYY') + interval '1 day'
AND (ntlei LIKE 'A%' OR ntlei IN ('B09', 'B10', 'B15'))
AND (ntlei_ant = 'C12')
AND (ntlei_ant2 = 'C12');
```

**Descrição:** Busca instalações que foram lidas (A ou B) após dois C12 consecutivos.

**Parâmetros:**
- `$1` - dateinit (DD/MM/YYYY)
- `$2` - regional (opcional)

**Retorno:** Leituras que "saíram" do C12 (foram para lido)

**Endpoints que usam:**
- `GET /c12_to_lido_json`

---

#### 8.4 `firstC12ForAgent` (c12.js:237-261)

**Query:**
```sql
WITH base AS (
    SELECT 
        instalacao, etapa, ntlei, data_conclusao, data_leit_prev, agente, tem_perda, 
        perda_prevista_mensal, nome_agente, latitude, longitude, status_ds,
        ROW_NUMBER() OVER (PARTITION BY instalacao ORDER BY data_conclusao) as rn
    FROM matriz
    WHERE UPPER(agente) = UPPER($1)
    AND data_conclusao >= TO_DATE($2, 'DD/MM/YYYY')
    AND data_conclusao < TO_DATE($2, 'DD/MM/YYYY') + interval '1 day'
    AND ntlei = 'C12'
    AND status_ds = 'LG'
),
com_anterior AS (
    SELECT b.*,
        LAG(b.ntlei) OVER (PARTITION BY b.instalacao ORDER BY b.data_conclusao) as ntlei_ant,
        LAG(b.ntlei, 2) OVER (PARTITION BY b.instalacao ORDER BY b.data_conclusao) as ntlei_ant2
    FROM base b
)
SELECT instalacao, etapa, ntlei, data_conclusao, data_leit_prev, agente, tem_perda, 
       nome_agente, latitude, longitude
FROM com_anterior
WHERE (ntlei_ant LIKE 'A%' OR ntlei_ant IN ('B09', 'B10', 'B15'))
AND (ntlei_ant2 LIKE 'A%' OR ntlei_ant2 IN ('B09', 'B10', 'B15'))
LIMIT $3 OFFSET $4;
```

**Descrição:** Busca primeiros C12 do dia para um agente (após leituras A ou B).

**Parâmetros:**
- `$1` - id (TEXT)
- `$2` - date (DD/MM/YYYY)
- `$3` - limit
- `$4` - offset

**Retorno:** Primeiros C12 do agente após CNL

**Endpoints que usam:**
- `GET /agent_dashboard`
- `GET /agent_services?filter=first_c12`

---

#### 8.5 `fastC12ForAgent` (c12.js:191-222)

**Query:**
```sql
WITH timeline_agente AS (
    SELECT *,
        LAG(data_conclusao) OVER (PARTITION BY agente, data_conclusao::date ORDER BY data_conclusao) as conclusao_anterior
    FROM matriz
    WHERE UPPER(agente) = UPPER($1)
    AND data_conclusao >= TO_DATE($2, 'DD/MM/YYYY')
    AND data_conclusao < TO_DATE($2, 'DD/MM/YYYY') + interval '1 day'
),
calculo_tempo AS (
    SELECT *,
        COALESCE(EXTRACT(EPOCH FROM (data_conclusao - conclusao_anterior)), 60) as tempo_execucao_segundos
    FROM timeline_agente
)
SELECT 
    instalacao, etapa, seccional, regional, ntlei, agente, nome_agente, supervisor,
    status_ds, data_conclusao, latitude, longitude, data_leit_prev,
    tempo_execucao_segundos,
    to_char((tempo_execucao_segundos || ' seconds')::interval, 'HH24:MI:SS') as tempo_formatado
FROM calculo_tempo
WHERE ntlei = 'C12'
AND status_ds = 'LG'
AND tempo_execucao_segundos < 60
ORDER BY data_conclusao ASC
LIMIT $3 OFFSET $4;
```

**Descrição:** Busca C12 executados em menos de 60 segundos (leitura muito rápida/可疑).

**Parâmetros:**
- `$1` - id (TEXT)
- `$2` - date (DD/MM/YYYY)
- `$3` - limit
- `$4` - offset

**Retorno:** C12 rápidos (<60 segundos)

**Endpoints que usam:**
- `GET /agent_dashboard`
- `GET /agent_services?filter=fast_c12`

---

#### 8.6 `licacaoNovaC12ForAgent` (c12.js:149-176)

**Query:**
```sql
WITH installations_today AS (
    SELECT DISTINCT instalacao 
    FROM matriz 
    WHERE UPPER(agente) = UPPER($1)
    AND data_conclusao >= TO_DATE($2, 'DD/MM/YYYY')
    AND data_conclusao < TO_DATE($2, 'DD/MM/YYYY') + interval '1 day'
),
historico_agentes AS (
    SELECT instalacao, etapa, seccional, regional, ntlei, agente, nome_agente, supervisor,
           status_ds, data_conclusao, latitude, longitude,
           LAG(ntlei) OVER (PARTITION BY instalacao ORDER BY data_conclusao) as ntlei_ant,
           LAG(ntlei, 2) OVER (PARTITION BY instalacao ORDER BY data_conclusao) as ntlei_ant2
    FROM matriz
    WHERE instalacao IN (SELECT instalacao FROM installations_today)
)
SELECT instalacao, etapa, seccional, regional, ntlei, agente, nome_agente,
       status_ds, data_conclusao, latitude, longitude
FROM historico_agentes
WHERE UPPER(agente) = UPPER($1)
AND data_conclusao >= TO_DATE($2, 'DD/MM/YYYY')
AND data_conclusao < TO_DATE($2, 'DD/MM/YYYY') + interval '1 day'
AND ntlei = 'C12'
AND instalacao LIKE '200%'
AND status_ds = 'LG'
ORDER BY data_conclusao;
```

**Descrição:** Busca C12 de ligações novas (instalações iniciadas com 200).

**Parâmetros:**
- `$1` - id (TEXT)
- `$2` - date (DD/MM/YYYY)

**Retorno:** C12 de ligações novas

**Endpoints que usam:**
- `GET /agent_dashboard`

---

### 9. Tabela: `matriz` - Queries de Pendências/Serviços

#### 9.1 `pendencias` (pendencias.js:6)

**Query:**
```sql
SELECT instalacao, etapa, seccional, regional, concluido
FROM matriz
WHERE concluido = 'PENDENTE'
AND TO_CHAR(data_leit_prev, 'MM.YYYY') = TO_CHAR(CURRENT_DATE, 'MM.YYYY')
[AND regional = $1]
```

**Descrição:** Lista instalações pendentes no mês atual.

**Parâmetros:**
- `$1` - regional (opcional)

**Retorno:** Texto formatado agrupado por regional/seccional/etapa

**Endpoints que usam:**
- `GET /pendencias`

---

#### 9.2 `pendenciasJson` (pendencias.js:57)

**Query:**
```sql
SELECT instalacao, etapa, seccional, regional, concluido, data_leit_prev, agente, nome_agente, supervisor
FROM matriz
WHERE concluido = 'PENDENTE'
AND TO_CHAR(data_leit_prev, 'MM.YYYY') = TO_CHAR(CURRENT_DATE, 'MM.YYYY')
[AND regional = $1]
```

**Descrição:** Versão JSON das pendências com mais detalhes.

**Parâmetros:**
- `$1` - regional (opcional)

**Retorno:** Array de pendências detalhadas

**Endpoints que usam:**
- `GET /pendencias_json`

---

#### 9.3 `notStartServices` (pendencias.js:74)

**Query:**
```sql
SELECT 
    agente, nome_agente, seccional, regional, supervisor,
    COUNT(*) FILTER (WHERE concluido = 'CONCLUIDO' AND data_conclusao::date = CURRENT_DATE) AS total_concluidas,
    COUNT(*) FILTER (WHERE concluido <> 'CONCLUIDO') AS total_pend,
    TO_CHAR(CURRENT_DATE, 'DD/MM/YYYY') AS date
FROM matriz
WHERE TO_CHAR(data_leit_prev, 'MM.YYYY') = TO_CHAR(CURRENT_DATE, 'MM.YYYY')
AND agente <> ''
GROUP BY agente, nome_agente, supervisor, seccional, regional
HAVING 
    COUNT(*) FILTER (WHERE concluido = 'CONCLUIDO' AND data_conclusao::date = CURRENT_DATE) = 0
    AND COUNT(*) FILTER (WHERE concluido <> 'CONCLUIDO') > 0;
```

**Descrição:** Identifica agentes que não iniciaram serviços hoje mas têm pendências.

**Retorno:** Lista de agentes com total de pendentes

**Endpoints que usam:**
- `GET /not_start_services`

---

#### 9.4 `completedServices` (pendencias.js:99-154)

**Query:**
```sql
WITH servicos_detalhados AS (
    SELECT 
        agente, nome_agente, seccional, regional, concluido, data_conclusao, data_leit_prev, supervisor,
        data_conclusao::time as hora_fim_time,
        LAG(data_conclusao::time) OVER (PARTITION BY agente, data_conclusao::date ORDER BY data_conclusao) as hora_fim_anterior
    FROM matriz
    WHERE agente <> ''
    AND ((concluido = 'CONCLUIDO' AND data_conclusao::date = CURRENT_DATE) OR concluido = 'PENDENTE')
),
calculo_intervalos AS (
    SELECT *,
        CASE 
            WHEN concluido <> 'CONCLUIDO' THEN INTERVAL '0'
            WHEN hora_fim_anterior IS NULL THEN INTERVAL '60 seconds'
            ELSE (hora_fim_time - hora_fim_anterior)
        END as diff_servico
    FROM servicos_detalhados
)
SELECT 
    agente, nome_agente, seccional, regional, supervisor,
    COUNT(*) FILTER (WHERE concluido = 'CONCLUIDO' AND data_conclusao::date = CURRENT_DATE) AS total_conc,
    COUNT(*) FILTER (WHERE concluido = 'PENDENTE') AS total_pend,
    TO_CHAR(MIN(hora_fim_time) FILTER (WHERE concluido = 'CONCLUIDO'), 'HH24:MI:SS') as hora_inicio,
    TO_CHAR(MAX(hora_fim_time) FILTER (WHERE concluido = 'CONCLUIDO'), 'HH24:MI:SS') as hora_fim,
    TO_CHAR(SUM(diff_servico), 'HH24:MI:SS') as tempo_total,
    TO_CHAR(SUM(CASE WHEN diff_servico > INTERVAL '20 minutes' THEN diff_servico ELSE INTERVAL '0' END), 'HH24:MI:SS') as tempo_pausas
FROM calculo_intervalos
WHERE TO_CHAR(data_leit_prev, 'MM.YYYY') = TO_CHAR(CURRENT_DATE, 'MM.YYYY')
GROUP BY agente, nome_agente, supervisor, seccional, regional
HAVING COUNT(*) FILTER (WHERE concluido = 'CONCLUIDO' AND data_conclusao::date = CURRENT_DATE) > 10
AND COUNT(*) FILTER (WHERE concluido = 'PENDENTE') = 0;
```

**Descrição:** Identifica agentes que completaram todos os serviços (sem pendências).

**Regras de negócio:**
- Primeiro serviço do dia = 60 segundos
- Serviços com intervalo > 20 min = pausa
- Mínimo 10 concluídos hoje
- Zero pendentes

**Retorno:** Estatísticas de tempo e contagem

**Endpoints que usam:**
- `GET /completed_services`

---

#### 9.5 `incompletedServices` (pendencias.js:162-219)

Mesma estrutura de `completedServices`, mas com HAVING diferente:

```sql
HAVING COUNT(*) FILTER (WHERE concluido = 'CONCLUIDO' AND data_conclusao::date = CURRENT_DATE) > 10
AND COUNT(*) FILTER (WHERE concluido = 'PENDENTE') > 10;
```

**Descrição:** Identifica agentes com mais de 10 pendências.

**Retorno:** Agentes com pendências

**Endpoints que usam:**
- `GET /incompleted_services`

---

### 10. Tabela: `matriz` - Queries CNL/E02/C16

#### 10.1 `cnl` (cnl.js:8)

**Query:**
```sql
SELECT instalacao, etapa, seccional, regional, ntlei, concluido, status_ds
FROM matriz
WHERE data_conclusao::date BETWEEN TO_DATE($1, 'DD.MM.YYYY') AND TO_DATE($2, 'DD.MM.YYYY')
AND concluido = 'CONCLUIDO'
AND ntlei NOT LIKE 'A%'
AND ntlei NOT IN ('B09', 'B10', 'B15')
AND status_ds = 'LG'
```

**Descrição:** Lista Leituras CNL (Código Não Lido) por período.

**Parâmetros:**
- `$1` - dateinit (DD.MM.YYYY)
- `$2` - dateend (DD.MM.YYYY)
- `$3` - regional (opcional)

**Retorno:** Contagens agrupadas por regional/seccional

**Endpoints que usam:**
- `GET /cnl`

---

#### 10.2 `firstCNLJson` (cnl.js:59)

**Query:**
```sql
WITH historico_agentes AS (
    SELECT instalacao, etapa, seccional, regional, ntlei, agente, nome_agente, supervisor,
           status_ds, data_conclusao, latitude, longitude,
           LAG(ntlei) OVER (PARTITION BY instalacao ORDER BY data_conclusao) as ntlei_ant,
           LAG(ntlei, 2) OVER (PARTITION BY instalacao ORDER BY data_conclusao) as ntlei_ant2
    FROM matriz
)
SELECT instalacao, etapa, seccional, regional, ntlei, agente, nome_agente, supervisor,
       status_ds, data_conclusao, latitude, longitude
FROM historico_agentes
WHERE data_conclusao::date BETWEEN TO_DATE($1, 'DD.MM.YYYY') AND TO_DATE($2, 'DD.MM.YYYY')
AND (ntlei NOT LIKE 'A%' AND ntlei NOT IN ('B09', 'B10', 'B15'))
AND (ntlei_ant LIKE 'A%' OR ntlei_ant IN ('B09', 'B10', 'B15'))
AND (ntlei_ant2 LIKE 'A%' OR ntlei_ant2 IN ('B09', 'B10', 'B15'))
```

**Descrição:** Busca primeiras Leituras CNL após código A ou B.

**Parâmetros:**
- `$1` - dateinit (DD.MM.YYYY)
- `$2` - dateend (DD.MM.YYYY)
- `$3` - regional (opcional)

**Retorno:** Primeiras CNL do agente após CNL lido

**Endpoints que usam:**
- `GET /first_cnl_json`

---

#### 10.3 `CNLToLidoJson` (cnl.js:92)

**Query:**
```sql
WITH historico_agentes AS (
    SELECT instalacao, etapa, seccional, regional, ntlei, agente, nome_agente,
           status_ds, data_conclusao, latitude, longitude,
           LAG(ntlei) OVER (PARTITION BY instalacao ORDER BY data_conclusao) as ntlei_ant,
           LAG(ntlei, 2) OVER (PARTITION BY instalacao ORDER BY data_conclusao) as ntlei_ant2
    FROM matriz
)
SELECT instalacao, etapa, seccional, regional, ntlei, agente, nome_agente,
       status_ds, data_conclusao, latitude, longitude
FROM historico_agentes
WHERE data_conclusao::date = TO_DATE($1, 'DD.MM.YYYY')
AND (ntlei LIKE 'A%' OR ntlei IN ('B09', 'B10', 'B15'))
AND (ntlei_ant NOT LIKE 'A%' AND ntlei_ant NOT IN ('B09', 'B10', 'B15'))
AND (ntlei_ant2 NOT LIKE 'A%' AND ntlei_ant2 NOT IN ('B09', 'B10', 'B15'));
```

**Descrição:** Busca Leituras A/B que foram lidas após CNL (inversão).

**Parâmetros:**
- `$1` - dateinit (DD.MM.YYYY)
- `$2` - regional (opcional)

**Retorno:** Leituras A/B que saíram de CNL

**Endpoints que usam:**
- `GET /cnl_to_lido_json`

---

#### 10.4 `e02Json` (cnlSemReceita.js:8)

**Query:**
```sql
SELECT instalacao, etapa, seccional, regional, ntlei, agente, nome_agente, supervisor,
       status_ds, data_conclusao, latitude, longitude
FROM matriz
WHERE data_conclusao::date BETWEEN TO_DATE($1, 'DD.MM.YYYY') AND TO_DATE($2, 'DD.MM.YYYY')
AND ntlei = 'E02'
```

**Descrição:** Busca Leituras E02 (sem receita).

**Parâmetros:**
- `$1` - dateinit (DD.MM.YYYY)
- `$2` - dateend (DD.MM.YYYY)
- `$3` - regional (opcional)

**Retorno:** Leituras E02

**Endpoints que usam:**
- `GET /e02_json`

---

#### 10.5 `c16Json` (cnlSemReceita.js:32)

**Query:**
```sql
SELECT instalacao, etapa, seccional, regional, ntlei, agente, nome_agente, supervisor,
       status_ds, data_conclusao, latitude, longitude
FROM matriz
WHERE data_conclusao::date BETWEEN TO_DATE($1, 'DD.MM.YYYY') AND TO_DATE($2, 'DD.MM.YYYY')
AND ntlei = 'C16'
```

**Descrição:** Busca Leituras C16.

**Parâmetros:**
- `$1` - dateinit (DD.MM.YYYY)
- `$2` - dateend (DD.MM.YYYY)
- `$3` - regional (opcional)

**Retorno:** Leituras C16

**Endpoints que usam:**
- `GET /c16_json`

---

### 11. Tabela: `matriz` - Queries de Perdas

#### 11.1 `perdas` (perdas.js:8)

**Query:**
```sql
SELECT instalacao, etapa, seccional, regional, ntlei,
       apontamento, tem_perda, motivo_perda, perda_prevista_mensal
FROM matriz
WHERE data_conclusao::date BETWEEN TO_DATE($1, 'DD.MM.YYYY') AND TO_DATE($2, 'DD.MM.YYYY')
AND tem_perda = 'PERDA'
AND perda_prevista_mensal <> '0'
```

**Descrição:** Lista instalações com perda no período.

**Parâmetros:**
- `$1` - dateinit (DD.MM.YYYY)
- `$2` - dateend (DD.MM.YYYY)
- `$3` - regional (opcional)

**Retorno:** Texto formatado com totais por regional/seccional

**Endpoints que usam:**
- `GET /perdas`

---

#### 11.2 `perdasJson` (perdas.js:57)

**Query:**
```sql
SELECT instalacao, etapa, seccional, regional, motivo_perda,
       perda_prevista_mensal, agente, nome_agente, latitude, longitude, data_conclusao, 
       supervisor, tipo_perda, status_perda, ntlei as apontamento_atual, 
       apontamento as apontamento_anterior, grupo_cnl
FROM matriz
WHERE data_conclusao::date BETWEEN TO_DATE($1, 'DD.MM.YYYY') AND TO_DATE($2, 'DD.MM.YYYY')
AND tem_perda = 'PERDA'
AND perda_prevista_mensal <> '0'
```

**Descrição:** Versão JSON detalhada das perdas.

**Parâmetros:**
- `$1` - dateinit (DD.MM.YYYY)
- `$2` - dateend (DD.MM.YYYY)
- `$3` - regional (opcional)

**Retorno:** Array de perdas com detalhes completos

**Endpoints que usam:**
- `GET /perdas_json`

---

### 12. Tabela: `matriz` - Queries de Pontualidade

#### 12.1 `pontualidade` (pontualidade.js:27)

**Query:**
```sql
SELECT * FROM matriz
WHERE TO_CHAR(data_leit_prev, 'MM.YYYY') = TO_CHAR(CURRENT_DATE, 'MM.YYYY')
[AND regional = $1]
```

**Descrição:** Busca todas as instalações do mês para cálculo de pontualidade.

**Parâmetros:**
- `$1` - regional (opcional)

**Retorno:** Texto formatado com percentuais por regional/seccional/etapa

**Regras de pontualidade:**
- Etapas 25-30: +3 dias úteis
- Outras etapas: +1 dia útil
- Considera feriados da tabela `feriados`

**Endpoints que usam:**
- `GET /pontualidade`

---

#### 12.2 `pontualidadeJson` (pontualidade.js:109)

Mesma query base que `pontualidade`, mas processa dados para formato JSON.

**Descrição:** Retorna métricas detalhadas de pontualidade.

**Retorno:**
```json
{
  "regional": "...",
  "seccional": "...",
  "etapas": [
    {
      "etapa": "1",
      "percentual": "85.00",
      "status": "PARCIAL",
      "quant_dias_adicionais": 1,
      "data_prev": "17/04/2026 00:00",
      "limite": "20/04/2026 10:00",
      "np": 85,
      "fp": 10,
      "pend": 5
    }
  ]
}
```

**Endpoints que usam:**
- `GET /pontualidade_json`

---

### 13. Tabela: `vars` - Queries de Status

#### 13.1 `lastUpdate` (status.js:6)

**Queries:**
```sql
SELECT nome as title, data as value
FROM vars
WHERE nome IN ('abap2_hora', 'abap_hora')

SELECT MAX(data_conclusao) as value
FROM matriz 
WHERE data_conclusao >= date_trunc('month', CURRENT_DATE)
AND data_conclusao < date_trunc('month', CURRENT_DATE) + interval '1 month'
```

**Descrição:** Retorna informações de última atualização do sistema.

**Retorno:**
- `abap2_hora` - Horário do último processamento
- `abap_hora` - Horário de outra atualização
- `last_register` - Data/hora do último registro na matriz

**Endpoints que usam:**
- `GET /last_update` (com token)
- `GET /last_update_agent`

---

### 14. Tabela: `feriados`

**Query:**
```sql
SELECT date FROM feriados
```

**Descrição:** Busca datas de feriados para cálculo de dias úteis.

**Retorno:** Lista de datas de feriados

**Endpoints que usam:** Interno para `pontualidade`/`pontualidadeJson`

---

### 15. Tabela: `login`

**Query:**
```sql
SELECT * FROM login 
WHERE id IN ('ID_UPPER', 'id_lower')
```

**Descrição:** Busca dados do agente.

**Retorno:** Dados do agente (inclui telegram_id)

**Endpoints que usam:**
- `GET /agent_telegram_id`

---

### 16. `getWeeklyCNLStats` (agentes.js:549)

**Query:**
```sql
SELECT 
    EXTRACT(ISODOW FROM data_conclusao)::INTEGER as dow,
    COUNT(*)::INTEGER as total
FROM matriz
WHERE agente IN ($1, $2)
AND data_conclusao >= date_trunc('week', TO_DATE($3, 'DD/MM/YYYY'))
AND data_conclusao < date_trunc('week', TO_DATE($3, 'DD/MM/YYYY')) + interval '6 days'
AND ntlei NOT LIKE 'A%'
AND ntlei NOT IN ('B09', 'B10', 'B15')
GROUP BY 1
ORDER BY 1;
```

**Descrição:** Estatísticas CNL por dia da semana para um agente.

**Parâmetros:**
- `$1` - id (uppercase)
- `$2` - id (lowercase)
- `$3` - date (DD.MM.YYYY)

**Retorno:**
```json
{
  "labels": ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab"],
  "series": [10, 15, 8, 12, 20, 0]
}
```

**Regras especiais:**
- Dias futuros são zerados
- Domingo não é incluído

**Endpoints que usam:**
- `GET /agent_dashboard`

---

## Resumo dos Endpoints e suas Queries

| Endpoint | Method | Query Principal | Função |
|----------|--------|----------------|--------|
| `/agent_dashboard` | GET | `getLeiturasForAgent`, `firstC12ForAgent`, `fastC12ForAgent`, `licacaoNovaC12ForAgent`, `getWeeklyCNLStats` | Dashboard completo do agente |
| `/agent_services` | GET | `getLeiturasForAgent`, `checkJustifiedByInstallations` | Lista de leituras com filtros |
| `/search_in` | POST | `get_instalations` | Busca instalações por número |
| `/predicted` | GET | `get_predicted`, `checkJustifiedByInstallations` | Leituras com perda prevista |
| `/last_update_agent` | GET | `lastUpdate` | Última atualização do sistema |
| `/get_justify` | GET | `get_justify`, `get_instalation_matriz` | Busca justificativa |
| `/create_justify` | POST | `get_justify`, `save_justify` | Cria justificativa |
| `/update_justify` | PUT | `update_justify` | Atualiza justificativa |
| `/delete_justify/:id` | DELETE | `delete_justify` | Remove justificativa |
| `/justify_pending/:id/respond` | PUT | `get_pending_justify_by_id`, `respond_pending_justify` | Responde justificativa pendente |
| `/justify_pending/:id` | GET | `get_pending_justify_by_id` | Busca justificativa pendente |
| `/justify_pending` | GET | `get_pending_justifies` | Lista justificativas pendentes |
| `/daily_report` | POST | `get_daily_report_today`, `save_daily_report` | Cria reporte diário |
| `/daily_report` | GET | `get_daily_reports` | Lista reportes |
| `/daily_report/check_today` | GET | `get_daily_report_today` | Verifica se já fez reporte hoje |
| `/inventory` | GET | `get_inventory_by_agent` | Busca inventário |
| `/inventory` | POST | `save_inventory` | Salva inventário |
| `/calendar` | GET | `getCalendarForAgent` | Retorna etapas do calendário |
| `/last_update` | GET | `lastUpdate` | Info de atualização (token) |
| `/pendencias` | GET | `pendencias` | Lista pendências em texto |
| `/pendencias_json` | GET | `pendenciasJson` | Lista pendências em JSON |
| `/cnl` | GET | `cnl` | Leituras CNL |
| `/c12_json` | GET | `c12_Json` | Leituras C12 completas |
| `/c12_to_lido_json` | GET | `C12ToLidoJson` | C12 para lido |
| `/first_c12_json` | GET | `firstC12ForAgent` | Primeiros C12 |
| `/fast_c12_json` | GET | `fastC12ForAgent` | C12 rápidos (<60s) |
| `/licacao_nova_c12_json` | GET | `licacaoNovaC12ForAgent` | C12 ligação nova |
| `/e02_json` | GET | `e02Json` | Leituras E02 |
| `/c16_json` | GET | `c16Json` | Leituras C16 |
| `/perdas` | GET | `perdas` | Perdas em texto |
| `/perdas_json` | GET | `perdasJson` | Perdas em JSON |
| `/pontualidade` | GET | `pontualidade` | Pontualidade em texto |
| `/pontualidade_json` | GET | `pontualidadeJson` | Pontualidade em JSON |
| `/not_start_services` | GET | `notStartServices` | Agentes sem iniciar |
| `/completed_services` | GET | `completedServices` | Agentes que completaram |
| `/incompleted_services` | GET | `incompletedServices` | Agentes incompletos |
| `/first_cnl_json` | GET | `firstCNLJson` | Primeiros CNL |
| `/cnl_to_lido_json` | GET | `CNLToLidoJson` | CNL para lido |
| `/agent_telegram_id` | GET | `getAgentTelegramId` | ID Telegram do agente |
| `/generate_token` | GET | `INSERT telegram_tokens` | Gera token Telegram |

---

## Glossário de Códigos

### Tipos de Leitura (ntlei)
| Código | Descrição |
|--------|-----------|
| `A01`, `A02`, etc. | Leituras normais (iniciam com A) |
| `B09`, `B10`, `B15` | Leituras estimadas |
| `C12` | Ligação nova |
| `C16` | Código especial |
| `E02` | Sem receita |
| CNL | Código Não Lido (não inicia com A, não é B09/B10/B15) |

### Status
| Status | Descrição |
|--------|-----------|
| `CONCLUIDO` | Serviço concluído |
| `PENDENTE` | Serviço pendente |
| `LG` | Ligado (status_ds) |
| `PERDA` | Indica perda |

---

## Arquivos de Origem

| Arquivo | Descrição |
|---------|-----------|
| `src/functions/database/agentes.js` | Queries de agentes, justificativas, reportes |
| `src/functions/database/c12.js` | Queries específicas de C12 |
| `src/functions/database/pendencias.js` | Queries de pendências e serviços |
| `src/functions/database/cnl.js` | Queries de CNL |
| `src/functions/database/cnlSemReceita.js` | Queries E02 e C16 |
| `src/functions/database/perdas.js` | Queries de perdas |
| `src/functions/database/pontualidade.js` | Queries de pontualidade |
| `src/functions/database/status.js` | Queries de status/atualização |
| `src/routes/agente.js` | Endpoints de agentes |
| `src/routes/consultas.js` | Endpoints públicos (com token) |
| `src/routes/public.js` | Endpoints públicos |
