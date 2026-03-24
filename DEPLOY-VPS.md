# Deploy rápido — VPS Block Miner

Referência do ambiente que usamos para não repetir host/caminho em cada deploy.

## Servidor

| Campo | Valor |
|--------|--------|
| **Host / IP** | `89.167.119.164` |
| **SSH** | `root` |
| **Pasta do projeto** | `/root/block-miner` |

## Senha SSH (nunca no Git)

A senha **não** deve ir para ficheiros commitados nem para o repositório.

- **Recomendado:** coloque **uma linha** com a senha em `.deploy-pw.txt` na raiz do repo (o ficheiro está no `.gitignore`).
- **Alternativa:** na sessão atual do PowerShell:  
  `$env:BLOCKMINER_VPS_PW = '...'`

## Fluxo de deploy (Windows + PuTTY)

1. Instale [PuTTY](https://www.putty.org/) (`pscp.exe` e `plink.exe` no caminho predefinido ou ajuste no script).
2. Na raiz do projeto:

```powershell
.\scripts\deploy-vps-windows.ps1
```

O script (valores por omissão já batem certo com a tabela acima):

1. Cria `bm-deploy.tar.gz` (exclui `node_modules`, `.git`, `data`, `.env`, `forensics_vault`, etc.).
2. Envia para `/tmp/bm-deploy.tar.gz` na VPS.
3. No servidor: `cd /root/block-miner`, extrai o tarball, executa `docker compose up -d --build app`.
4. Healthcheck: `curl` a `http://127.0.0.1:3000/health` (código HTTP no output).

Parâmetros úteis: `-SshHost`, `-SshUser`, `-RemotePath`, `-SkipTarball`, `-TarballPath`.

## Verificação manual do health

Na VPS:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/health
```

Esperado: `200` (ou o código que a app expuser em `/health`).

## Depois do deploy

- Variáveis reais ficam em `/root/block-miner/.env` **no servidor** (não vêm no tarball).
- Documentação extra: [DEPLOY.md](./DEPLOY.md) (migrações, Prisma, problemas comuns).

## Segurança

- Troque a senha de `root` por **chave SSH** quando possível; remova `.deploy-pw.txt` depois.
- Se a senha foi exposta (chat, screenshot), **altere-a na VPS**.
