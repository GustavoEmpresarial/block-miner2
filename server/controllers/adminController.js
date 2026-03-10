import fs from "fs/promises";
import path from "path";
import os from "os";
import { promisify } from "util";
import { execFile } from "child_process";
import { fileURLToPath } from "url";
import prisma from "../src/db/prisma.js";
import * as minersModel from "../models/minersModel.js";
import * as walletModel from "../models/walletModel.js";
import * as userModel from "../models/userModel.js";
import loggerLib from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = loggerLib.child("AdminController");
const execFileAsync = promisify(execFile);

// Utility: Server Metrics
async function measureCpuUsagePercent(sampleMs = 300) {
  const before = os.cpus().reduce((acc, cpu) => {
    acc.idle += cpu.times.idle;
    acc.total += Object.values(cpu.times).reduce((a, b) => a + b, 0);
    return acc;
  }, { idle: 0, total: 0 });

  await new Promise(r => setTimeout(r, sampleMs));

  const after = os.cpus().reduce((acc, cpu) => {
    acc.idle += cpu.times.idle;
    acc.total += Object.values(cpu.times).reduce((a, b) => a + b, 0);
    return acc;
  }, { idle: 0, total: 0 });

  const idleDelta = after.idle - before.idle;
  const totalDelta = after.total - before.total;
  return totalDelta <= 0 ? 0 : Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100));
}

async function collectServerMetrics() {
  const cpuUsage = await measureCpuUsagePercent();
  return {
    cpuUsagePercent: cpuUsage,
    memoryTotalBytes: os.totalmem(),
    memoryFreeBytes: os.freemem(),
    memoryUsagePercent: (1 - os.freemem() / os.totalmem()) * 100,
    uptimeSeconds: process.uptime(),
    platform: process.platform
  };
}

export async function getStats(_req, res) {
  try {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [usersTotal, usersBanned, usersNew24h, minersTotal, minersActive, balances, tx24h] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isBanned: true } }),
      prisma.user.count({ where: { createdAt: { gte: dayAgo } } }),
      prisma.miner.count(),
      prisma.userMiner.count({ where: { isActive: true } }),
      prisma.user.aggregate({ _sum: { polBalance: true } }),
      prisma.transaction.count({ where: { createdAt: { gte: dayAgo } } })
    ]);

    const metrics = await collectServerMetrics();

    res.json({
      ok: true,
      stats: {
        usersTotal,
        usersBanned,
        usersNew24h,
        minersTotal,
        minersActive,
        balanceTotal: Number(balances._sum.polBalance || 0),
        transactions24h: tx24h,
        ...metrics
      }
    });
  } catch (error) {
    logger.error("Admin stats error", { error: error.message });
    res.status(500).json({ ok: false, message: "Unable to load admin stats." });
  }
}

export async function listRecentUsers(req, res) {
  try {
    const page = Math.max(1, Number(req.query?.page || 1));
    const pageSize = Math.min(100, Number(req.query?.pageSize || 25));
    const query = req.query?.q;
    const fromDate = req.query?.from;
    const toDate = req.query?.to;

    const { users, total } = await userModel.listUsers({ page, pageSize, query, fromDate, toDate });
    res.json({ ok: true, users, page, pageSize, total });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Unable to load users." });
  }
}

export async function setUserBan(req, res) {
  try {
    const userId = Number(req.params?.id);
    const { isBanned } = req.body;
    await prisma.user.update({ where: { id: userId }, data: { isBanned: Boolean(isBanned) } });
    res.json({ ok: true, message: isBanned ? "User banned" : "User unbanned" });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Update failed" });
  }
}

export async function listMiners(_req, res) {
  try {
    const miners = await minersModel.listAllMiners();
    res.json({ ok: true, miners });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Load failed" });
  }
}

export async function createMiner(req, res) {
  try {
    const miner = await minersModel.createMiner(req.body);
    res.json({ ok: true, miner });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Creation failed" });
  }
}

export async function updateMiner(req, res) {
  try {
    const minerId = Number(req.params.id);
    const miner = await minersModel.updateMiner(minerId, req.body);
    res.json({ ok: true, miner });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Update failed" });
  }
}

export async function listPendingWithdrawals(_req, res) {
  try {
    const withdrawals = await walletModel.getPendingWithdrawals();
    res.json({ ok: true, withdrawals });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Load failed" });
  }
}

export async function approveWithdrawal(req, res) {
  try {
    const { withdrawalId } = req.params;
    await prisma.transaction.update({
      where: { id: Number(withdrawalId) },
      data: { status: 'approved', updatedAt: new Date() }
    });
    res.json({ ok: true, message: "Withdrawal approved" });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Approval failed" });
  }
}

export async function rejectWithdrawal(req, res) {
  try {
    const { withdrawalId } = req.params;
    await walletModel.updateTransactionStatus(Number(withdrawalId), "failed");
    res.json({ ok: true, message: "Withdrawal rejected" });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Rejection failed" });
  }
}

export async function completeWithdrawal(req, res) {
  try {
    const { withdrawalId } = req.params;
    const { txHash } = req.body;
    await walletModel.updateTransactionStatus(Number(withdrawalId), "completed", txHash);
    res.json({ ok: true, message: "Withdrawal marked as completed" });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Marking as completed failed" });
  }
}
