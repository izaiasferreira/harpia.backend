# Variáveis de Ambiente e Configurações (Environment Variables)

Este documento descreve as variáveis de ambiente necessárias para o pleno funcionamento da API Banco.

---

## 1. Configurações Globais

| Variável | Descrição | Exemplo |
|---|---|---|
| `PORT` | Porta na qual o servidor Express principal será executado. | `3040` |
| `JWT_SECRET` | Segredo alfanumérico utilizado para assinar e validar tokens JWT do Painel de Controle Admin. | `minha_chave_secreta_jwt_admin` |
| *(removido)* | `API_TOKEN` não é mais usado. Tokens são gerenciados via tabela `api_tokens` no banco, com hash SHA-256. | — |
| `LOGS_PASSWORD` | Senha estática utilizada no cabeçalho `Authorization` para leitura e expurgo de logs. | `senha_secreta_logs` |

---

## 2. Provedores de Inteligência Artificial (LLM)

A API possui um módulo de inteligência artificial modular (utilizado, por exemplo, no Construtor de Formulários IA).

| Variável | Descrição | Exemplo |
|---|---|---|
| `LLM_PROVIDER` | Define o provedor ativo de modelos de linguagem (`openai` ou `gemini`). | `gemini` |
| `LLM_MODEL` | Define o modelo específico a ser invocado no provedor selecionado. | `gemini-2.0-flash` ou `gpt-4o-mini` |
| `OPENAI_API_KEY` | Chave de acesso à API da OpenAI (necessária se `LLM_PROVIDER` for `openai`). | `sk-proj-...` |
| `GEMINI_API_KEY` | Chave de acesso à API do Google Gemini (necessária se `LLM_PROVIDER` for `gemini`). | `AIzaSy...` |

---

## 3. Armazenamento de Arquivos (S3-compatible / Wasabi)

Configurações para conexão com um provedor de storage S3-compatible (ex.: Wasabi, MinIO ou Amazon S3) para upload e recuperação de fotos de vistorias de campo e avatares de perfis.

| Variável | Descrição | Exemplo |
|---|---|---|
| `STORAGE_ENDPOINT` | Endpoint do provedor (Wasabi: `s3.<região>.wasabisys.com`). | `s3.us-central-1.wasabisys.com` |
| `STORAGE_PORT` | Porta do serviço S3 (Wasabi usa 443). | `443` |
| `STORAGE_USE_SSL` | Define se a conexão utilizará HTTPS/SSL (`true` ou `false`). | `true` |
| `STORAGE_ACCESS_KEY` | Chave de acesso (Access Key) do provedor. | `cenosaccess` |
| `STORAGE_SECRET_KEY` | Chave secreta (Secret Key) do provedor. | `cenossecret` |
| `STORAGE_REGION` | Região do provedor (usada na assinatura/`makeBucket`). | `us-central-1` |
| `STORAGE_BUCKET` | Nome do bucket padrão para armazenamento das mídias. | `api-banco-dev` |

> **Legado:** As variáveis `MINIO_*` ainda funcionam como fallback caso `STORAGE_*` não sejam definidas (compatibilidade temporária durante a migração).
