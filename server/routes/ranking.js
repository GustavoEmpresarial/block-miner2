import express from "express";
import prisma from "../src/db/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { stripAccidentalBillionScaleHs } from "../utils/hashRateScale.js";

export const rankingRouter = express.Router();

rankingRouter.get("/", requireAuth, async (req, res) => {
  try {
    const now = new Date();

    // Fetch users with their active power sources
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        name: true,
        miners: {
          where: { isActive: true },
          select: { hashRate: true }
        },
        gamePowers: {
          where: { expiresAt: { gt: now } },
          select: { hashRate: true }
        },
        ytPowers: {
          where: { expiresAt: { gt: now } },
          select: { hashRate: true }
        },
        gpuAccess: {
          where: { isClaimed: true, expiresAt: { gt: now } },
          select: { gpuHashRate: true }
        }
      }
    });

    // Calculate aggregated hashrates for each user (alinhado a minerProfileModel)
    const ranking = users.map(user => {
      const baseHashRate = user.miners.reduce(
        (sum, m) => sum + stripAccidentalBillionScaleHs(m.hashRate),
        0
      );
      const gameHashRate =
        user.gamePowers.reduce((sum, g) => sum + stripAccidentalBillionScaleHs(g.hashRate), 0) +
        user.ytPowers.reduce((sum, y) => sum + stripAccidentalBillionScaleHs(y.hashRate), 0) +
        user.gpuAccess.reduce((sum, g) => sum + stripAccidentalBillionScaleHs(g.gpuHashRate), 0);
      const totalHashRate = baseHashRate + gameHashRate;

      return {
        id: user.id,
        username: user.username || "Miner",
        name: user.name,
        totalHashRate,
        baseHashRate,
        gameHashRate
      };
    });

    // Sort by total hashrate descending and assign rank
    const sortedRanking = ranking
      .sort((a, b) => b.totalHashRate - a.totalHashRate)
      .slice(0, 50)
      .map((entry, index) => ({
        ...entry,
        rank: index + 1
      }));

    res.json({ ok: true, ranking: sortedRanking });
  } catch (error) {
    console.error("Ranking aggregation error:", error);
    res.status(500).json({ ok: false, message: "Unable to load ranking." });
  }
});

rankingRouter.get("/room/:username", requireAuth, async (req, res) => {
  try {
    const { username } = req.params;
    const now = new Date();
    
    const targetUser = await prisma.user.findFirst({
      where: { username },
      select: {
        id: true,
        username: true,
        miners: {
          where: { isActive: true },
          select: {
            id: true,
            hashRate: true,
            slotIndex: true,
            imageUrl: true,
            level: true,
            slotSize: true,
            miner: {
              select: {
                name: true
              }
            }
          }
        },
        gamePowers: {
          where: { expiresAt: { gt: now } },
          select: { hashRate: true }
        },
        ytPowers: {
          where: { expiresAt: { gt: now } },
          select: { hashRate: true }
        },
        gpuAccess: {
          where: { isClaimed: true, expiresAt: { gt: now } },
          select: { gpuHashRate: true }
        },
        rackConfigs: {
          select: {
            rackIndex: true,
            customName: true
          }
        }
      }
    });

    if (!targetUser) {
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    // Map miners to include the name from the relationship and keep camelCase for frontend utils
    const mappedMiners = targetUser.miners.map(m => ({
      id: m.id,
      hashRate: stripAccidentalBillionScaleHs(m.hashRate),
      slotIndex: m.slotIndex,
      imageUrl: m.imageUrl,
      level: m.level,
      slotSize: m.slotSize,
      minerName: m.miner?.name || "Miner"
    }));

    const gamePower =
      targetUser.gamePowers.reduce((sum, p) => sum + stripAccidentalBillionScaleHs(p.hashRate), 0) +
      targetUser.ytPowers.reduce((sum, p) => sum + stripAccidentalBillionScaleHs(p.hashRate), 0) +
      targetUser.gpuAccess.reduce((sum, g) => sum + stripAccidentalBillionScaleHs(g.gpuHashRate), 0);

    const racks = {};
    targetUser.rackConfigs.forEach(config => {
      racks[config.rackIndex] = config.customName;
    });

    res.json({ 
      ok: true, 
      user: { 
        ...targetUser, 
        miners: mappedMiners, 
        racks,
        gamePower
      } 
    });
  } catch (error) {
    console.error("Error fetching room data:", error);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});
