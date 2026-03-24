-- Alinha a tabela public.users com server/prisma/schema.prisma (User).
-- Idempotente: ADD COLUMN IF NOT EXISTS.
-- Executar na VPS (Postgres do compose):
--   docker compose exec -T db psql -U blockminer -d blockminer_db -f - < scripts/sql/patch_users_columns_for_prisma.sql
-- ou copie o ficheiro para o servidor e: psql ... -f patch_users_columns_for_prisma.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_ip TEXT;

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_two_factor_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_secret TEXT;

ALTER TABLE users ADD COLUMN IF NOT EXISTS yt_seconds_balance INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_mining_seconds_balance INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMP(3);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_youtube_heartbeat_at TIMESTAMP(3);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_auto_mining_heartbeat_at TIMESTAMP(3);

ALTER TABLE users ADD COLUMN IF NOT EXISTS has_adblock BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE users ADD COLUMN IF NOT EXISTS old_id INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS old_lifetime_mined DECIMAL(20, 8) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_withdrawn DECIMAL(20, 8) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS rigs_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS old_base_hash_rate DOUBLE PRECISION DEFAULT 0;
