import prisma from '../src/db/prisma.js';
import loggerLib from "../utils/logger.js";

const logger = loggerLib.child("SessionController");

/** Espelha client/src/utils/security.js (IronDome): JSON → XOR com sk[0] → base64. */
function decodeIronDomeFingerprint(fingerprintB64, sk) {
  try {
    if (!fingerprintB64 || typeof sk !== "string" || sk.length === 0) return null;
    const xorKey = sk.charCodeAt(0);
    const raw = Buffer.from(String(fingerprintB64), "base64").toString("latin1");
    const clear = [...raw].map((ch) => String.fromCharCode(ch.charCodeAt(0) ^ xorKey)).join("");
    return JSON.parse(clear);
  } catch {
    return null;
  }
}

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

    const sk = security?.sk;
    const decoded = decodeIronDomeFingerprint(security?.fingerprint, sk);
    if (!decoded || typeof decoded !== "object") {
      return res.status(400).json({ ok: false, message: "Security check failed" });
    }
    if (decoded.b === true) {
      return res.status(403).json({ ok: false, message: "Automation detected. Access denied." });
    }
    if (decoded.k !== sk) {
      return res.status(400).json({ ok: false, message: "Invalid session token" });
    }
    const uptime = Number(decoded.u);
    if (!Number.isFinite(uptime) || uptime < 0 || uptime > 7 * 24 * 60 * 60 * 1000) {
      return res.status(400).json({ ok: false, message: "Invalid session token" });
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
      // Margem <8s: cliente a 8s + latência de rede podia cair em diff≈7.9 e perder crédito (YouTube).
      const minGap = Number(process.env.SESSION_HEARTBEAT_MIN_GAP_SEC);
      const gap = Number.isFinite(minGap) && minGap > 0 && minGap <= 30 ? minGap : 7;
      if (diff < gap) {
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
