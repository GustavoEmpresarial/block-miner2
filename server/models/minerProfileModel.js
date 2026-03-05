import prisma from '../src/db/prisma.js';

export async function getOrCreateMinerProfile(user) {
  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      username: true,
      polBalance: true,
    }
  });

  // Count machines in the rack (UserMiner)
  const activeMiners = await prisma.userMiner.findMany({
    where: { userId: user.id, isActive: true }
  });

  // Count machines in the inventory (UserInventory)
  const inventoryCount = await prisma.userInventory.count({
    where: { userId: user.id }
  });

  const totalHashRate = activeMiners.reduce((sum, m) => sum + (m.hashRate || 0), 0);

  return {
    ...profile,
    rigs: activeMiners.length, // Number of active machines in rack
    inventoryCount: inventoryCount, // Number of machines waiting to be installed
    base_hash_rate: totalHashRate,
    balance: Number(profile.polBalance || 0),
    lifetime_mined: 0 // Can be calculated from logs if needed
  };
}

export async function persistMinerProfile(miner) {
  if (!miner?.userId) return;
  
  return prisma.user.update({
    where: { id: miner.userId },
    data: {
      polBalance: miner.balance
    }
  });
}

export async function syncUserBaseHashRate(userId) {
  const activeMiners = await prisma.userMiner.findMany({
    where: { userId, isActive: true }
  });
  const totalHashRate = activeMiners.reduce((sum, m) => sum + (m.hashRate || 0), 0);
  return totalHashRate;
}
