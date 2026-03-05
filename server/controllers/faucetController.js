import prisma from '../src/db/prisma.js';
import * as inventoryModel from "../models/inventoryModel.js";
import * as minersModel from "../models/minersModel.js";
import { getBrazilCheckinDateKey } from "../utils/checkinDate.js";

const DEFAULT_MINER_IMAGE_URL = "/assets/machines/reward1.png";
const DEFAULT_FAUCET_COOLDOWN_MS = 60 * 60 * 1000;
const FAUCET_PARTNER_WAIT_MS = 5_000;
const FAUCET_PARTNER_URL = String(process.env.FAUCET_PARTNER_URL || "https://faucetpay.io/").trim();

async function getActiveReward() {
  const reward = await prisma.faucetReward.findFirst({
    where: { isActive: true },
    include: { miner: true },
    orderBy: { id: 'desc' }
  });

  if (!reward?.miner) return null;

  return {
    rewardId: reward.id,
    cooldownMs: reward.cooldownMs || DEFAULT_FAUCET_COOLDOWN_MS,
    miner: reward.miner
  };
}

function buildStatusPayload(record, now, cooldownMs) {
  if (!record || !record.claimedAt) {
    return { available: true, remainingMs: 0, nextClaimAt: null, totalClaims: record?.totalClaims || 0 };
  }

  const nextClaimAt = new Date(record.claimedAt.getTime() + cooldownMs);
  const remainingMs = Math.max(0, nextClaimAt.getTime() - now.getTime());

  return {
    available: remainingMs === 0,
    remainingMs,
    nextClaimAt,
    totalClaims: record.totalClaims || 0
  };
}

async function normalizeFaucetRecord(userId, record) {
  const todayKey = getBrazilCheckinDateKey();
  if (!record) return { record: null, todayKey };
  if (record.dayKey === todayKey) return { record, todayKey };

  const updated = await prisma.faucetClaim.update({
    where: { userId },
    data: { totalClaims: 0, dayKey: todayKey }
  });

  return { record: updated, todayKey };
}

export async function startPartnerVisit(req, res) {
  try {
    const now = new Date();
    const todayKey = getBrazilCheckinDateKey();
    const eligibleAt = new Date(now.getTime() + FAUCET_PARTNER_WAIT_MS);

    await prisma.faucetPartnerVisit.upsert({
      where: { userId_dayKey: { userId: req.user.id, dayKey: todayKey } },
      update: { openedAt: now, eligibleAt, updatedAt: now },
      create: { userId: req.user.id, dayKey: todayKey, openedAt: now, eligibleAt }
    });

    res.json({
      ok: true,
      partnerUrl: FAUCET_PARTNER_URL,
      waitMs: FAUCET_PARTNER_WAIT_MS,
      eligibleAt: eligibleAt.getTime()
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error starting visit." });
  }
}

export async function getStatus(req, res) {
  try {
    const userId = req.user.id;
    const record = await prisma.faucetClaim.findUnique({ where: { userId } });
    const reward = await getActiveReward();
    
    if (!reward) {
      return res.json({ ok: true, available: false, message: "No faucet reward configured.", canClaim: false, reward: null });
    }

    const normalized = await normalizeFaucetRecord(userId, record);
    const now = new Date();
    const payload = buildStatusPayload(normalized.record, now, reward.cooldownMs);
    
    const visit = await prisma.faucetPartnerVisit.findUnique({
      where: { userId_dayKey: { userId, dayKey: normalized.todayKey } }
    });

    const lastClaimAt = normalized.record?.claimedAt?.getTime() || 0;
    const visitOpenedAt = visit?.openedAt?.getTime() || 0;
    const visitEligibleAt = visit?.eligibleAt?.getTime() || 0;
    const hasFreshVisit = visitOpenedAt > 0 && visitOpenedAt > lastClaimAt;
    const waitRemainingMs = hasFreshVisit ? Math.max(0, visitEligibleAt - now.getTime()) : 0;
    const partnerReady = hasFreshVisit && waitRemainingMs === 0;

    res.json({
      ok: true,
      ...payload,
      canClaim: Boolean(payload.available && partnerReady),
      reward: {
        id: reward.rewardId,
        minerId: reward.miner.id,
        name: reward.miner.name,
        hashRate: reward.miner.baseHashRate,
        slotSize: reward.miner.slotSize,
        imageUrl: reward.miner.imageUrl || DEFAULT_MINER_IMAGE_URL
      }
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error loading status." });
  }
}

export async function claim(req, res) {
  try {
    const userId = req.user.id;
    const now = new Date();
    const reward = await getActiveReward();
    if (!reward) return res.status(500).json({ ok: false, message: "Faucet reward not configured." });

    const record = await prisma.faucetClaim.findUnique({ where: { userId } });
    const normalized = await normalizeFaucetRecord(userId, record);
    const status = buildStatusPayload(normalized.record, now, reward.cooldownMs);

    if (!status.available) {
      return res.status(429).json({ ok: false, message: "Cooldown active.", remainingMs: status.remainingMs });
    }

    const miner = reward.miner;
    
    await prisma.$transaction(async (tx) => {
      await tx.userInventory.create({
        data: {
          userId,
          minerId: miner.id,
          minerName: miner.name,
          level: 1,
          hashRate: miner.baseHashRate,
          slotSize: miner.slotSize,
          imageUrl: miner.imageUrl || DEFAULT_MINER_IMAGE_URL,
          acquiredAt: now
        }
      });

      await tx.faucetClaim.upsert({
        where: { userId },
        update: { claimedAt: now, totalClaims: { increment: 1 }, dayKey: normalized.todayKey },
        create: { userId, claimedAt: now, totalClaims: 1, dayKey: normalized.todayKey }
      });
    });

    res.json({
      ok: true,
      message: `Claim successful! ${miner.name} added.`,
      nextAvailableAt: now.getTime() + reward.cooldownMs
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error claiming faucet." });
  }
}
