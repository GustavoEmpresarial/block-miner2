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

# Deploy schema changes safely (login quebra se isto falhar e faltar colunas em users)
echo "Running prisma db push..."
if npx prisma db push --schema=server/prisma/schema.prisma --accept-data-loss; then
  echo "prisma db push: OK"
else
  echo "================================================================================"
  echo "CRITICAL: prisma db push FAILED. O Prisma espera colunas que a BD pode não ter."
  echo "Isto causa erro em findUser/login. Corrija com SQL idempotente no Postgres, ex.:"
  echo "  docker compose exec -T db psql -U blockminer -d blockminer_db < scripts/sql/patch_users_columns_for_prisma.sql"
  echo "(ficheiro na pasta do projeto no host). Ver também DEPLOY.md."
  echo "================================================================================"
fi

echo "Database schema sync step finished."

echo "Starting application..."
exec "$@"
