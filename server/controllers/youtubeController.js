import prisma from '../src/db/prisma.js';
import loggerLib from "../utils/logger.js";

const logger = loggerLib.child("YouTubeController");

const HASH_IN_GH = 1_000_000_000;
const REWARD_PER_CLAIM_HS = 3 * HASH_IN_GH; // 3 GH/s in H/s
const DURATION_HOURS = 24;
const DAILY_LIMIT_HS = 1440 * HASH_IN_GH; // Max 1440 GH/s per day, stored in H/s

export async function getStatus(req, res) {
  try {
    const userId = req.user.id;
    const now = new Date();
    const activePowers = await prisma.youtubeWatchPower.findMany({
      where: { userId, expiresAt: { gt: now } }
    });
    
    const activeHashRate = activePowers.reduce((sum, p) => sum + (p.hashRate || 0), 0);
    
    res.json({ 
      ok: true, 
      activeHashRate, 
      count: activePowers.length,
      rewardHs: REWARD_PER_CLAIM_HS,
      rewardGh: REWARD_PER_CLAIM_HS / HASH_IN_GH,
      durationMin: DURATION_HOURS * 60
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

    const hash24h = claims24h.reduce((sum, c) => sum + (c.hashRate || 0), 0);

    res.json({ 
      ok: true, 
      claims24h: claims24h.length,
      hashGranted24h: hash24h,
      claimsTotal: claimsAll._count,
      hashGrantedTotal: Number(claimsAll._sum.hashRate || 0),
      recent: historyRecent,
      dailyLimit: DAILY_LIMIT_HS
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
    const currentDailyHash = claims24h.reduce((sum, c) => sum + (c.hashRate || 0), 0);

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
      message: `+${(REWARD_PER_CLAIM_HS / HASH_IN_GH).toFixed(2)} GH/s activated for 24h!`,
      rewardHs: REWARD_PER_CLAIM_HS,
      rewardGh: REWARD_PER_CLAIM_HS / HASH_IN_GH
    });
  } catch (error) {
    logger.error("YT claim error", { error: error.message });
    res.status(500).json({ ok: false, message: "Error claiming reward." });
  }
}
