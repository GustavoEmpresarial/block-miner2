import prisma from '../src/db/prisma.js';
import loggerLib from "../utils/logger.js";

const logger = loggerLib.child("AutoMiningGpuController");

export async function getAvailableGPUsHandler(req, res) {
  try {
    const userId = req.user.id;
    const gpus = await prisma.userAutoMiningGpu.findMany({
      where: { userId, status: 'available' },
      include: { reward: true }
    });
    res.json({ success: true, data: gpus, count: gpus.length });
  } catch (err) {
    logger.error("Failed to get available GPUs", { error: err.message });
    res.status(500).json({ success: false, error: "Server error" });
  }
}

export async function claimGPUHandler(req, res) {
  try {
    const userId = req.user.id;
    const { gpu_id } = req.body;
    if (!gpu_id) return res.status(400).json({ success: false, error: "GPU ID is required" });

    const updated = await prisma.userAutoMiningGpu.update({
      where: { id: Number(gpu_id), userId, status: 'available' },
      data: { status: 'claimed', claimedAt: new Date() }
    });

    res.json({ success: true, message: "GPU claimed successfully", data: updated });
  } catch (err) {
    logger.error("Failed to claim GPU", { error: err.message });
    res.status(400).json({ success: false, error: "Unable to claim GPU" });
  }
}

export async function getGPUHistoryHandler(req, res) {
  try {
    const userId = req.user.id;
    const history = await prisma.userAutoMiningGpu.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    res.json({ success: true, data: history });
  } catch (err) {
    res.status(500).json({ success: false, error: "Server error" });
  }
}

export async function getActiveRewardHandler(req, res) {
  try {
    const reward = await prisma.autoMiningGpuReward.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: reward });
  } catch (err) {
    res.status(500).json({ success: false, error: "Server error" });
  }
}
