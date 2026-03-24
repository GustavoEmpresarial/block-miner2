-- Garante que auto_mining_gpu_logs.gpu_id aceita NULL (dados legados).
-- Idempotente no sentido de que DROP NOT NULL é seguro se já for nullable.
ALTER TABLE auto_mining_gpu_logs ALTER COLUMN gpu_id DROP NOT NULL;
