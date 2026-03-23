#!/usr/bin/env bash
# Rode na VPS dentro do diretório do projeto: ~/block-miner
set -euo pipefail

echo "==> block-miner: pull + rebuild + up"
if [ ! -f docker-compose.yml ]; then
  echo "Erro: execute este script na raiz do projeto (onde está docker-compose.yml)."
  exit 1
fi

# Opcional: ./scripts/vps-update.sh origin main
if [ "$#" -ge 2 ]; then
  git pull "$1" "$2"
else
  git pull
fi

echo "==> docker compose build app"
docker compose build --no-cache app

echo "==> docker compose up -d"
docker compose up -d

echo "==> status"
docker compose ps

echo ""
echo "Próximo passo (migração H/s, uma vez):"
echo "  docker compose exec app npm run migrate:hashrate:dry"
echo "  docker compose exec app npm run migrate:hashrate"
