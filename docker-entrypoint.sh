#!/bin/sh
set -e

echo "Starting block-miner container..."

# Sync database schema with Prisma db push
echo "Syncing database schema with Prisma db push..."
# Ensure DATABASE_URL is available for the command
npx prisma db push --accept-data-loss --schema=server/prisma/schema.prisma || echo "Database push failed, skipping..."

# Start the application
echo "Seeding store data..."
node server/prisma/seed.js || echo "Seeding failed, skipping..."

echo "Starting application..."
exec "$@"
