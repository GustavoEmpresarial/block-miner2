#!/bin/sh
set -e

echo "Starting block-miner container..."

# Function to wait for database
wait_for_db() {
  echo "Waiting for database at db:5432..."
  # Try to connect to postgres port using nc (netcat) which is available in bookworm-slim
  while ! nc -z db 5432; do
    sleep 1
  done
  echo "Database is up and reachable!"
}

# Wait function
wait_for_db

echo "Database is ready. Syncing Prisma schema..."
# Generate Prisma client if it's missing (failsafe)
npx prisma generate --schema=server/prisma/schema.prisma || true

# Schema tem de bater certo com o Prisma; senão qualquer rota que leia User quebra (não é falha de bcrypt/JWT).
echo "Running prisma db push..."
if npx prisma db push --schema=server/prisma/schema.prisma --accept-data-loss; then
  echo "prisma db push: OK"
else
  echo "================================================================================"
  echo "FATAL: prisma db push FAILED. Corrija a BD antes de subir a app."
  echo "  docker compose exec -T db psql -U blockminer -d blockminer_db < scripts/sql/patch_users_columns_for_prisma.sql"
  echo "Ou: docker compose exec app npx prisma db push --schema=server/prisma/schema.prisma --accept-data-loss"
  echo "Emergência (não recomendado): definir ALLOW_START_WITHOUT_DB_PUSH=1 no serviço app."
  echo "================================================================================"
  if [ "${ALLOW_START_WITHOUT_DB_PUSH:-}" = "1" ]; then
    echo "ALLOW_START_WITHOUT_DB_PUSH=1 — a arrancar na mesma (login pode falhar)."
  else
    exit 1
  fi
fi

echo "Database schema sync step finished."

echo "Starting application..."
exec "$@"
