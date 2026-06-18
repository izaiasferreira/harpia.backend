# App Update (Auto-Update Android)

API para gerenciamento de auto-update do aplicativo Android Gedai via self-hosted APK.

Os APKs sao armazenados no bucket `apk` do MinIO e servidos via proxy da API em `/files/apk/:filename`.

---

## Endpoints

### GET /api/app/update/check

Verifica se ha uma nova versao disponivel para download.

**Parametros (Query):**
| Campo | Tipo | Obrigatorio | Descricao |
|---|---|---|---|
| currentVersionCode | int | sim | VersionCode atual do app |

**Response 200:**
```json
{
  "hasUpdate": false,
  "versionCode": 2,
  "versionName": "1.0.1",
  "url": "/files/apk/app-1.0.1.apk",
  "changelog": "Correcao de bugs e melhorias de performance.",
  "forceUpdate": false,
  "releaseDate": "2025-06-03T00:00:00.000Z"
}
```

### GET /api/app/update/versions

Retorna o manifest completo de versoes (latest + historico) a partir do `apk-versions.json`.

**Response 200:**
```json
{
  "latest": {
    "versionCode": 2,
    "versionName": "1.0.1",
    "url": "/files/apk/app-1.0.1.apk",
    "changelog": "Correcao de bugs...",
    "forceUpdate": false,
    "releaseDate": "2025-06-03T00:00:00.000Z"
  },
  "history": [
    { "versionCode": 1, "versionName": "1.0.0", "url": "/files/apk/app-1.0.0.apk", ... }
  ]
}
```

### GET /api/app/update/bucket-files

Lista todos os arquivos APK atualmente presentes no bucket `apk` do MinIO.

**Response 200:**
```json
{
  "bucket": "apk",
  "baseUrl": "https://api.cenos.com.br/files/apk",
  "files": [
    {
      "name": "app-1.0.1.apk",
      "size": 52428800,
      "lastModified": "2025-06-03T22:00:00.000Z",
      "url": "/files/apk/app-1.0.1.apk"
    }
  ]
}
```

---

## Armazenamento (MinIO Bucket)

Os APKs sao hospedados no bucket `apk` do MinIO.

- Upload feito via `mobile/build-and-deploy.ps1`
- Servido pelo endpoint `GET /files/apk/:filename` (rota existente em `upload.js`)
- URL final: `{PUBLIC_BASE_URL}/files/apk/app-{version}.apk`

---

## Arquivo de Versoes

Localizacao: `back/apk-versions.json`

```json
{
  "latest": {
    "versionCode": 2,
    "versionName": "1.0.1",
    "url": "/files/apk/app-1.0.1.apk",
    "changelog": "...",
    "forceUpdate": false,
    "releaseDate": "2025-06-03T00:00:00.000Z"
  },
  "history": []
}
```

---

## Script de Build

`mobile/build-and-deploy.ps1` — Faz build do frontend, sincroniza Capacitor, compila APK release assinado, faz upload para o bucket `apk` no MinIO e atualiza o manifest.

Parametros:
- `-VersionName "1.0.1"` — nome da versao (opcional, auto-incrementa patch)
- `-VersionCode 2` — codigo da versao (opcional, auto-incrementa)
- `-Changelog "..."` — novidades (opcional, pergunta interativamente)
- `-ForceUpdate` — flag para forcar atualizacao (opcional)
- `-MinIOEndpoint "localhost:9000"` — endpoint do MinIO
- `-MinIOAccessKey "..."` — access key (opcional, pergunta se nao informada)
- `-MinIOSecretKey "..."` — secret key (opcional, pergunta se nao informada)
