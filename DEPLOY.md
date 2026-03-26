# 🚀 Super Guia de Deploy & Operação — VPS Block Miner

Este é o documento mestre. Ele contém tudo o que você (ou o Cleitin) precisa para manter o sistema no ar sem explodir o banco de dados.

---

## 🖥️ 1. Referência do Ambiente (VPS)

| Campo | Valor |
| :--- | :--- |
| **Host / IP** | `89.167.119.164` |
| **Usuário SSH** | `root` |
| **Pasta do Projeto** | `/root/block-miner` |
| **Porta da App** | `3000` (Interna) |

---

## 🛑 2. A REGRA DE OURO: Preservação do Banco (`db`)

> **LEIA ISTO ANTES DE QUALQUER COMANDO:** O container de banco de dados (`db`) é o coração do projeto. Se ele morrer ou for resetado, o saldo dos usuários e o lucro somem.

* **NUNCA** use `docker compose down -v` (o `-v` apaga os volumes físicos).
* **NUNCA** use `--build` no serviço de banco de dados.
* **DEPLOY SEGURO:** Sempre especifique o serviço `app` ao buildar.
    * ✅ **CORRETO:** `docker compose up -d --build app`
    * ❌ **ERRADO:** `docker compose up -d --build` (isso tenta rebuildar o banco desnecessariamente).
* **ESTADO DO DB:** O container `db` deve ser considerado "eterno". Se precisar reiniciar, use `docker compose restart db`.

---

## 🛠️ 3. Fluxo de Deploy (PC -> VPS)

### No seu PC (Windows + PuTTY)
1.  **Segurança de Senha:** Tenha a senha da VPS no arquivo `.deploy-pw.txt` (na raiz, ignorado pelo git) ou na variável `$env:BLOCKMINER_VPS_PW`.
2.  **Commit & Push:** Garanta que o código está no GitHub/GitLab.
3.  **Executar Deploy:**
    ```powershell
    .\scripts\deploy-vps-windows.ps1
    ```

### Na VPS (Finalização)
```bash
cd ~/block-miner
chmod +x scripts/vps-update.sh
./scripts/vps-update.sh
```

---

## 4. Backup da base de dados no Google Drive (rclone)

O serviço `app` inclui **rclone** e **pg_dump** (`postgresql-client`). O `docker-compose.yml` monta **`/root/.config/rclone` do host → container em modo leitura-escrita** para o rclone poder **renovar o token OAuth** do Google (com `:ro` o upload falha ao expirar o token).

### 4.1 Instalar e configurar rclone no host da VPS (uma vez)

```bash
# Debian/Ubuntu
apt-get update && apt-get install -y rclone

mkdir -p /root/.config/rclone
rclone config
```

No assistente: **New remote** → tipo **Google Drive** → nome por exemplo **`gdrive`**. Para servidor sem browser, usa **headless / config token** conforme o rclone indicar, ou uma **conta de serviço** (Google Cloud Console → IAM → conta de serviço + JSON; no rclone escolhe “Service Account” e aponta para o ficheiro).

Cria no Drive uma pasta só para backups e copia o **ID** do URL:  
`https://drive.google.com/drive/folders/ESTE_E_O_ID`

### 4.2 Variáveis no `.env` (na VPS, `/root/block-miner/.env`)

Bloco mínimo (podes copiar `config/env.backup.vps.example`):

- `BACKUP_ENABLED=true`
- `BACKUP_CLOUD_ENABLED=true`
- **Opção A:** `BACKUP_CLOUD_COMMAND=rclone copy "{backupFile}" "gdrive:ID_DA_PASTA" --transfers 1 --checkers 1 --drive-chunk-size 32M --fast-list`
- **Opção B:** deixa `BACKUP_CLOUD_COMMAND` vazio e define `BACKUP_CLOUD_FOLDER_ID=ID_DA_PASTA` e, se precisares, `BACKUP_CLOUD_REMOTE=gdrive` (o servidor monta o mesmo comando).

O nome **`gdrive`** tem de coincidir com o remote do `rclone config`.

### 4.3 Testar antes de confiar no cron

Com a stack no ar:

```bash
cd /root/block-miner
docker compose exec app rclone listremotes
docker compose exec app rclone lsd gdrive:
# Script incluído no repo (remote + ID da pasta):
docker compose exec app sh /app/scripts/rclone-backup-smoke.sh gdrive ID_DA_PASTA
```

Se isto funcionar, o job Node que corre no arranque (`BACKUP_RUN_ON_STARTUP=true`) e o `BACKUP_CRON` (por defeito **03:00 no fuso horário do container**, em geral **UTC**) conseguem enviar os `.sql.gz` para o Drive.

### 4.4 Depois de editar `.env`

```bash
docker compose up -d app
```

(rebuild só se mudaste código: `docker compose up -d --build app`)

Os dumps PostgreSQL ficam em `./backups` no host (`blockminer-db-YYYYMMDD-HHMMSS.sql.gz`) e são copiados para o Drive quando a cloud está ativa. Nos logs da app procura `BackupCron` / `Cloud backup OK` ou `Cloud backup failed`.