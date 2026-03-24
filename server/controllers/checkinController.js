import prisma from '../src/db/prisma.js';
import { getBrazilCheckinDateKey } from "../utils/checkinDate.js";
import crypto from "crypto";

const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL || "https://polygon-rpc.com";
const POLYGON_CHAIN_ID = Number(process.env.POLYGON_CHAIN_ID || 137);
const CHECKIN_RECEIVER = process.env.CHECKIN_RECEIVER || "0x0000000000000000000000000000000000000000";

async function rpcCall(method, params) {
  const response = await fetch(POLYGON_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message || "RPC error");
  return payload.result;
}

async function getTodayCheckin(userId) {
  const today = getBrazilCheckinDateKey();
  return prisma.dailyCheckin.findUnique({
    where: { userId_checkinDate: { userId, checkinDate: today } }
  });
}

async function getCurrentStreak(userId) {
  const rows = await prisma.dailyCheckin.findMany({
    where: { userId, status: "confirmed" },
    select: { checkinDate: true },
    orderBy: { checkinDate: "desc" },
    take: 90
  });
  const set = new Set(rows.map((r) => String(r.checkinDate)));
  let streak = 0;
  const cursor = new Date();
  while (true) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, "0");
    const d = String(cursor.getDate()).padStart(2, "0");
    const key = `${y}-${m}-${d}`;
    if (!set.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export async function getStatus(req, res) {
  try {
    const checkin = await getTodayCheckin(req.user.id);
    const streak = await getCurrentStreak(req.user.id);
    res.json({
      ok: true,
      checkedIn: !!checkin,
      alreadyClaimed: !!checkin,
      status: checkin?.status || null,
      txHash: checkin?.txHash || null,
      streak
    });
  } catch {
    res.status(500).json({ ok: false, message: "Unable to load check-in status." });
  }
}

export async function confirmCheckin(req, res) {
  try {
    const incomingTxHash = String(req.body?.txHash || "").trim();
    const today = getBrazilCheckinDateKey();
    
    const existing = await getTodayCheckin(req.user.id);
    if (existing) {
      const streak = await getCurrentStreak(req.user.id);
      return res.json({ ok: true, alreadyCheckedIn: true, alreadyClaimed: true, checkedIn: true, streak, rewardAmount: 0.01 });
    }

    const isPlaceholderHash = /^0x0{64}$/i.test(incomingTxHash);
    const shouldValidateOnchain = Boolean(incomingTxHash) && !isPlaceholderHash;

    let txHash = incomingTxHash;
    if (shouldValidateOnchain) {
      const tx = await rpcCall("eth_getTransactionByHash", [incomingTxHash]);
      if (!tx || tx.to?.toLowerCase() !== CHECKIN_RECEIVER.toLowerCase()) {
        return res.status(400).json({ ok: false, message: "Invalid transaction." });
      }
    } else {
      // Local deterministic pseudo-hash to satisfy unique non-null DB constraint.
      const digest = crypto.createHash("sha256").update(`checkin:${req.user.id}:${today}`).digest("hex");
      txHash = `0x${digest}`;
    }

    const now = new Date();

    await prisma.dailyCheckin.create({
      data: {
        userId: req.user.id,
        checkinDate: today,
        txHash,
        status: 'confirmed',
        chainId: POLYGON_CHAIN_ID,
        amount: 0.01,
        confirmedAt: now
      }
    });

    const streak = await getCurrentStreak(req.user.id);
    res.json({ ok: true, status: 'confirmed', checkedIn: true, alreadyClaimed: true, streak, rewardAmount: 0.01 });
  } catch (error) {
    console.error("Checkin error:", error);
    res.status(500).json({ ok: false, message: "Unable to verify check-in." });
  }
}
