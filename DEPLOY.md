# Deploy na VPS (Ubuntu + Docker)

**Referência rápida (host, pasta, fluxo tarball + compose):** ver [DEPLOY-VPS.md](./DEPLOY-VPS.md).

Eu **não tenho acesso** ao seu servidor nem às suas chaves GitHub. Siga estes passos no **seu PC** e depois na **VPS**.

## 1) No seu PC (Windows) — enviar código

Confirme o remoto que a VPS usa (muitas vezes é `deploy` ou `origin`):

```bash
git remote -v
```

**Não commite** `.env` com segredos. O `.env.production` no repositório deve ser só template; segredos reais ficam só na VPS.

```bash
git status
git add -u
git add scripts/migrate_hashrate_gh_to_hs.js scripts/vps-update.sh DEPLOY.md
git restore --staged .env.production   # se estiver staged e tiver segredo
git commit -m "feat: base H/s, migração, admin miners, deploy script"
git push deploy main
# ou: git push origin main
```

Se o branch na VPS não for `main`, ajuste (`git push deploy nome-do-branch`).

### Windows (PuTTY): tarball + `docker compose` no servidor

Fluxo usado quando o deploy **não** é só `git pull` na VPS: enviar ficheiros, reconstruir só o serviço `app`, healthcheck em `/health` (app na porta interna **3000**).

1. Instale [PuTTY](https://www.putty.org/) (precisa de `pscp.exe` e `plink.exe`).
2. **Não guarde senha no Git.** Escolha um método:
   - **Variável de ambiente** (sessão atual do PowerShell):  
     `$env:BLOCKMINER_VPS_PW = 'sua-senha'`
   - **Ficheiro local** na raiz do repo, **uma linha**, nome `.deploy-pw.txt` — está no `.gitignore`.
3. Na raiz do projeto:

```powershell
.\scripts\deploy-vps-windows.ps1
```

Parâmetros úteis: `-SshHost`, `-SshUser`, `-RemotePath` (por omissão: `root@89.167.119.164`, pasta `/root/block-miner`).  
Para só repetir o upload com o mesmo `.tar.gz`: `-SkipTarball -TarballPath 'C:\caminho\bm-deploy.tar.gz'`.

Depois de trocar a senha do root, atualize o `.deploy-pw.txt` ou a variável. **Prefira chave SSH** quando puder (aí não precisa de senha no script).

## 2) Na VPS — atualizar e subir

```bash
cd ~/block-miner
git fetch origin
git pull   # ou: git pull deploy main — conforme seu remote

chmod +x scripts/vps-update.sh
./scripts/vps-update.sh
```

Ou manualmente:

```bash
docker compose pull   # se usar imagens pré-buildadas
docker compose build --no-cache app
docker compose up -d
docker compose ps
```

## 3) Migração GH → H/s (uma vez por banco)

**Dry-run** (não altera dados):

```bash
docker compose exec app npm run migrate:hashrate:dry
```

Se a saída fizer sentido, **aplicar**:

```bash
docker compose exec app npm run migrate:hashrate
```

Sem Docker (Node na máquina, `DATABASE_URL` no `.env`):

```bash
npm run migrate:hashrate:dry
npm run migrate:hashrate
```

## 4) Variáveis na VPS

O `docker-compose.yml` usa `env_file: .env` na pasta do projeto na VPS (ex.: `/root/block-miner/.env`). O ficheiro **não** vai no tarball/Git — crie-o no servidor.

**Nota:** Falhas de login com erro Prisma “column does not exist” **não** vêm de bcrypt nem de JWT: vêm da **tabela `users` (ou outras) desatualizada face ao `schema.prisma`**. O contentor `app` agora **termina no arranque** se `prisma db push` falhar (defina `ALLOW_START_WITHOUT_DB_PUSH=1` só em emergência — ver `.env.example`).

- **`JWT_SECRET`** — **obrigatório** em produção (string longa e aleatória). Sem isto, o login falha com mensagem genérica (“Login falhou”) porque a assinatura do token lança erro; a app agora **nem arranca** em `NODE_ENV=production` se faltar.
- `DATABASE_URL` — Postgres (no compose já vem override para o serviço `db`).
- **`POLYGONSCAN_API_KEY`** ou **`ETHERSCAN_API_KEY`** — **obrigatório** para listar transações na Polygon (API v2 Etherscan com `chainid=137`): re-sync de depósitos na wallet do jogador, verificação de depósito por TxHash e painel admin (tickets `[Saldo/POL]`). Chave gratuita: [etherscan.io/apis](https://etherscan.io/apis). Sem chave, essas funções devolvem erro explícito (não há fallback para outros explorers).
- Opcional: `MEMORY_GAME_REWARD_HS` — recompensa do minigame em **H/s** (ex.: `5000000000` = 5 GH/s).

## 5) Problemas comuns

| Erro | O que fazer |
|------|-------------|
| Container `app` a sair logo ao arrancar com `JWT_SECRET is missing` | Crie/edite `/root/block-miner/.env` com `JWT_SECRET=...` (32+ caracteres). `docker compose up -d app`. |
| “Login falhou” genérico no site (antes: app subia mas login dava 500) | Mesmo: `JWT_SECRET` no `.env` da VPS; ver `docker compose logs app` após tentativa de login. |
| Log: `prisma.user.findFirst()` — **column does not exist** / `(not available)` | O código atual usa `select` mínimo no login/sessão (não precisa de todas as colunas). Mesmo assim, alinhe a BD com `db:push` ou com `scripts/sql/patch_users_columns_for_prisma.sql` para o resto da app (admin, loja, etc.). |
| `gpu_id` required mas há NULL em `auto_mining_gpu_logs` | O schema trata `gpuId` como opcional. Se o `db push` ainda reclamar, na VPS: `docker compose exec -T db psql -U blockminer -d blockminer_db < scripts/sql/ensure_gpu_logs_gpu_id_nullable.sql` |
| Risco de depósito duplicado (mesmo `txHash`) | Aplique índice único parcial: `docker compose exec -T db psql -U blockminer -d blockminer_db < scripts/sql/ensure_unique_deposit_tx_hash.sql` |
| Re-sync de depósitos / admin “análise blockchain” falha com mensagem sobre chave de API | Defina `POLYGONSCAN_API_KEY` ou `ETHERSCAN_API_KEY` no `.env` da VPS e reinicie o `app`. |
| `Missing script: migrate:hashrate:dry` | `git pull` — o `package.json` da VPS está antigo. |
| `client password must be a string` | `DATABASE_URL` inválida ou vazia no container / `.env`. |
| Porta 5432 em uso | Outro Postgres na VPS; pare o outro ou mude a porta no compose. |

## 6) Depois do deploy

- Testar login, loja, painel admin.
- Conferir um usuário com hashrate exibido coerente (UI usa `formatHashrate` em H/s).
- Se o Prisma tiver campos novos no `User`, na VPS: `docker compose exec app npm run db:push` e confira os logs (tem de aparecer **prisma db push: OK** no arranque do contentor).
- Se o `db push` falhar ou o login continuar com erro de coluna em `users`, aplique o patch idempotente **no Postgres** (a partir da pasta do projeto na VPS):

```bash
cd ~/block-miner
docker compose exec -T db psql -U blockminer -d blockminer_db < scripts/sql/patch_users_columns_for_prisma.sql
docker compose restart app
```

## 7) Backup manual (só quando estiver tudo validado)

Faça isto **depois** de confirmar que login, loja e dados críticos estão corretos em produção.

Na VPS (utilizador e base do compose como no seu `docker-compose.yml`):

```bash
cd ~/block-miner
docker compose exec -T db pg_dump -U blockminer blockminer_db > ~/blockminer-db-$(date +%Y%m%d-%H%M).sql
tar -czf ~/blockminer-files-$(date +%Y%m%d-%H%M).tar.gz data uploads backups 2>/dev/null || true
```

Copie os ficheiros gerados (`~/blockminer-*.sql`, `~/blockminer-*.tar.gz`) para o seu PC ou armazenamento externo; não deixe só no servidor.
