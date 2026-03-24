import * as machineModel from "../models/machineModel.js";
import * as inventoryModel from "../models/inventoryModel.js";
import * as minersModel from "../models/minersModel.js";
import { getOrCreateMinerProfile, syncUserBaseHashRate } from "../models/minerProfileModel.js";
import { getMiningEngine } from "../src/miningEngineInstance.js";
import prisma from '../src/db/prisma.js';

const DEFAULT_MINER_IMAGE_URL = "/assets/machines/reward1.png";

export async function listMachines(req, res) {
  try {
    const machines = await machineModel.listUserMachines(req.user.id);
    res.json({ ok: true, machines });
  } catch (error) {
    console.error("Error loading machines:", error);
    res.status(500).json({ ok: false, message: "Unable to load machines." });
  }
}

export async function toggleMachine(req, res) {
  try {
    const { machineId, isActive } = req.body;
    const machine = await machineModel.getMachineById(req.user.id, machineId);
    if (!machine) return res.status(404).json({ ok: false, message: "Machine not found." });

    await machineModel.updateMachineActive(machineId, isActive);

    // Sync power
    await syncUserBaseHashRate(req.user.id);
    const engine = getMiningEngine();
    if (engine) await engine.reloadMinerProfile(req.user.id);

    res.json({ ok: true, message: isActive ? "Machine activated." : "Machine deactivated." });
  } catch {
    res.status(500).json({ ok: false, message: "Unable to toggle machine." });
  }
}

export async function removeMachine(req, res) {
  try {
    const machineId = Number(req.body?.machineId);
    if (!Number.isInteger(machineId) || machineId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid machine id." });
    }

    const machine = await machineModel.getMachineById(req.user.id, machineId);
    if (!machine) return res.status(404).json({ ok: false, message: "Miner not found." });

    const minerName = String(machine.miner_name || machine.miner?.name || "Unknown Miner").trim();
    const imageUrl = machine.image_url || machine.imageUrl || machine.miner?.imageUrl || DEFAULT_MINER_IMAGE_URL;
    const hashRate = Number(machine.hashRate || machine.hash_rate || 0);
    const slotSize = Number(machine.slotSize || 1);
    const level = Number(machine.level || 1);

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.userInventory.create({
        data: {
          userId: req.user.id,
          minerName,
          level,
          hashRate,
          slotSize,
          minerId: machine.minerId,
          imageUrl,
          acquiredAt: now
        }
      });
      await tx.userMiner.delete({ where: { id: machineId } });
    });

    // Sync power
    await syncUserBaseHashRate(req.user.id);
    const engine = getMiningEngine();
    if (engine) await engine.reloadMinerProfile(req.user.id);

    res.json({ ok: true, message: "Miner sent to inventory!" });
  } catch (error) {
    console.error("Error removing miner:", error);
    res.status(500).json({ ok: false, message: "Error removing miner." });
  }
}

export async function moveMachine(req, res) {
  try {
    const { machineId, targetSlotIndex } = req.body;

    if (!Number.isInteger(targetSlotIndex) || targetSlotIndex < 0 || targetSlotIndex >= 80) {
      return res.status(400).json({ ok: false, message: "Invalid target slot." });
    }

    const machine = await machineModel.getMachineById(req.user.id, machineId);
    if (!machine) return res.status(404).json({ ok: false, message: "Machine not found." });

    if (machine.slotSize === 2 && targetSlotIndex % 2 !== 0) {
      return res.status(400).json({ ok: false, message: "Large machines must start on an even slot." });
    }

    // Check if slot is occupied
    const targetSlots = Array.from({ length: machine.slotSize }, (_, i) => targetSlotIndex + i);
    const existingMachines = await prisma.userMiner.findMany({
      where: {
        userId: req.user.id,
        slotIndex: { in: targetSlots },
        id: { not: machineId } // Ignore self
      },
      include: { miner: true }
    });

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      // 1. Send existing overlapping machines to inventory
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
      if (targetSlotIndex % 2 === 1) {
        const prevMachine = await tx.userMiner.findFirst({
          where: {
            userId: req.user.id,
            slotIndex: targetSlotIndex - 1,
            id: { not: machineId }
          },
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

      // 2. Move the actual machine
      await tx.userMiner.update({
        where: { id: machineId },
        data: { slotIndex: targetSlotIndex }
      });
    });

    // Sync power and engine profile
    await syncUserBaseHashRate(req.user.id);
    const engine = getMiningEngine();
    if (engine) await engine.reloadMinerProfile(req.user.id);

    res.json({ ok: true, message: "Machine moved successfully." });
  } catch (error) {
    console.error("Move Error:", error);
    res.status(500).json({ ok: false, message: "Error moving machine." });
  }
}
