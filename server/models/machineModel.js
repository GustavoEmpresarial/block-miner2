import prisma from '../src/db/prisma.js';
import { stripAccidentalBillionScaleHs } from '../utils/hashRateScale.js';

export async function listUserMachines(userId) {
  return prisma.userMiner.findMany({
    where: { userId },
    include: {
      miner: {
        select: {
          name: true,
          imageUrl: true
        }
      }
    },
    orderBy: { slotIndex: 'asc' }
  }).then((machines) =>
    machines.map((m) => ({
      ...m,
      hashRate: stripAccidentalBillionScaleHs(m.hashRate),
      miner_name: m.miner?.name,
      image_url: m.miner?.imageUrl
    }))
  );
}

export async function getMachineById(userId, machineId) {
  return prisma.userMiner.findFirst({
    where: { 
      id: machineId,
      userId 
    },
    include: {
      miner: {
        select: {
          name: true,
          imageUrl: true
        }
      }
    }
  }).then((m) =>
    m
      ? {
          ...m,
          hashRate: stripAccidentalBillionScaleHs(m.hashRate),
          miner_name: m.miner?.name,
          image_url: m.miner?.imageUrl
        }
      : null
  );
}

export async function getMachineBySlot(userId, slotIndex) {
  return prisma.userMiner.findFirst({
    where: { userId, slotIndex },
    select: { id: true, slotSize: true }
  });
}

export async function checkSlotAvailability(userId, slotIndex, slotsNeeded) {
  // For 2-cell machines, must start on even slots (0, 2, 4, 6)
  if (slotsNeeded === 2 && slotIndex % 2 !== 0) {
    return false;
  }
  
  // Check if any machine occupies target slots
  const targetSlots = Array.from({ length: slotsNeeded }, (_, i) => slotIndex + i);
  const machines = await prisma.userMiner.findMany({
    where: {
      userId,
      slotIndex: { in: targetSlots }
    }
  });
  if (machines.length > 0) return false;
  
  // Check if a 2-cell machine from the previous slot occupies current slot
  if (slotIndex % 2 === 1) {
    const prevMachine = await prisma.userMiner.findFirst({
      where: { userId, slotIndex: slotIndex - 1 }
    });
    if (prevMachine && prevMachine.slotSize === 2) return false;
  }
  
  return true;
}

export async function insertMachine(userId, slotIndex, level, hashRate, isActive, purchasedAt, slotSize = 1, minerId = null) {
  return prisma.userMiner.create({
    data: {
      userId,
      slotIndex,
      level,
      hashRate,
      isActive,
      purchasedAt: new Date(purchasedAt),
      slotSize,
      minerId
    }
  });
}

export async function updateMachineLevelHashRate(machineId, level, hashRate) {
  return prisma.userMiner.update({
    where: { id: machineId },
    data: { level, hashRate }
  });
}

export async function updateMachineActive(machineId, isActive) {
  return prisma.userMiner.update({
    where: { id: machineId },
    data: { isActive }
  });
}

export async function deleteMachine(machineId) {
  return prisma.userMiner.delete({
    where: { id: machineId }
  });
}

export async function listMachinesBySlotRange(userId, startSlot, endSlot) {
  return prisma.userMiner.findMany({
    where: {
      userId,
      slotIndex: { gte: startSlot, lte: endSlot }
    },
    include: {
      miner: true
    },
    orderBy: { slotIndex: 'asc' }
  });
}

export async function deleteMachinesBySlotRange(userId, startSlot, endSlot) {
  return prisma.userMiner.deleteMany({
    where: {
      userId,
      slotIndex: { gte: startSlot, lte: endSlot }
    }
  });
}
