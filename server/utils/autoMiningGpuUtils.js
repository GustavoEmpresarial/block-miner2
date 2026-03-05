/**
 * Utilitário para testar e gerenciar Auto Mining GPU
 * Use este arquivo para debugging e testes
 */

const {
  releaseNewGPU,
  getAvailableGPUs,
  claimGPU,
  getUserGPUHistory,
  getUserGPUStats,
  revokeGPU,
  removeExpiredGPUs,
  getAllReleasedGPUs,
  getGPUReport
} = require("../models/autoMiningGpuModel");

/**
 * Teste: Liberar GPU para usuário específico
 */
async function testReleaseGPU(userId = 1) {
  console.log(`\n[TEST] Liberando GPU para usuário ${userId}...`);
  try {
    const gpu = await releaseNewGPU(userId, 1, 0);
    console.log("✓ GPU liberada com sucesso:", gpu);
    return gpu;
  } catch (err) {
    console.error("✗ Erro:", err);
  }
}

/**
 * Teste: Obter GPUs disponíveis
 */
async function testGetAvailable(userId = 1) {
  console.log(`\n[TEST] Obtendo GPUs disponíveis para usuário ${userId}...`);
  try {
    const gpus = await getAvailableGPUs(userId);
    console.log(`✓ ${gpus.length} GPU(s) disponível(is):`);
    gpus.forEach(gpu => {
      console.log(`  - ID: ${gpu.id}, Hash Rate: ${gpu.gpu_hash_rate} GHS, Disponível: ${gpu.is_available}`);
    });
    return gpus;
  } catch (err) {
    console.error("✗ Erro:", err);
  }
}

/**
 * Teste: Reivindicar GPU
 */
async function testClaimGPU(gpuId = 1, userId = 1) {
  console.log(`\n[TEST] Reivindicando GPU ${gpuId} para usuário ${userId}...`);
  try {
    const claimed = await claimGPU(gpuId, userId);
    console.log("✓ GPU reivindicada com sucesso:", claimed);
    return claimed;
  } catch (err) {
    console.error("✗ Erro:", err);
  }
}

/**
 * Teste: Obter histórico do usuário
 */
async function testGetHistory(userId = 1, limit = 10) {
  console.log(`\n[TEST] Obtendo histórico para usuário ${userId}...`);
  try {
    const history = await getUserGPUHistory(userId, limit);
    console.log(`✓ ${history.length} evento(s) encontrado(s):`);
    history.forEach(log => {
      console.log(`  - ID: ${log.id}, Ação: ${log.action}, Fonte: ${log.source}, Data: ${new Date(log.claimed_at).toLocaleString()}`);
    });
    return history;
  } catch (err) {
    console.error("✗ Erro:", err);
  }
}

/**
 * Teste: Obter estatísticas do usuário
 */
async function testGetStats(userId = 1) {
  console.log(`\n[TEST] Obtendo estatísticas para usuário ${userId}...`);
  try {
    const stats = await getUserGPUStats(userId);
    console.log("✓ Estatísticas:");
    console.log(`  - GPUs Pendentes: ${stats.pending_gpus}`);
    console.log(`  - Hash Rate Pendente: ${stats.pending_hash_rate} GHS`);
    console.log(`  - GPUs Reivindicadas: ${stats.claimed_gpus}`);
    console.log(`  - Hash Rate Reivindicado: ${stats.claimed_hash_rate} GHS`);
    console.log(`  - Total Reivindicado (histórico): ${stats.total_claimed_ever}`);
    console.log(`  - Total Hash Rate Ganho: ${stats.total_hash_rate_earned} GHS`);
    return stats;
  } catch (err) {
    console.error("✗ Erro:", err);
  }
}

/**
 * Teste: Obter todas as GPUs (Admin)
 */
async function testGetAllGPUs(limit = 50, offset = 0) {
  console.log(`\n[TEST] Obtendo todas as GPUs (Admin)...`);
  try {
    const gpus = await getAllReleasedGPUs(limit, offset);
    console.log(`✓ ${gpus.length} GPU(s) encontrada(s):`);
    gpus.forEach(gpu => {
      console.log(`  - ID: ${gpu.id}, Usuário: ${gpu.username} (${gpu.name}), Hash Rate: ${gpu.gpu_hash_rate} GHS, Disponível: ${gpu.is_available === 1 ? 'Sim' : 'Não'}, Reivindicada: ${gpu.is_claimed === 1 ? 'Sim' : 'Não'}`);
    });
    return gpus;
  } catch (err) {
    console.error("✗ Erro:", err);
  }
}

/**
 * Teste: Obter relatório do sistema (Admin)
 */
async function testGetReport() {
  console.log(`\n[TEST] Obtendo relatório do sistema...`);
  try {
    const report = await getGPUReport();
    console.log("✓ Relatório do sistema:");
    console.log(`  - Total de GPUs liberadas: ${report.total_released}`);
    console.log(`  - Total de hash rate liberado: ${report.total_hash_rate_released} GHS`);
    console.log(`  - Total de GPUs reivindicadas: ${report.total_claimed}`);
    console.log(`  - Total de hash rate reivindicado: ${report.total_claimed_hash_rate} GHS`);
    console.log(`  - GPUs pendentes: ${report.total_pending}`);
    console.log(`  - Hash rate pendente: ${report.total_pending_hash_rate} GHS`);
    console.log(`  - Usuários com GPU: ${report.users_with_gpu}`);
    return report;
  } catch (err) {
    console.error("✗ Erro:", err);
  }
}

/**
 * Teste: Revogar GPU (Admin)
 */
async function testRevokeGPU(gpuId = 1, reason = "Teste de revogação") {
  console.log(`\n[TEST] Revogando GPU ${gpuId}...`);
  try {
    await revokeGPU(gpuId, reason);
    console.log(`✓ GPU ${gpuId} revogada com sucesso`);
  } catch (err) {
    console.error("✗ Erro:", err);
  }
}

/**
 * Teste: Remover GPUs expiradas
 */
async function testRemoveExpired() {
  console.log(`\n[TEST] Removendo GPUs expiradas...`);
  try {
    const count = await removeExpiredGPUs();
    console.log(`✓ ${count} GPU(s) expirada(s) removida(s)`);
    return count;
  } catch (err) {
    console.error("✗ Erro:", err);
  }
}

/**
 * Suite de testes completa
 */
async function runFullTestSuite() {
  console.log("=".repeat(60));
  console.log("AUTO MINING GPU - SUITE DE TESTES COMPLETA");
  console.log("=".repeat(60));

  try {
    // 1. Liberar GPU
    const gpu1 = await testReleaseGPU(1);
    if (!gpu1) throw new Error("Falha ao liberar GPU");

    // 2. Obter disponíveis
    const available = await testGetAvailable(1);
    if (!available || available.length === 0) throw new Error("Nenhuma GPU disponível");

    // 3. Reivindicar GPU
    const claimed = await testClaimGPU(available[0].id, 1);
    if (!claimed) throw new Error("Falha ao reivindicar GPU");

    // 4. Obter histórico
    await testGetHistory(1);

    // 5. Obter estatísticas
    await testGetStats(1);

    // 6. Admin: Obter todas as GPUs
    await testGetAllGPUs();

    // 7. Admin: Obter relatório
    await testGetReport();

    console.log("\n" + "=".repeat(60));
    console.log("✓ SUITE DE TESTES COMPLETA COM SUCESSO");
    console.log("=".repeat(60));
  } catch (err) {
    console.error("\n✗ ERRO NA SUITE DE TESTES:", err);
    console.log("=".repeat(60));
  }
}

/**
 * Simula o comportamento do CRON (libera GPUs para múltiplos usuários)
 */
async function simulateCronBehavior(userIds = [1, 2, 3, 4, 5]) {
  console.log("\n" + "=".repeat(60));
  console.log("SIMULANDO COMPORTAMENTO DO CRON");
  console.log("=".repeat(60));

  let released = 0;
  for (const userId of userIds) {
    try {
      await releaseNewGPU(userId, 1, 0);
      released++;
      console.log(`✓ GPU liberada para usuário ${userId}`);
    } catch (err) {
      console.error(`✗ Erro para usuário ${userId}:`, err.message);
    }
  }

  console.log(`\nTotal liberado: ${released}/${userIds.length} GPUs`);

  // Mostrar relatório
  await testGetReport();
}

// Exportar para uso em outros arquivos
module.exports = {
  testReleaseGPU,
  testGetAvailable,
  testClaimGPU,
  testGetHistory,
  testGetStats,
  testGetAllGPUs,
  testGetReport,
  testRevokeGPU,
  testRemoveExpired,
  runFullTestSuite,
  simulateCronBehavior
};

// Se executado diretamente
if (require.main === module) {
  // Desrom comentar a suite desejada para testar
  
  // runFullTestSuite();
  // simulateCronBehavior([1, 2, 3]);
  
  console.log("Auto Mining GPU Test Utility carregado");
  console.log("Use as funções cima exportadas para testar");
}
