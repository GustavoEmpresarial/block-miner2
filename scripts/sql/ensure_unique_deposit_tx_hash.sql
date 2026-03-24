-- Prevent duplicate crediting of the same on-chain deposit tx.
-- Safe to run multiple times.
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_deposit_tx_hash
ON transactions (lower(tx_hash))
WHERE type = 'deposit' AND tx_hash IS NOT NULL;
