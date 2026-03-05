import express from "express";
import prisma from "../src/db/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const rankingRouter = express.Router();

rankingRouter.get("/", requireAuth, async (req, res) => {
  try {
    const topUsers = await prisma.user.findMany({
      take: 50,
      orderBy: { polBalance: 'desc' },
      select: {
        id: true,
        username: true,
        name: true,
        polBalance: true
      }
    });
    res.json({ ok: true, ranking: topUsers });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Unable to load ranking." });
  }
});
