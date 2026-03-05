import prisma from './db.js';

export async function createReward(name, slug, gpuHashRate, imageUrl, description) {
  return prisma.autoMiningReward.create({
    data: {
      name,
      slug,
      gpuHashRate,
      imageUrl,
      description,
      isActive: true
    }
  });
}

export async function getActiveRewards() {
  return prisma.autoMiningReward.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' }
  });
}

export async function getAllRewards() {
  return prisma.autoMiningReward.findMany({
    orderBy: { createdAt: 'desc' }
  });
}

export async function getRewardById(rewardId) {
  return prisma.autoMiningReward.findUnique({
    where: { id: rewardId }
  });
}

export async function updateReward(rewardId, updates) {
  return prisma.autoMiningReward.update({
    where: { id: rewardId },
    data: {
      ...updates,
      updatedAt: new Date()
    }
  });
}

export async function activateReward(rewardId) {
  return updateReward(rewardId, { isActive: true });
}

export async function deactivateReward(rewardId) {
  return updateReward(rewardId, { isActive: false });
}

export async function deleteReward(rewardId) {
  const gpuCount = await prisma.autoMiningGpu.count({ where: { rewardId } });
  if (gpuCount > 0) throw new Error("Não é possível deletar reward com GPUs associadas");

  return prisma.autoMiningReward.delete({ where: { id: rewardId } });
}

export async function getRandomActiveReward() {
  const rewards = await getActiveRewards();
  if (rewards.length === 0) return null;
  return rewards[Math.floor(Math.random() * rewards.length)];
}

export async function getRewardsStats() {
  const [total, active, gpuInstances, claimed] = await Promise.all([
    prisma.autoMiningReward.count(),
    prisma.autoMiningReward.count({ where: { isActive: true } }),
    prisma.autoMiningGpu.count(),
    prisma.autoMiningGpu.count({ where: { isClaimed: true } })
  ]);

  return {
    total_rewards: total,
    active_rewards: active,
    total_gpu_instances: gpuInstances,
    total_claimed: claimed
  };
}
