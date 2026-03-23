import prisma from '../src/db/prisma.js';
import loggerLib from "../utils/logger.js";

const logger = loggerLib.child("SessionController");

export async function processHeartbeat(req, res) {
  try {
    const userId = req.user.id;
    const { type, security } = req.body; 
    
    if (!['youtube', 'auto-mining'].includes(type)) {
      return res.status(400).json({ ok: false, message: "Invalid type" });
    }

    // BOT DETECTION: Verify security payload
    if (security?.isBot) {
        logger.warn(`Bot signature detected for user ${userId} on ${type}`);
        return res.status(403).json({ ok: false, message: "Automation detected. Access denied." });
    }

    // Basic fingerprint verification (anti-tamper)
    try {
        const decoded = JSON.parse(Buffer.from(security?.fingerprint || "", 'base64').toString());
        const nowTs = Date.now();
        // If the timestamp in the payload is in the future or too old, something is wrong
        if (decoded.ts > nowTs + 5000 || decoded.ts < nowTs - 60000) {
            return res.status(400).json({ ok: false, message: "Invalid session token" });
        }
    } catch {
        return res.status(400).json({ ok: false, message: "Security check failed" });
    }

    const now = new Date();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        lastYoutubeHeartbeatAt: true,
        lastAutoMiningHeartbeatAt: true
      }
    });

    const lastForType =
      type === "youtube" ? user?.lastYoutubeHeartbeatAt : user?.lastAutoMiningHeartbeatAt;
    if (lastForType) {
      const diff = (now.getTime() - new Date(lastForType).getTime()) / 1000;
      if (diff < 8) {
        return res.json({ ok: true, message: "Too fast, heartbeat throttled", buffered: true });
      }
    }

    const typeHeartbeatField =
      type === "youtube" ? "lastYoutubeHeartbeatAt" : "lastAutoMiningHeartbeatAt";

    await prisma.user.update({
      where: { id: userId },
      data: {
        lastHeartbeatAt: now,
        [typeHeartbeatField]: now,
        [type === "youtube" ? "ytSecondsBalance" : "autoMiningSecondsBalance"]: {
          increment: 10
        }
      }
    });

    res.json({ ok: true });
  } catch (error) {
    logger.error("Heartbeat error", error);
    res.status(500).json({ ok: false });
  }
}
