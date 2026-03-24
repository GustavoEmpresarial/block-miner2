import prisma from '../src/db/prisma.js';
import { stripAccidentalBillionScaleHs } from '../utils/hashRateScale.js';

const DEFAULT_MINER_IMAGE_URL = "/assets/machines/reward1.png";

/** Slugs cujo inventário é permanente (faucet; não mostrar / não usar expiresAt). */
const PERMANENT_INVENTORY_MINER_SLUGS = ['faucet-micro-miner'];

let permanentMinerIdSetPromise = null;
function getPermanentInventoryMinerIdSet() {
  if (!permanentMinerIdSetPromise) {
    permanentMinerIdSetPromise = prisma.miner
      .findMany({
        where: { slug: { in: PERMANENT_INVENTORY_MINER_SLUGS } },
        select: { id: true }
      })
      .then((rows) => new Set(rows.map((r) => r.id)));
  }
  return permanentMinerIdSetPromise;
}

export async function listInventory(userId) {
  const rows = await prisma.userInventory.findMany({
    where: { userId },
    orderBy: { acquiredAt: 'asc' }
  });
  if (rows.length === 0) return rows;
  const permanentIds = await getPermanentInventoryMinerIdSet();
  return rows.map((r) => {
    const base = { ...r, hashRate: stripAccidentalBillionScaleHs(r.hashRate) };
    if (base.expiresAt == null) return base;
    const byCatalog = r.minerId != null && permanentIds.has(r.minerId);
    const name = String(r.minerName || '');
    const byName =
      name === 'Pulse Mini v1' ||
      name === 'Pulse GPU v1' ||
      /^GPU\s+\d+(\.\d+)?\s*GHS$/i.test(name);
    if (byCatalog || byName) {
      return { ...base, expiresAt: null };
    }
    return base;
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
