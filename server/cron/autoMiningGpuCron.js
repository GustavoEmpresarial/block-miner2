const cron = require("node-cron");
const { get, all } = require("../models/db");
const { releaseNewGPU, removeExpiredGPUs } = require("../models/autoMiningGpuModel");

let autoMiningGpuJob = null;
let gpuCleanupJob = null;

/**
 * DESABILITADO - Usar endpoint /api/auto-mining-gpu/claim para liberar GPUs
 * Não liberar automaticamente para todos os usuários (sobrecarrega o BD)
 */
async function releaseAutoMiningGPUs() {
  // Este job foi desabilitado - users ganham GPUs via página web quando acessam
  // Veja: /earnings/auto-mining-gpu
  return;
}

/**
 * Remove GPUs expiradas a cada 1 minuto
 */
async function cleanupExpiredGPUs() {
  try {
    const removedCount = await removeExpiredGPUs();

    if (removedCount > 0) {
      console.log(
        `[AUTO MINING GPU CLEANUP] ${removedCount} GPU(s) expirada(s) removida(s)`
      );
    }
  } catch (err) {
    console.error("[AUTO MINING GPU CLEANUP] Erro durante limpeza:", err);
  }
}

/**
 * Inicia o job de auto mining GPU
 * Libera uma GPU a cada 5 minutos
 */
function startAutoMiningGPUJob() {
  if (autoMiningGpuJob) {
    console.log("[AUTO MINING GPU] Job já está em execução");
    return;
  }

  // Executa a cada 5 minutos (0/5 * * * *)
  autoMiningGpuJob = cron.schedule("*/5 * * * *", async () => {
    await releaseAutoMiningGPUs();
  });

  console.log("[AUTO MINING GPU] Job iniciado - Liberando GPUs a cada 5 minutos");

  // Executa uma vez imediatamente para testar
  releaseAutoMiningGPUs();
}

/**
 * Inicia o job de limpeza de GPUs expiradas
 * Remove GPUs expiradas a cada 1 minuto
 */
function startGPUCleanupJob() {
  if (gpuCleanupJob) {
    console.log("[AUTO MINING GPU CLEANUP] Job já está em execução");
    return;
  }

  // Executa a cada 1 minuto
  gpuCleanupJob = cron.schedule("* * * * *", async () => {
    await cleanupExpiredGPUs();
  });

  console.log("[AUTO MINING GPU CLEANUP] Job iniciado - Limpando GPUs a cada 1 minuto");
}

/**
 * Para o job de auto mining GPU
 */
function stopAutoMiningGPUJob() {
  if (autoMiningGpuJob) {
    autoMiningGpuJob.stop();
    autoMiningGpuJob = null;
    console.log("[AUTO MINING GPU] Job parado");
  }
}

/**
 * Para o job de limpeza de GPUs
 */
function stopGPUCleanupJob() {
  if (gpuCleanupJob) {
    gpuCleanupJob.stop();
    gpuCleanupJob = null;
    console.log("[AUTO MINING GPU CLEANUP] Job parado");
  }
}

/**
 * Para todos os jobs de auto mining GPU
 */
function stopAllAutoMiningGPUJobs() {
  stopAutoMiningGPUJob();
  stopGPUCleanupJob();
}

/**
 * Inicia todos os jobs de auto mining GPU
 */
function startAllAutoMiningGPUJobs() {
  startAutoMiningGPUJob();
  startGPUCleanupJob();
}

module.exports = {
  releaseAutoMiningGPUs,
  cleanupExpiredGPUs,
  startAutoMiningGPUJob,
  stopAutoMiningGPUJob,
  startGPUCleanupJob,
  stopGPUCleanupJob,
  stopAllAutoMiningGPUJobs,
  startAllAutoMiningGPUJobs
};
