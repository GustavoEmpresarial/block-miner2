import crypto from "crypto";
import prisma from '../src/db/prisma.js';
import loggerLib from "../utils/logger.js";

const logger = loggerLib.child("ZerAdsController");
const ZERADS_SITE_ID = process.env.ZERADS_SITE_ID || "10776";
const ZERADS_PTC_EXCHANGE_RATE = Number(process.env.ZERADS_PTC_EXCHANGE_RATE) || 0.0001;

export async function getPtcLink(req, res) {
  try {
    const userId = req.user.id;
    const externalUser = `u${userId}_${crypto.createHash('sha256').update(String(userId)).digest('hex').slice(0, 8)}`;
    const ptcUrl = `https://zerads.com/ptc.php?ref=${ZERADS_SITE_ID}&user=${externalUser}`;
    res.json({ ok: true, ptcUrl, externalUser });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error generating link." });
  }
}

export async function handlePtcCallback(req, res) {
  try {
    const { user: externalUser, amount, clicks } = req.query;
    if (!externalUser || !amount) return res.status(400).send("missing_params");

    const userIdMatch = externalUser.match(/^u(\d+)_/);
    if (!userIdMatch) return res.status(400).send("invalid_user");
    
    const userId = parseInt(userIdMatch[1]);
    const amountNum = Number(amount);
    const payoutAmount = amountNum * ZERADS_PTC_EXCHANGE_RATE;

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { usdcBalance: { increment: payoutAmount } }
      });
      
      await tx.auditLog.create({
        data: {
          userId,
          action: "zerads_ptc",
          details: { externalUser, amountZer: amountNum, payoutAmount, clicks }
        }
      });
    });

    res.send("ok");
  } catch (error) {
    logger.error("ZerAds callback error", { error: error.message });
    res.status(500).send("error");
  }
}
