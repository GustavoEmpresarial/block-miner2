import prisma from '../src/db/prisma.js';

export async function listActiveGpuRewards() {
  return prisma.autoMiningGpuReward.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' }
  });
}

export async function claimGpuReward(userId, rewardId) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const reward = await tx.autoMiningGpuReward.findUnique({ where: { id: rewardId } });
    if (!reward || !reward.isActive) throw new Error("Reward not found or inactive");

    return tx.userAutoMiningGpu.create({
      data: {
        userId,
        rewardId,
        claimedAt: now,
        expiresAt: new Date(now.getTime() + (reward.durationHours * 60 * 60 * 1000))
      }
    });
  });
}
