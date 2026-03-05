import * as inventoryModel from "../models/inventoryModel.js";
import * as machineModel from "../models/machineModel.js";
import * as minersModel from "../models/minersModel.js";
import { getOrCreateMinerProfile, syncUserBaseHashRate } from "../models/minerProfileModel.js";
import { getMiningEngine } from "../src/miningEngineInstance.js";
import { getSlotSizeForMiner } from "../utils/minerUtils.js";
import prisma from "../src/db/prisma.js";

const DEFAULT_MINER_IMAGE_URL = "/assets/machines/reward1.png";
const SLOTS_PER_RACK = 8;

function getRackAndLocalSlot(slotIndex) {
  const safeSlotIndex = Number.isInteger(slotIndex) && slotIndex >= 0 ? slotIndex : 0;
  const rack = Math.floor(safeSlotIndex / SLOTS_PER_RACK) + 1;
  const localSlot = (safeSlotIndex % SLOTS_PER_RACK) + 1;
  return { rack, localSlot };
}

function formatRackSlotLabel(slotIndex, slotSize = 1) {
  const { rack, localSlot } = getRackAndLocalSlot(slotIndex);
  if (slotSize > 1) {
    return `Rack ${rack}, slots ${localSlot}-${localSlot + slotSize - 1}`;
  }
  return `Rack ${rack}, slot ${localSlot}`;
}

export async function getInventory(req, res) {
  try {
    const inventory = await inventoryModel.listInventory(req.user.id);
    res.json({ ok: true, inventory });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Unable to load inventory." });
  }
}

export async function installInventoryItem(req, res) {
  try {
    const slotIndex = Number(req.body?.slotIndex);
    const inventoryId = Number(req.body?.inventoryId);

    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= 80) {
      return res.status(400).json({ ok: false, message: "Invalid slot position." });
    }

    const inventoryItem = await inventoryModel.getInventoryItem(req.user.id, inventoryId);
    if (!inventoryItem) {
      return res.status(404).json({ ok: false, message: "Item not found in inventory." });
    }

    const slotSize = Number(inventoryItem.slotSize || 1);

    // --- FIX: Logic for 2-slot machines (must start on even slots 0, 2, 4...) ---
    if (slotSize === 2 && slotIndex % 2 !== 0) {
      return res.status(400).json({ ok: false, message: "Large machines must start on an even slot (1, 3, 5, 7 on UI)." });
    }

    // Check if slot is occupied
    const targetSlots = Array.from({ length: slotSize }, (_, i) => slotIndex + i);
    const existingMachines = await prisma.userMiner.findMany({
      where: {
        userId: req.user.id,
        slotIndex: { in: targetSlots }
      },
      include: { miner: true }
    });

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      // 1. If occupied, remove existing machines back to inventory
      if (existingMachines.length > 0) {
        for (const m of existingMachines) {
          await tx.userInventory.create({
            data: {
              userId: req.user.id,
              minerName: m.miner?.name,
              level: m.level,
              hashRate: m.hashRate,
              slotSize: m.slotSize,
              minerId: m.minerId,
              imageUrl: m.imageUrl || m.miner?.imageUrl,
              acquiredAt: now
            }
          });
          await tx.userMiner.delete({ where: { id: m.id } });
        }
      }

      // Check for 2-slot overlaps from previous slot
      if (slotIndex % 2 === 1) {
        const prevMachine = await tx.userMiner.findFirst({
          where: { userId: req.user.id, slotIndex: slotIndex - 1 },
          include: { miner: true }
        });
        if (prevMachine && prevMachine.slotSize === 2) {
          await tx.userInventory.create({
            data: {
              userId: req.user.id,
              minerName: prevMachine.miner?.name,
              level: prevMachine.level,
              hashRate: prevMachine.hashRate,
              slotSize: prevMachine.slotSize,
              minerId: prevMachine.minerId,
              imageUrl: prevMachine.imageUrl || prevMachine.miner?.imageUrl,
              acquiredAt: now
            }
          });
          await tx.userMiner.delete({ where: { id: prevMachine.id } });
        }
      }

      // 2. Create the new machine in the slot
      await tx.userMiner.create({
        data: {
          userId: req.user.id,
          slotIndex,
          level: inventoryItem.level,
          hashRate: inventoryItem.hashRate,
          isActive: true,
          slotSize,
          minerId: inventoryItem.minerId,
          imageUrl: inventoryItem.imageUrl || DEFAULT_MINER_IMAGE_URL
        }
      });

      // 3. Remove the inserted machine from inventory
      await tx.userInventory.delete({ where: { id: inventoryId, userId: req.user.id } });
    });

    // Sync database hash rate and notify the in-memory engine
    await syncUserBaseHashRate(req.user.id);
    const engine = getMiningEngine();
    if (engine) {
      await engine.reloadMinerProfile(req.user.id);
    }

    res.json({ ok: true, message: "Machine installed successfully!" });
  } catch (error) {
    console.error("Install Error:", error);
    res.status(500).json({ ok: false, message: "Internal server error during installation." });
  }
}

export async function removeInventoryItem(req, res) {
  try {
    const inventoryId = Number(req.body?.inventoryId);
    await prisma.userInventory.delete({ where: { id: inventoryId, userId: req.user.id } });
    res.json({ ok: true, message: "Item removed." });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error removing item." });
  }
}

export async function updateInventory(req, res) {
  res.json({ ok: true, message: "Inventory synced." });
}
