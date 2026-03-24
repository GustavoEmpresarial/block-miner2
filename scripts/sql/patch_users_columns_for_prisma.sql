-- Alinha public.users com server/prisma/schema.prisma (modelo User — todos os escalares).
-- Idempotente: ADD COLUMN IF NOT EXISTS. Não apaga dados.
--
-- Na VPS:
--   cd ~/block-miner && docker compose exec -T db psql -U blockminer -d blockminer_db < scripts/sql/patch_users_columns_for_prisma.sql
-- Depois: docker compose restart app
--
-- Ver colunas atuais:
--   docker compose exec -T db psql -U blockminer -d blockminer_db -c "\d users"

-- Identidade / sessão
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ref_code TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_address TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_ip TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP(3);
ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_ip TEXT;

-- 2FA
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_two_factor_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_secret TEXT;

-- Saldos (Prisma faz SELECT de todas; falta uma quebra o login)
ALTER TABLE users ADD COLUMN IF NOT EXISTS pol_balance DECIMAL(20, 8) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS btc_balance DECIMAL(20, 8) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS eth_balance DECIMAL(20, 8) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS usdt_balance DECIMAL(20, 8) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS usdc_balance DECIMAL(20, 8) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS zer_balance DECIMAL(20, 8) NOT NULL DEFAULT 0;

-- YouTube / auto-mining / heartbeats
ALTER TABLE users ADD COLUMN IF NOT EXISTS yt_seconds_balance INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_mining_seconds_balance INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMP(3);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_youtube_heartbeat_at TIMESTAMP(3);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_auto_mining_heartbeat_at TIMESTAMP(3);

ALTER TABLE users ADD COLUMN IF NOT EXISTS has_adblock BOOLEAN NOT NULL DEFAULT false;

-- Meta migração
ALTER TABLE users ADD COLUMN IF NOT EXISTS old_id INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS old_lifetime_mined DECIMAL(20, 8) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_withdrawn DECIMAL(20, 8) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS rigs_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS old_base_hash_rate DOUBLE PRECISION DEFAULT 0;
