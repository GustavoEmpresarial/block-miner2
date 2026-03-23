import prisma from '../src/db/prisma.js';

export async function listActiveMiners(page, pageSize) {
  const skip = (page - 1) * pageSize;
  
  // Get miners that are active, show in shop, and NOT in faucet/shortlink rewards
  const [miners, total] = await Promise.all([
    prisma.miner.findMany({
      where: {
        isActive: true,
        showInShop: true,
        faucetReward: null,
        shortlinkRew: null
      },
      orderBy: { id: 'asc' },
      skip,
      take: pageSize
    }),
    prisma.miner.count({
      where: {
        isActive: true,
        showInShop: true,
        faucetReward: null,
        shortlinkRew: null
      }
    })
  ]);

  return {
    miners,
    total
  };
}

export async function getActiveMinerById(minerId) {
  return prisma.miner.findFirst({
    where: {
      id: minerId,
      isActive: true,
      showInShop: true,
      faucetReward: null,
      shortlinkRew: null
    }
  });
}

export async function getMinerByName(name) {
  return prisma.miner.findFirst({
    where: {
      name: {
        equals: name,
        mode: 'insensitive'
      }
    }
  });
}

export async function getMinerBySlug(slug) {
  return prisma.miner.findUnique({
    where: { slug }
  });
}

export async function listAllMiners() {
  return prisma.miner.findMany({
    orderBy: { id: 'asc' }
  });
}

export async function getMinerById(minerId) {
  return prisma.miner.findUnique({
    where: { id: minerId }
  });
}

export async function createMiner({ name, slug, baseHashRate, price, slotSize, imageUrl, isActive, showInShop = true }) {
  return prisma.miner.create({
    data: {
      name,
      slug,
      baseHashRate,
      price,
      slotSize,
      imageUrl,
      isActive,
      showInShop
    }
  });
}

/**
 * Sync catalog miner fields to every user_miners, user_inventory row and shortlink_rewards
 * tied to this miner. Hash on instances = baseHashRate * max(1, level).
 */
export async function propagateMinerToAllInstances(tx, miner) {
  const minerId = miner.id;
  const base = Number(miner.baseHashRate || 0);
  const slots = Math.min(2, Math.max(1, Math.floor(Number(miner.slotSize || 1))));
  const name = miner.name;
  const img = miner.imageUrl ?? null;

  const userMiners = await tx.userMiner.findMany({
    where: { minerId },
    select: { id: true, level: true }
  });
  for (const um of userMiners) {
    const lvl = Math.max(1, Number(um.level) || 1);
    await tx.userMiner.update({
      where: { id: um.id },
      data: {
        hashRate: base * lvl,
        slotSize: slots,
        imageUrl: img
      }
    });
  }

  const inventories = await tx.userInventory.findMany({
    where: { minerId },
    select: { id: true, level: true }
  });
  for (const row of inventories) {
    const lvl = Math.max(1, Number(row.level) || 1);
    await tx.userInventory.update({
      where: { id: row.id },
      data: {
        minerName: name,
        hashRate: base * lvl,
        slotSize: slots,
        imageUrl: img
      }
    });
  }

  const shortlinkUpdated = await tx.shortlinkReward.updateMany({
    where: { minerId },
    data: {
      rewardName: name,
      hashRate: base,
      slotSize: slots,
      imageUrl: img
    }
  });

  return {
    userMiners: userMiners.length,
    userInventory: inventories.length,
    shortlinkRewards: shortlinkUpdated.count
  };
}

/**
 * Re-applies the current catalog row to every rack/inventory/shortlink instance (no catalog change).
 * Use after SQL direto no `miners` or to fix drift without opening the edit form.
 */
export async function propagateCatalogMinerToAllInstances(minerId) {
  return prisma.$transaction(async (tx) => {
    const miner = await tx.miner.findUnique({ where: { id: minerId } });
    if (!miner) {
      const err = new Error("NOT_FOUND");
      err.code = "NOT_FOUND";
      throw err;
    }
    const propagation = await propagateMinerToAllInstances(tx, miner);
    return { miner, propagation };
  });
}

/**
 * Merges patch into existing miner, updates row, propagates to all instances.
 * @param {number} minerId
 * @param {object} patch — optional fields (camelCase or mixed with snake_case handled in controller)
 */
export async function updateMiner(minerId, patch = {}) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.miner.findUnique({ where: { id: minerId } });
    if (!existing) {
      const err = new Error('NOT_FOUND');
      err.code = 'NOT_FOUND';
      throw err;
    }

    const data = {
      name: patch.name !== undefined ? patch.name : existing.name,
      slug: patch.slug !== undefined ? patch.slug : existing.slug,
      baseHashRate:
        patch.baseHashRate !== undefined ? Number(patch.baseHashRate) : existing.baseHashRate,
      price: patch.price !== undefined ? Number(patch.price) : existing.price,
      slotSize: patch.slotSize !== undefined ? Number(patch.slotSize) : existing.slotSize,
      imageUrl: patch.imageUrl !== undefined ? patch.imageUrl : existing.imageUrl,
      isActive: patch.isActive !== undefined ? Boolean(patch.isActive) : existing.isActive,
      showInShop: patch.showInShop !== undefined ? Boolean(patch.showInShop) : existing.showInShop
    };

    const updated = await tx.miner.update({
      where: { id: minerId },
      data
    });

    const propagation = await propagateMinerToAllInstances(tx, updated);
    return { miner: updated, propagation };
  });
}

/**
 * Remove miner from catalog only when no player owns an instance.
 * Faucet/shortlink rows for this miner are removed first (they reference the catalog miner).
 */
export async function deleteMiner(minerId) {
  const [um, ui] = await Promise.all([
    prisma.userMiner.count({ where: { minerId } }),
    prisma.userInventory.count({ where: { minerId } })
  ]);
  if (um + ui > 0) {
    const err = new Error('MINER_IN_USE');
    err.code = 'MINER_IN_USE';
    err.counts = { userMiners: um, userInventory: ui };
    throw err;
  }

  await prisma.$transaction(async (tx) => {
    await tx.faucetReward.deleteMany({ where: { minerId } });
    await tx.shortlinkReward.deleteMany({ where: { minerId } });
    await tx.miner.delete({ where: { id: minerId } });
  });
}

export async function setMinerShowInShop(minerId, showInShop) {
  return prisma.miner.update({
    where: { id: minerId },
    data: { showInShop }
  });
}
