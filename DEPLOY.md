# Deploy na VPS (Ubuntu + Docker)

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

- `DATABASE_URL` — Postgres (no compose já vem override para o serviço `db`).
- Opcional: `MEMORY_GAME_REWARD_HS` — recompensa do minigame em **H/s** (ex.: `5000000000` = 5 GH/s).

## 5) Problemas comuns

| Erro | O que fazer |
|------|-------------|
| `Missing script: migrate:hashrate:dry` | `git pull` — o `package.json` da VPS está antigo. |
| `client password must be a string` | `DATABASE_URL` inválida ou vazia no container / `.env`. |
| Porta 5432 em uso | Outro Postgres na VPS; pare o outro ou mude a porta no compose. |

## 6) Depois do deploy

- Testar login, loja, painel admin.
- Conferir um usuário com hashrate exibido coerente (UI usa `formatHashrate` em H/s).
