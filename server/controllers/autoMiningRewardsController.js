import prisma from '../src/db/prisma.js';

export async function createRewardHandler(req, res) {
  try {
    const { name, slug, gpu_hash_rate, image_url, description } = req.body;
    if (!name || !slug || gpu_hash_rate === undefined) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    const reward = await prisma.autoMiningReward.create({
      data: { name, slug, gpuHashRate: Number(gpu_hash_rate), imageUrl: image_url, description }
    });

    res.status(201).json({ success: true, data: reward });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}

export async function getAllRewardsHandler(req, res) {
  try {
    const rewards = await prisma.autoMiningReward.findMany();
    res.json({ success: true, data: rewards, count: rewards.length });
  } catch (err) {
    res.status(500).json({ success: false, error: "Error fetching rewards" });
  }
}

export async function getActiveRewardsHandler(req, res) {
  try {
    const rewards = await prisma.autoMiningReward.findMany({ where: { isActive: true } });
    res.json({ success: true, data: rewards, count: rewards.length });
  } catch (err) {
    res.status(500).json({ success: false, error: "Error fetching rewards" });
  }
}

export async function getRewardHandler(req, res) {
  try {
    const { reward_id } = req.params;
    const reward = await prisma.autoMiningReward.findUnique({ where: { id: Number(reward_id) } });
    if (!reward) return res.status(404).json({ success: false, error: "Reward not found" });
    res.json({ success: true, data: reward });
  } catch (err) {
    res.status(500).json({ success: false, error: "Error fetching reward" });
  }
}

export async function updateRewardHandler(req, res) {
  try {
    const { reward_id } = req.params;
    const reward = await prisma.autoMiningReward.update({
      where: { id: Number(reward_id) },
      data: req.body
    });
    res.json({ success: true, data: reward });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}

export async function activateRewardHandler(req, res) {
  try {
    const { reward_id } = req.params;
    const reward = await prisma.autoMiningReward.update({
      where: { id: Number(reward_id) },
      data: { isActive: true }
    });
    res.json({ success: true, data: reward });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}

export async function deactivateRewardHandler(req, res) {
  try {
    const { reward_id } = req.params;
    const reward = await prisma.autoMiningReward.update({
      where: { id: Number(reward_id) },
      data: { isActive: false }
    });
    res.json({ success: true, data: reward });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}

export async function deleteRewardHandler(req, res) {
  try {
    const { reward_id } = req.params;
    await prisma.autoMiningReward.delete({ where: { id: Number(reward_id) } });
    res.json({ success: true, message: "Reward deleted" });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}

export async function getRewardsStatsHandler(req, res) {
  try {
    const total = await prisma.autoMiningReward.count();
    const active = await prisma.autoMiningReward.count({ where: { isActive: true } });
    res.json({ success: true, data: { total, active } });
  } catch (err) {
    res.status(500).json({ success: false, error: "Error fetching stats" });
  }
}
