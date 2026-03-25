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

O serviço `app` no Docker já inclui **rclone** e **pg_dump** (pacote `postgresql-client`). O `docker-compose.yml` monta a configuração do rclone do host em `/root/.config/rclone` (só leitura) para o contentor usar a mesma conta.

### Configurar na VPS (uma vez)

1. No host: `rclone config` e cria um remote do Google Drive (ex.: nome `gdrive`).
2. No `.env` do projeto (na VPS), define pelo menos (podes copiar o bloco pronto de `config/env.backup.vps.example`):
   - `BACKUP_ENABLED=true`
   - `BACKUP_CLOUD_ENABLED=true`
   - `BACKUP_CLOUD_COMMAND=rclone copy "{backupFile}" "gdrive:blockminer-backups" --transfers 1 --checkers 1 --drive-chunk-size 32M --fast-list`  
   Ajusta `gdrive` e `blockminer-backups` ao remote e à pasta que criaste no Drive.
3. A app agenda cópias com `BACKUP_CRON` (por defeito 03:00) e pode correr um dump ao arranque com `BACKUP_RUN_ON_STARTUP=true`.

Depois de alterar o `.env`, sobe de novo o contentor da app: `docker compose up -d --build app`.

Os dumps PostgreSQL ficam em `./backups` no host como `blockminer-db-YYYYMMDD-HHMMSS.sql.gz` e são copiados para o Drive quando a cloud está ativa.