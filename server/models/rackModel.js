import prisma from './db.js';

export async function listRacks(userId) {
  return prisma.rackConfig.findMany({
    where: { userId },
    orderBy: { rackIndex: 'asc' },
    select: {
      rackIndex: true,
      customName: true
    }
  });
}

export async function upsertRackName(userId, rackIndex, customName) {
  return prisma.rackConfig.upsert({
    where: {
      userId_rackIndex: {
        userId,
        rackIndex
      }
    },
    update: {
      customName,
      updatedAt: new Date()
    },
    create: {
      userId,
      rackIndex,
      customName
    }
  });
}
