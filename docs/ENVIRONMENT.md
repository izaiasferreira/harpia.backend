# Variáveis de Ambiente e Configurações (Environment Variables)

Este documento descreve as variáveis de ambiente necessárias para o pleno funcionamento da API Banco.

---

## 1. Configurações Globais

| Variável | Descrição | Exemplo |
|---|---|---|
| `PORT` | Porta na qual o servidor Express principal será executado. | `3040` |
| `JWT_SECRET` | Segredo alfanumérico utilizado para assinar e validar tokens JWT do Painel de Controle Admin. | `minha_chave_secreta_jwt_admin` |
| `API_TOKEN` | Token estático utilizado para autenticação simples de consultas gerais de relatórios. | `meu_token_estatico_relatorios` |
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

## 3. Armazenamento de Arquivos (MinIO / S3)

Configurações para conexão com o servidor local MinIO ou serviço Amazon S3 para upload e recuperação de fotos de vistorias de campo e avatares de perfis.

| Variável | Descrição | Exemplo |
|---|---|---|
| `MINIO_ENDPOINT` | Host/IP do servidor MinIO. | `192.168.1.100` |
| `MINIO_PORT` | Porta de rede do serviço MinIO (geralmente porta do console de API S3). | `9000` |
| `MINIO_ACCESS_KEY` | Chave de acesso (Access Key) do MinIO. | `cenosaccess` |
| `MINIO_SECRET_KEY` | Chave secreta (Secret Key) do MinIO. | `cenossecret` |
| `MINIO_BUCKET` | Nome do bucket padrão para armazenamento das mídias. | `api-banco-dev` |
| `MINIO_USE_SSL` | Define se a conexão com o servidor MinIO utilizará HTTPS/SSL (`true` ou `false`). | `false` |
