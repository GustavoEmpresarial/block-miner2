import prisma from '../src/db/prisma.js';
import loggerLib from "../utils/logger.js";
import { stripAccidentalBillionScaleHs } from "../utils/hashRateScale.js";

const logger = loggerLib.child("YouTubeController");

const HASH_IN_GH = 1_000_000_000;

function parsePositiveHs(raw, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

/** Hash por claim em H/s (ex.: 3 = 3 H/s). Antes era 3e9 (3 GH/s). */
const REWARD_PER_CLAIM_HS = (() => {
  const n = Number(process.env.YOUTUBE_WATCH_REWARD_HS);
  if (!Number.isFinite(n) || n <= 0) return 3;
  return n;
})();

const DURATION_HOURS = 24;

/**
 * Soma máxima de hash concedido nas últimas 24h (histórico), em H/s.
 * Omissão: 480 × recompensa (equivale ao teto antigo 1440 GH/s ÷ 3 GH/s por claim).
 */
const DAILY_LIMIT_HS = (() => {
  const fromEnv = parsePositiveHs(process.env.YOUTUBE_WATCH_DAILY_LIMIT_HS, NaN);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return 480 * REWARD_PER_CLAIM_HS;
})();

function rewardLabelHs(hs) {
  if (hs >= HASH_IN_GH) return `${(hs / HASH_IN_GH).toFixed(2)} GH/s`;
  if (hs >= 1_000_000) return `${(hs / 1_000_000).toFixed(2)} MH/s`;
  if (hs >= 1_000) return `${(hs / 1_000).toFixed(2)} kH/s`;
  return `${hs} H/s`;
}

export async function getStatus(req, res) {
  try {
    const userId = req.user.id;
    const now = new Date();
    const activePowers = await prisma.youtubeWatchPower.findMany({
      where: { userId, expiresAt: { gt: now } }
    });
    
    const activeHashRate = activePowers.reduce((sum, p) => sum + stripAccidentalBillionScaleHs(p.hashRate), 0);
    
    res.json({
      ok: true,
      activeHashRate,
      count: activePowers.length,
      rewardHs: REWARD_PER_CLAIM_HS,
      rewardGh: REWARD_PER_CLAIM_HS / HASH_IN_GH,
      durationMin: DURATION_HOURS * 60,
      dailyLimitHs: DAILY_LIMIT_HS
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error fetching status." });
  }
}

export async function getStats(req, res) {
  try {
    const userId = req.user.id;
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [claims24h, claimsAll, historyRecent] = await Promise.all([
      prisma.youtubeWatchHistory.findMany({
        where: { userId, createdAt: { gt: yesterday } }
      }),
      prisma.youtubeWatchHistory.aggregate({
        where: { userId },
        _count: true,
        _sum: { hashRate: true }
      }),
      prisma.youtubeWatchHistory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5
      })
    ]);

    const hash24h = claims24h.reduce((sum, c) => sum + stripAccidentalBillionScaleHs(c.hashRate), 0);

    res.json({
      ok: true,
      claims24h: claims24h.length,
      hashGranted24h: hash24h,
      claimsTotal: claimsAll._count,
      hashGrantedTotal: Number(claimsAll._sum.hashRate || 0),
      recent: historyRecent,
      dailyLimit: DAILY_LIMIT_HS,
      dailyLimitHs: DAILY_LIMIT_HS
    });
  } catch (error) {
    logger.error("YT stats error", error);
    res.status(500).json({ ok: false, message: "Error fetching stats." });
  }
}

export async function claimReward(req, res) {
  try {
    const userId = req.user.id;
    const { videoId } = req.body;
    if (!videoId) return res.status(400).json({ ok: false, message: "Missing videoId" });

    // Check time balance
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { ytSecondsBalance: true }
    });

    if (!user || user.ytSecondsBalance < 60) {
      return res.status(400).json({ ok: false, message: "Tempo de visualização insuficiente verificado pelo servidor." });
    }

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Check daily limit
    const claims24h = await prisma.youtubeWatchHistory.findMany({
      where: { userId, createdAt: { gt: yesterday } }
    });
    const currentDailyHash = claims24h.reduce((sum, c) => sum + stripAccidentalBillionScaleHs(c.hashRate), 0);

    if (currentDailyHash + REWARD_PER_CLAIM_HS > DAILY_LIMIT_HS) {
      return res.status(400).json({ ok: false, message: "Daily reward limit reached. Try again later!" });
    }

    const expiresAt = new Date(Date.now() + DURATION_HOURS * 60 * 60 * 1000);

    await prisma.$transaction(async (tx) => {
      // 1. Create active power
      await tx.youtubeWatchPower.create({
        data: { userId, sourceVideoId: videoId, hashRate: REWARD_PER_CLAIM_HS, claimedAt: now, expiresAt }
      });
      // 2. Create history record
      await tx.youtubeWatchHistory.create({
        data: { userId, sourceVideoId: videoId, hashRate: REWARD_PER_CLAIM_HS, claimedAt: now, expiresAt, status: "granted" }
      });
      // 3. Deduct time balance
      await tx.user.update({
        where: { id: userId },
        data: { ytSecondsBalance: { decrement: 60 } }
      });
      // 4. Log it
      await tx.auditLog.create({
        data: { userId, action: "youtube_claim", detailsJson: JSON.stringify({ videoId, hashRate: REWARD_PER_CLAIM_HS, expiresAt }) }
      });
    });

    res.json({
      ok: true,
      message: `+${rewardLabelHs(REWARD_PER_CLAIM_HS)} ativado por 24h!`,
      rewardHs: REWARD_PER_CLAIM_HS,
      rewardGh: REWARD_PER_CLAIM_HS / HASH_IN_GH
    });
  } catch (error) {
    logger.error("YT claim error", { error: error.message });
    res.status(500).json({ ok: false, message: "Error claiming reward." });
  }
}
