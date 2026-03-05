import prisma from '../src/db/prisma.js';
import { getBrazilCheckinDateKey } from "../utils/checkinDate.js";

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

export async function getStatus(req, res) {
  try {
    const checkin = await getTodayCheckin(req.user.id);
    res.json({
      ok: true,
      checkedIn: !!checkin,
      status: checkin?.status || null,
      txHash: checkin?.txHash || null
    });
  } catch {
    res.status(500).json({ ok: false, message: "Unable to load check-in status." });
  }
}

export async function confirmCheckin(req, res) {
  try {
    const { txHash } = req.body;
    const today = getBrazilCheckinDateKey();
    
    const existing = await getTodayCheckin(req.user.id);
    if (existing) return res.json({ ok: true, alreadyCheckedIn: true });

    const tx = await rpcCall("eth_getTransactionByHash", [txHash]);
    if (!tx || tx.to.toLowerCase() !== CHECKIN_RECEIVER.toLowerCase()) {
      return res.status(400).json({ ok: false, message: "Invalid transaction." });
    }

    await prisma.dailyCheckin.create({
      data: {
        userId: req.user.id,
        checkinDate: today,
        txHash,
        status: 'confirmed',
        chainId: POLYGON_CHAIN_ID,
        amount: 0.01
      }
    });

    res.json({ ok: true, status: 'confirmed' });
  } catch (error) {
    console.error("Checkin error:", error);
    res.status(500).json({ ok: false, message: "Unable to verify check-in." });
  }
}
