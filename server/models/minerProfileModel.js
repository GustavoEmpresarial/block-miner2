import prisma from '../src/db/prisma.js';
import crypto from 'crypto';
import { stripAccidentalBillionScaleHs } from '../utils/hashRateScale.js';
import { syncOnlineMinerPolBalance } from '../src/runtime/miningRuntime.js';

export async function getOrCreateMinerProfile(user) {
  if (!user?.id) return null;

  let dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      username: true,
      polBalance: true,
      refCode: true,
      _count: {
        select: { referrals: true }
      }
    }
  });

  if (!dbUser) return null;

  // Ensure user has a refCode
  if (!dbUser.refCode) {
    const newRefCode = crypto.randomBytes(5).toString("hex");
    dbUser = await prisma.user.update({
      where: { id: user.id },
      data: { refCode: newRefCode },
      select: {
        id: true,
        username: true,
        polBalance: true,
        refCode: true,
        _count: {
          select: { referrals: true }
        }
      }
    });
  }

  const profile = dbUser;

  // Count machines in the rack (UserMiner)
  const activeMiners = await prisma.userMiner.findMany({
    where: { userId: user.id, isActive: true }
  });

  // Count machines in the inventory (UserInventory)
  const inventoryCount = await prisma.userInventory.count({
    where: { userId: user.id }
  });

  // Count active temporary powers (Games, YouTube & Auto Mining)
  const now = new Date();
  const [gamePowers, ytPowers, gpuPowers] = await Promise.all([
    prisma.userPowerGame.findMany({
      where: { userId: user.id, expiresAt: { gt: now } }
    }),
    prisma.youtubeWatchPower.findMany({
      where: { userId: user.id, expiresAt: { gt: now } }
    }),
    prisma.autoMiningGpu.findMany({
      where: { userId: user.id, isClaimed: true, expiresAt: { gt: now } }
    })
  ]);

  const machineHashRate = activeMiners.reduce((sum, m) => {
    // We only count permanent machines. Pulse GPUs are counted separately below.
    return sum + stripAccidentalBillionScaleHs(m.hashRate);
  }, 0);
  const gameHashRate = gamePowers.reduce((sum, g) => sum + stripAccidentalBillionScaleHs(g.hashRate), 0);
  const ytHashRate = ytPowers.reduce((sum, y) => sum + stripAccidentalBillionScaleHs(y.hashRate), 0);
  const gpuHashRate = gpuPowers.reduce((sum, p) => sum + stripAccidentalBillionScaleHs(p.gpuHashRate), 0);
  
  const totalHashRate = machineHashRate + gameHashRate + ytHashRate + gpuHashRate;

  return {
    ...profile,
    rigs: activeMiners.length, // Number of active machines in rack
    inventoryCount: inventoryCount, // Number of machines waiting to be installed
    base_hash_rate: totalHashRate,
    machine_hash_rate: machineHashRate,
    game_hash_rate: gameHashRate,
    youtube_hash_rate: ytHashRate,
    auto_mining_hash_rate: gpuHashRate,
    balance: Number(profile.polBalance || 0),
    lifetime_mined: 0, // Can be calculated from logs if needed
    refCode: profile.refCode,
    referralCount: profile._count.referrals
  };
}

/**
 * Alinha RAM ↔ BD sem gravar `pol_balance = miner.balance` cegamente.
 * Recompensas de bloco entram só por persistBlockRewards (increment na BD).
 * Boost/rig debitam a BD nos handlers de socket.
 * Isto evita a RAM "fantasma" (compra já na BD) repor o saldo antigo — o que parecia anti-cheat/bug.
 */
export async function persistMinerProfile(miner) {
  if (!miner?.userId) return;

  const row = await prisma.user.findUnique({
    where: { id: miner.userId },
    select: { polBalance: true }
  });
  if (!row) return;

  const EPS = 1e-10;
  const dbBal = Number(row.polBalance);
  const memBal = Number(miner.balance);

  const rowFresh = await prisma.user.findUnique({
    where: { id: miner.userId },
    select: { polBalance: true }
  });
  if (!rowFresh) return;

  let fresh = Number(rowFresh.polBalance);

  if (fresh + EPS < dbBal) {
    // Débito noutro pedido entre leituras (ex.: loja)
    syncOnlineMinerPolBalance(miner.userId, fresh);
    miner.balance = fresh;
  }

  const mem = Number(miner.balance);

  if (fresh > mem + EPS) {
    // Crédito só na BD (depósito, etc.) — puxar a RAM, sem tocar na BD
    miner.balance = fresh;
    syncOnlineMinerPolBalance(miner.userId, fresh);
    return;
  }

  if (mem > fresh + EPS) {
    // RAM acima da BD: compra/saque já refletidos na BD ou recompensa ainda não persistida.
    // Nunca promover pol_balance com este valor; alinhar RAM à BD (recompensa entra por increment no persistBlockRewards).
    miner.balance = fresh;
    syncOnlineMinerPolBalance(miner.userId, fresh);
    return;
  }

  // ~ alinhado — nada a gravar (evita UPDATE desnecessário)
}

export async function syncUserBaseHashRate(userId) {
  const now = new Date();
  const [activeMiners, gamePowers, ytPowers, gpuPowers] = await Promise.all([
    prisma.userMiner.findMany({ where: { userId, isActive: true } }),
    prisma.userPowerGame.findMany({ where: { userId, expiresAt: { gt: now } } }),
    prisma.youtubeWatchPower.findMany({ where: { userId, expiresAt: { gt: now } } }),
    prisma.autoMiningGpu.findMany({ where: { userId, isClaimed: true, expiresAt: { gt: now } } })
  ]);

  const machineHashRate = activeMiners.reduce((sum, m) => {
    // If we ever allow Pulse GPU to be installed in rack, we must not count its hashRate here
    // because it's already counted in gpuHashRate via autoMiningGpu table
    return sum + stripAccidentalBillionScaleHs(m.hashRate);
  }, 0);
  const gameHashRate = gamePowers.reduce((sum, g) => sum + stripAccidentalBillionScaleHs(g.hashRate), 0);
  const ytHashRate = ytPowers.reduce((sum, y) => sum + stripAccidentalBillionScaleHs(y.hashRate), 0);
  const gpuHashRate = gpuPowers.reduce((sum, p) => sum + stripAccidentalBillionScaleHs(p.gpuHashRate), 0);
  
  return machineHashRate + gameHashRate + ytHashRate + gpuHashRate;
}
