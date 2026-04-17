# Feature: Busca de Instalação

## Overview

Módulo para buscar instalações por número, medidor ou conta contrato, exibindo em um mapa interativo com informações da instalação e linhas conectando coordenadas da mesma instalação.

## Perfis com acesso

- **COMPANY_ADMIN**: Acesso completo
- **USER**: Acesso via permissão granular

## Estados suportados

- `PI` - Piauí (usa `DATABASE_PI_URL`)
- `MA` - Maranhão (usa `DATABASE_MA_URL`)

---

## Endpoints

### `POST /api/v1/installations/search`

Busca instalações por número, medidor ou conta contrato.

**Autenticação:** Bearer Token (JWT)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Body:**
```json
{
  "query": "123456789",
  "type": "instalacao",
  "state": "PI"
}
```

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `query` | string | Sim | Termo de busca (mín. 3 caracteres) |
| `type` | string | Não | `instalacao` (padrão), `medidor`, `conta_contrato` |
| `state` | string | Não | `PI` (padrão), `MA` |

**Resposta:**
```json
{
  "success": true,
  "data": {
    "installations": [
      {
        "instalacao": "123456789",
        "medidor": "987654321",
        "conta_contrato": "CON-001",
        "cliente": "João Silva",
        "endereco": "Rua X, 123",
        "bairro": "Centro",
        "cidade": "Teresina",
        "cep": "64000-000",
        "coordinates": {
          "lat_cad": "-5.0891",
          "long_cad": "-42.8019",
          "lat_leitura": "-5.0892",
          "long_leitura": "-42.8020",
          "lat_lig": "-5.0893",
          "long_lig": "-42.8021"
        },
        "matriz": {
          "etapa": "1",
          "seccional": "TERESINA SUL",
          "regional": "TERESINA",
          "ntlei": "A01",
          "status_ds": "LG",
          "data_leit_prev": "15.04.2026",
          "agente": "joao.silva",
          "nome_agente": "João Silva"
        }
      }
    ],
    "total": 1
  }
}
```

---

### `GET /api/v1/installations/:instalacao/matrix`

Busca detalhes de uma instalação específica na matriz.

**Autenticação:** Bearer Token (JWT)

**Query Params:**
| Param | Tipo | Padrão | Descrição |
|-------|------|---------|-----------|
| `state` | string | `PI` | Estado da instalação |
| `date` | string | hoje | Data no formato `DD.MM.YYYY` |

**Resposta:**
```json
{
  "success": true,
  "data": {
    "instalacao": "123456789",
    "etapa": "1",
    "seccional": "TERESINA SUL",
    "regional": "TERESINA",
    "ntlei": "A01",
    "status_ds": "LG",
    "data_leit_prev": "15.04.2026",
    "data_conclusao": null,
    "concluido": "PENDENTE",
    "tem_perda": null,
    "perda_prevista_mensal": null,
    "latitude": "-5.0891",
    "longitude": "-42.8019",
    "agente": "joao.silva",
    "nome_agente": "João Silva"
  }
}
```

---

## Estrutura do Frontend

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  🔍 Busca: [____________] [Instalação ▼] [Buscar]       │
├───────────────────────────┬─────────────────────────────┤
│                           │  📍 Instalação 123456789   │
│                           │  ─────────────────────     │
│                           │  Cliente: João Silva       │
│       🗺️ Mapa            │  Endereço: Rua X, 123     │
│                           │  Bairro: Centro            │
│   [📍]──────────[📍]     │  Cidade: Teresina          │
│   [📍]                   │  ─────────────────────     │
│                           │  📊 Matriz                 │
│                           │  Etapa: 1                 │
│                           │  Regional: TERESINA        │
│                           │  Tipo: A01                 │
│                           │  Status: LG               │
│                           │  ─────────────────────     │
│                           │  👤 Agente: João Silva    │
├───────────────────────────┴─────────────────────────────┤
│  📋 Histórico de Leituras                             │
│  ┌──────────┬──────────┬──────────┬──────────┐         │
│  │ Data     │ Tipo     │ Status   │ Latitude │         │
│  ├──────────┼──────────┼──────────┼──────────┤         │
│  │ 15.04.26 │ A01      │ LG       │ -5.0891 │         │
│  │ 10.03.26 │ A01      │ LG       │ -5.0892 │         │
│  └──────────┴──────────┴──────────┴──────────┘         │
└─────────────────────────────────────────────────────────┘
```

### Mapa com Linhas

Quando uma instalação tem múltiplas coordenadas, estas devem ser conectadas por linhas:

- **Linha 1**: `lat_cad` → `lat_leitura` (Cadastro → Leitura)
- **Linha 2**: `lat_leitura` → `lat_lig` (Leitura → Ligação)
- **Cores**: 
  - Verde: Se todas coordenadas estão próximas
  - Amarelo: Se há distância moderada
  - Vermelho: Se há distância grande (possível inconsistência)

---

## Queries Utilizadas

| Query | Descrição | Tabela |
|-------|-----------|--------|
| `searchInstallations` | Busca por instalação/medidor/conta | `dados_instalacoes` |
| `getInstallationMatrix` | Dados da matriz | `matriz` |

---

## Variáveis de Ambiente

```env
DATABASE_PI_URL=postgresql://user:pass@host:port/leitura
DATABASE_MA_URL=postgresql://user:pass@host:port/maranhao
DATABASE_LOCATIONS_PI=postgresql://user:pass@host:port/localizacoes
```

---

## Módulo no CenOs

O módulo deve ser registrado como:

```json
{
  "name": "installations",
  "description": "Busca de instalações com mapa",
  "category": "field-operations",
  "isCore": false
}
```

---

## Regras de Negócio

1. **Busca mínima**: 3 caracteres para iniciar busca
2. **Limite de resultados**: Máximo 50 instalações por busca
3. **Coordenadas**: Se não houver coordenadas, mostrar mensagem "Coordenadas não disponíveis"
4. **Estado**: Se o usuário tiver filiais em múltiplos estados, permitir troca de estado
