import prisma from '../src/db/prisma.js';

const DEFAULT_MINER_IMAGE_URL = "/assets/machines/reward1.png";

export async function listInventory(userId) {
  return prisma.userInventory.findMany({
    where: { userId },
    orderBy: { acquiredAt: 'asc' }
  });
}

export async function getInventoryItem(userId, inventoryId) {
  return prisma.userInventory.findFirst({
    where: { 
      id: inventoryId,
      userId 
    }
  });
}

export async function addInventoryItem(userId, minerName, level, hashRate, slotSize, acquiredAt, updatedAt, minerId = null, imageUrl = null) {
  return prisma.userInventory.create({
    data: {
      userId,
      minerId,
      minerName,
      level,
      hashRate,
      slotSize,
      imageUrl,
      acquiredAt: new Date(acquiredAt),
      updatedAt: new Date(updatedAt)
    }
  });
}

export async function removeInventoryItem(userId, inventoryId) {
  return prisma.userInventory.delete({
    where: { 
      id: inventoryId,
      userId // Security check
    }
  });
}

export async function updateInventoryItemMeta(userId, inventoryId, minerName, slotSize, minerId = null) {
  let imageUrl = undefined;
  if (minerId) {
    const miner = await prisma.miner.findUnique({ where: { id: minerId } });
    imageUrl = miner?.imageUrl || DEFAULT_MINER_IMAGE_URL;
  }

  return prisma.userInventory.update({
    where: { 
      id: inventoryId,
      userId
    },
    data: {
      minerName,
      slotSize,
      minerId,
      imageUrl,
      updatedAt: new Date()
    }
  });
}
