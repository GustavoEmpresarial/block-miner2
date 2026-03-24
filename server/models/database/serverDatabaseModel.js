import prisma from '../../src/db/prisma.js';
import { createNotification } from '../../controllers/notificationController.js';
import { getMiningEngine } from '../../src/miningEngineInstance.js';
import { syncOnlineMinerPolBalance } from '../../src/runtime/miningRuntime.js';

export async function markCheckinConfirmed(checkinId, now) {
  return prisma.dailyCheckin.update({
    where: { id: checkinId },
    data: {
      status: "confirmed",
      confirmedAt: new Date(now)
    }
  });
}

export async function findDailyCheckinByUserAndDate(userId, dateKey) {
  return prisma.dailyCheckin.findUnique({
    where: {
      userId_checkinDate: {
        userId,
        checkinDate: dateKey
      }
    }
  });
}

export async function findLatestDailyCheckinByUser(userId) {
  return prisma.dailyCheckin.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' }
  });
}

export async function getMiningEngineStateRows() {
  const [maxBlock, totalMinted] = await Promise.all([
    prisma.miningRewardsLog.aggregate({
      _max: { blockNumber: true }
    }),
    prisma.miningRewardsLog.aggregate({
      _sum: { rewardAmount: true }
    })
  ]);

  const recentBlocks = await prisma.blockDistribution.findMany({
    orderBy: { blockNumber: 'desc' },
    take: 12,
    include: {
      minerRewards: {
        select: {
          userId: true,
          rewardAmount: true
        }
      }
    }
  });

  return {
    maxBlockRow: { max_block: maxBlock._max.blockNumber || 0 },
    totalMintedRow: { total_minted: Number(totalMinted._sum.rewardAmount || 0) },
    recentBlocks: recentBlocks.map(b => {
      const userRewards = {};
      b.minerRewards.forEach(r => {
        userRewards[r.userId] = r.rewardAmount;
      });
      
      return {
        blockNumber: b.blockNumber,
        reward: b.reward,
        minerCount: b.minerCount,
        timestamp: b.createdAt.getTime(),
        userRewards
      };
    })
  };
}

export async function persistBlockRewards({ blockNumber, blockReward, totalWork, minerRewards, now }) {
  const engine = getMiningEngine();
  const referralCredits = [];

  await prisma.$transaction(async (tx) => {
    const timestamp = new Date(now);

    for (const r of minerRewards) {
      // 1. Creditar só o reward sobre o saldo atual na BD — nunca `polBalance = balanceAfter` da RAM:
      //    se a RAM ainda não refletiu compra/saque, gravar o total do motor revertia o débito.
      const updatedUser = await tx.user.update({
        where: { id: r.userId },
        data: { polBalance: { increment: r.rewardAmount } },
        select: { polBalance: true }
      });

      await tx.miningRewardsLog.create({
        data: {
          userId: r.userId,
          blockNumber,
          workAccumulated: r.workAccumulated,
          totalNetworkWork: totalWork,
          sharePercentage: r.sharePercentage,
          rewardAmount: r.rewardAmount,
          balanceAfterReward: updatedUser.polBalance,
          createdAt: timestamp
        }
      });

      // 2. Referral Commission (1%)
      const user = await tx.user.findUnique({
        where: { id: r.userId },
        select: { referredBy: true }
      });

      if (user?.referredBy && r.rewardAmount > 0) {
        const commission = r.rewardAmount * 0.01;
        referralCredits.push({ referrerId: user.referredBy, commission });
        await tx.user.update({
          where: { id: user.referredBy },
          data: { polBalance: { increment: commission } }
        });

        await tx.referralEarning.create({
          data: {
            referrerId: user.referredBy,
            referredId: r.userId,
            amount: commission,
            source: `mining_block_${blockNumber}`,
            createdAt: timestamp
          }
        });
      }

      // 3. Create Notification
      if (r.rewardAmount > 0) {
        await createNotification({
          userId: r.userId,
          title: `Bloco #${blockNumber} Minerado`,
          message: `Você recebeu +${Number(r.rewardAmount).toFixed(6)} POL de recompensa por sua participação no bloco.`,
          type: "reward",
          io: engine?.io
        });
      }
    }

    // Persist global Block Distribution
    await tx.blockDistribution.create({
      data: {
        blockNumber,
        reward: blockReward,
        minerCount: minerRewards.length,
        totalWork: totalWork,
        createdAt: timestamp,
        minerRewards: {
          create: minerRewards.map(r => ({
            userId: r.userId,
            work: r.workAccumulated,
            percentage: r.sharePercentage,
            rewardAmount: r.rewardAmount,
            createdAt: timestamp
          }))
        }
      }
    });

  });

  const idsToSync = new Set(minerRewards.map((r) => r.userId));
  for (const { referrerId } of referralCredits) idsToSync.add(referrerId);
  for (const uid of idsToSync) {
    const row = await prisma.user.findUnique({ where: { id: uid }, select: { polBalance: true } });
    if (row) syncOnlineMinerPolBalance(uid, Number(row.polBalance));
  }
}

export async function loadRecentBlocks(limit = 12) {
  const blocks = await prisma.blockDistribution.findMany({
    orderBy: { blockNumber: 'desc' },
    take: limit,
    include: {
      minerRewards: {
        select: {
          userId: true,
          rewardAmount: true
        }
      }
    }
  });

  const formattedBlocks = blocks.map(b => {
    const userRewards = {};
    b.minerRewards.forEach(r => {
      userRewards[r.userId] = r.rewardAmount;
    });
    return {
      blockNumber: b.blockNumber,
      reward: b.reward,
      minerCount: b.minerCount,
      timestamp: b.createdAt.getTime(),
      userRewards
    };
  });

  if (formattedBlocks.length >= limit) {
    return formattedBlocks;
  }

  // Fallback: If we have fewer than `limit` blocks in `block_distributions`, 
  // try to build history from `mining_rewards_log` for the older entries.
  const alreadyLoadedNumbers = new Set(formattedBlocks.map(b => b.blockNumber));
  const remainingCount = limit - formattedBlocks.length;

  const recentLogs = await prisma.miningRewardsLog.findMany({
    where: {
      blockNumber: { notIn: Array.from(alreadyLoadedNumbers) }
    },
    orderBy: { id: 'desc' },
    take: 5000 // Increased sample size to ensure we find enough unique blocks
  });

  const fallbackBlocksMap = new Map();

  for (const log of recentLogs) {
    if (fallbackBlocksMap.size >= remainingCount && !fallbackBlocksMap.has(log.blockNumber)) {
      continue;
    }

    if (!fallbackBlocksMap.has(log.blockNumber)) {
      fallbackBlocksMap.set(log.blockNumber, {
        blockNumber: log.blockNumber,
        reward: 0.1, // Default reward base for migrated
        minerCount: 0,
        timestamp: log.createdAt.getTime(),
        userRewards: {}
      });
    }

    const b = fallbackBlocksMap.get(log.blockNumber);
    b.userRewards[log.userId] = log.rewardAmount;
    b.minerCount += 1;
  }

  const merged = [...formattedBlocks, ...Array.from(fallbackBlocksMap.values())];
  return merged.sort((a, b) => b.blockNumber - a.blockNumber).slice(0, limit);
}

export async function listChatMessages(limit) {
  return prisma.chatMessage.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit
  });
}

export async function insertChatMessage({ userId, username, message, createdAt }) {
  return prisma.chatMessage.create({
    data: {
      userId,
      username,
      message,
      createdAt: new Date(createdAt)
    }
  });
}

export default {
  markCheckinConfirmed,
  findDailyCheckinByUserAndDate,
  findLatestDailyCheckinByUser,
  getMiningEngineStateRows,
  persistBlockRewards,
  listChatMessages,
  insertChatMessage,
  loadRecentBlocks
};
