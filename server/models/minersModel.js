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

export async function updateMiner(minerId, { name, slug, baseHashRate, price, slotSize, imageUrl, isActive, showInShop }) {
  return prisma.miner.update({
    where: { id: minerId },
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

export async function setMinerShowInShop(minerId, showInShop) {
  return prisma.miner.update({
    where: { id: minerId },
    data: { showInShop }
  });
}
