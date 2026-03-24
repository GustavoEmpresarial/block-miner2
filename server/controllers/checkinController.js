import prisma from '../src/db/prisma.js';
import { getBrazilCheckinDateKey, computeBrazilStreak } from "../utils/checkinDate.js";

const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL || "https://polygon-rpc.com";
const POLYGON_CHAIN_ID = Number(process.env.POLYGON_CHAIN_ID || 137);
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const DEFAULT_CHECKIN_WEI = "10000000000000000";

function isValidEthAddress(a) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(a || "").trim());
}

/**
 * CHECKIN_RECEIVER explícito, ou o mesmo endereço de depósito (DEPOSIT_WALLET_ADDRESS),
 * para deploys que só configuraram a carteira de depósito.
 */
function getCheckinReceiver() {
  const candidates = [
    String(process.env.CHECKIN_RECEIVER || "").trim(),
    String(process.env.DEPOSIT_WALLET_ADDRESS || "").trim()
  ];
  for (const a of candidates) {
    if (isValidEthAddress(a) && a.toLowerCase() !== ZERO_ADDR) return a;
  }
  return null;
}

function getCheckinAmountWei() {
  const raw = String(process.env.CHECKIN_AMOUNT_WEI ?? "").trim();
  const use = raw || DEFAULT_CHECKIN_WEI;
  try {
    const n = BigInt(use);
    if (n <= 0n) return null;
    return n;
  } catch {
    return null;
  }
}

function weiToPolFloat(wei) {
  return Number(wei) / 1e18;
}

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
    take: 120
  });
  return computeBrazilStreak(
    rows.map((r) => r.checkinDate),
    getBrazilCheckinDateKey()
  );
}

export async function getStatus(req, res) {
  try {
    const checkin = await getTodayCheckin(req.user.id);
    const streak = await getCurrentStreak(req.user.id);
    const receiver = getCheckinReceiver();
    const amountWei = getCheckinAmountWei();
    res.json({
      ok: true,
      checkedIn: !!checkin,
      alreadyClaimed: !!checkin,
      status: checkin?.status || null,
      txHash: checkin?.txHash || null,
      streak,
      checkinConfigured: Boolean(receiver && amountWei),
      checkinReceiver: receiver,
      checkinAmountWei: amountWei ? amountWei.toString() : null,
      chainId: POLYGON_CHAIN_ID
    });
  } catch {
    res.status(500).json({ ok: false, message: "Unable to load check-in status." });
  }
}

export async function confirmCheckin(req, res) {
  try {
    const receiver = getCheckinReceiver();
    const minWei = getCheckinAmountWei();
    if (!receiver || !minWei) {
      return res.status(503).json({ ok: false, message: "Check-in payment is not configured on the server." });
    }

    const incomingTxHash = String(req.body?.txHash || "").trim();
    if (!/^0x[0-9a-fA-F]{64}$/i.test(incomingTxHash)) {
      return res.status(400).json({ ok: false, message: "Missing or invalid transaction hash." });
    }
    const txHashNorm = incomingTxHash.toLowerCase();

    const today = getBrazilCheckinDateKey();

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { walletAddress: true }
    });
    const linked = String(user?.walletAddress || "").trim().toLowerCase();
    if (!linked) {
      return res.status(400).json({
        ok: false,
        message: "Link and verify your Polygon wallet before check-in."
      });
    }

    const tx = await rpcCall("eth_getTransactionByHash", [incomingTxHash]);
    if (!tx) {
      return res.status(400).json({ ok: false, message: "Transaction not found on-chain." });
    }

    const from = String(tx.from || "").toLowerCase();
    const to = String(tx.to || "").toLowerCase();
    if (from !== linked) {
      return res.status(400).json({
        ok: false,
        message: "Transaction must be sent from your linked wallet address."
      });
    }
    if (to !== receiver.toLowerCase()) {
      return res.status(400).json({ ok: false, message: "Invalid recipient for check-in payment." });
    }

    let valueWei;
    try {
      valueWei = BigInt(tx.value || "0");
    } catch {
      return res.status(400).json({ ok: false, message: "Invalid transaction value." });
    }
    if (valueWei < minWei) {
      return res.status(400).json({ ok: false, message: "Payment amount is below the required check-in fee." });
    }

    const receipt = await rpcCall("eth_getTransactionReceipt", [incomingTxHash]);
    if (!receipt || String(receipt.status || "").toLowerCase() !== "0x1") {
      return res.status(400).json({ ok: false, message: "Transaction is not confirmed or failed on-chain." });
    }

    const now = new Date();
    const amountPol = weiToPolFloat(valueWei);

    let outcome;
    try {
      outcome = await prisma.$transaction(async (tx) => {
        const existingToday = await tx.dailyCheckin.findUnique({
          where: { userId_checkinDate: { userId: req.user.id, checkinDate: today } }
        });
        if (existingToday) return { kind: "already_today" };

        const txUsedRow = await tx.dailyCheckin.findUnique({
          where: { txHash: txHashNorm }
        });
        if (txUsedRow) return { kind: "tx_used" };

        await tx.dailyCheckin.create({
          data: {
            userId: req.user.id,
            checkinDate: today,
            txHash: txHashNorm,
            status: "confirmed",
            chainId: POLYGON_CHAIN_ID,
            amount: amountPol,
            confirmedAt: now
          }
        });
        return { kind: "created" };
      });
    } catch (error) {
      if (error?.code === "P2002") {
        const streak = await getCurrentStreak(req.user.id);
        return res.json({
          ok: true,
          alreadyCheckedIn: true,
          alreadyClaimed: true,
          checkedIn: true,
          streak
        });
      }
      throw error;
    }

    if (outcome.kind === "tx_used") {
      return res.status(400).json({ ok: false, message: "This transaction was already used for a check-in." });
    }

    const streak = await getCurrentStreak(req.user.id);
    if (outcome.kind === "already_today") {
      return res.json({
        ok: true,
        alreadyCheckedIn: true,
        alreadyClaimed: true,
        checkedIn: true,
        streak
      });
    }

    res.json({ ok: true, status: "confirmed", checkedIn: true, alreadyClaimed: true, streak });
  } catch (error) {
    console.error("Checkin error:", error);
    res.status(500).json({ ok: false, message: "Unable to verify check-in." });
  }
}
