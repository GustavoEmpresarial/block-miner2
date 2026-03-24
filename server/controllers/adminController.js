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
import { syncUserBaseHashRate } from "../models/minerProfileModel.js";
import { getMiningEngine } from "../src/miningEngineInstance.js";
import loggerLib from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = loggerLib.child("AdminController");
const execFileAsync = promisify(execFile);

const DEFAULT_MINER_IMAGE_URL = "/assets/machines/reward1.png";

/** Normalize admin JSON (camelCase or legacy snake_case) into a miner patch */
function minerPatchFromBody(body) {
  if (!body || typeof body !== "object") return {};
  const b = body;
  const patch = {};
  if (b.name !== undefined) patch.name = String(b.name);
  if (b.slug !== undefined) patch.slug = String(b.slug);
  const bh = b.baseHashRate ?? b.base_hash_rate;
  if (bh !== undefined) patch.baseHashRate = Number(bh);
  if (b.price !== undefined) patch.price = Number(b.price);
  const ss = b.slotSize ?? b.slot_size;
  if (ss !== undefined) patch.slotSize = Number(ss);
  const iu = b.imageUrl ?? b.image_url;
  if (iu !== undefined) patch.imageUrl = iu;
  const ia = b.isActive ?? b.is_active;
  if (ia !== undefined) patch.isActive = Boolean(ia);
  const sis = b.showInShop ?? b.show_in_shop;
  if (sis !== undefined) patch.showInShop = Boolean(sis);
  return patch;
}

async function reloadMiningForMinerUsers(minerId) {
  const [rack, inv] = await Promise.all([
    prisma.userMiner.findMany({ where: { minerId }, select: { userId: true } }),
    prisma.userInventory.findMany({ where: { minerId }, select: { userId: true } })
  ]);
  const ids = new Set([...rack, ...inv].map((r) => r.userId));
  const engine = getMiningEngine();
  for (const userId of ids) {
    try {
      await syncUserBaseHashRate(userId);
      if (engine?.reloadMinerProfile) await engine.reloadMinerProfile(userId);
    } catch (e) {
      logger.warn("reloadMiningForMinerUsers skip", { userId, error: e?.message });
    }
  }
}

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
    const p = minerPatchFromBody(req.body);
    if (!p.name || !p.slug || p.baseHashRate === undefined) {
      return res.status(400).json({ ok: false, message: "Nome, slug e baseHashRate (H/s) são obrigatórios." });
    }
    if (!Number.isFinite(p.baseHashRate) || p.baseHashRate < 0) {
      return res.status(400).json({ ok: false, message: "baseHashRate inválido: envie hashrate em H/s (ex.: GH/s × 10⁹)." });
    }
    const miner = await minersModel.createMiner({
      name: p.name,
      slug: p.slug,
      baseHashRate: p.baseHashRate,
      price: Number.isFinite(p.price) ? p.price : 0,
      slotSize: Number.isFinite(p.slotSize) && p.slotSize > 0 ? p.slotSize : 1,
      imageUrl: p.imageUrl ?? null,
      isActive: p.isActive !== false,
      showInShop: p.showInShop !== false
    });
    res.json({ ok: true, miner });
  } catch (error) {
    if (error?.code === "P2002") {
      return res.status(409).json({ ok: false, message: "Slug já em uso." });
    }
    logger.error("Admin createMiner", { error: error?.message });
    res.status(500).json({ ok: false, message: "Creation failed" });
  }
}

export async function updateMiner(req, res) {
  try {
    const minerId = Number(req.params.id);
    if (!Number.isInteger(minerId) || minerId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid miner id." });
    }
    const patch = minerPatchFromBody(req.body);
    if (patch.baseHashRate !== undefined && (!Number.isFinite(patch.baseHashRate) || patch.baseHashRate < 0)) {
      return res.status(400).json({
        ok: false,
        message: "baseHashRate inválido: envie hashrate em H/s (no painel use GH/s; o front multiplica por 10⁹)."
      });
    }
    if (patch.price !== undefined && !Number.isFinite(patch.price)) {
      return res.status(400).json({ ok: false, message: "Preço inválido." });
    }
    if (patch.slotSize !== undefined && (!Number.isFinite(patch.slotSize) || patch.slotSize < 1 || patch.slotSize > 2)) {
      return res.status(400).json({ ok: false, message: "slotSize deve ser 1 ou 2." });
    }
    const { miner, propagation } = await minersModel.updateMiner(minerId, patch);
    await reloadMiningForMinerUsers(minerId);
    res.json({ ok: true, miner, propagation });
  } catch (error) {
    if (error?.code === "NOT_FOUND") {
      return res.status(404).json({ ok: false, message: "Miner not found." });
    }
    if (error?.code === "P2002") {
      return res.status(409).json({ ok: false, message: "Slug already in use." });
    }
    logger.error("Admin updateMiner", { error: error?.message, code: error?.code });
    res.status(500).json({ ok: false, message: "Update failed" });
  }
}

/**
 * Push catalog fields (base×level hash, slots, name, image) to all user_miners, user_inventory, shortlink for this miner_id.
 * Does not modify the miners row — same effect as the propagation step after PUT, for repair / clarity.
 */
export async function propagateMinerCatalogToInstances(req, res) {
  try {
    const minerId = Number(req.params.id);
    if (!Number.isInteger(minerId) || minerId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid miner id." });
    }
    const { miner, propagation } = await minersModel.propagateCatalogMinerToAllInstances(minerId);
    await reloadMiningForMinerUsers(minerId);
    res.json({
      ok: true,
      miner: { id: miner.id, name: miner.name, slug: miner.slug },
      propagation
    });
  } catch (error) {
    if (error?.code === "NOT_FOUND") {
      return res.status(404).json({ ok: false, message: "Miner not found." });
    }
    logger.error("propagateMinerCatalogToInstances", { error: error?.message });
    res.status(500).json({ ok: false, message: "Propagation failed" });
  }
}

/**
 * Adiciona uma unidade da mineradora ao inventário de todos os usuários (ou subset com filtros).
 * Body: { minerId, skipBanned?: true, skipIfHasMiner?: false }
 */
export async function grantMinerInventoryToAllUsers(req, res) {
  try {
    const minerId = Number(req.body?.minerId ?? req.body?.miner_id);
    if (!Number.isInteger(minerId) || minerId <= 0) {
      return res.status(400).json({ ok: false, message: "Envie minerId (número) da mineradora do catálogo." });
    }

    const skipBanned = req.body?.skipBanned !== false && req.body?.skip_banned !== false;
    const skipIfHasMiner = Boolean(req.body?.skipIfHasMiner || req.body?.skip_if_has_miner);

    const miner = await prisma.miner.findUnique({ where: { id: minerId } });
    if (!miner) {
      return res.status(404).json({ ok: false, message: "Mineradora não encontrada." });
    }

    const userWhere = skipBanned ? { isBanned: false } : {};
    let users = await prisma.user.findMany({
      where: userWhere,
      select: { id: true }
    });

    let skippedAlreadyHad = 0;
    if (skipIfHasMiner) {
      const existing = await prisma.userInventory.findMany({
        where: { minerId },
        select: { userId: true },
        distinct: ["userId"]
      });
      const has = new Set(existing.map((e) => e.userId));
      const before = users.length;
      users = users.filter((u) => !has.has(u.id));
      skippedAlreadyHad = before - users.length;
    }

    const now = new Date();
    const hashRate = Number(miner.baseHashRate || 0);
    const slotSize = Math.max(1, Number(miner.slotSize || 1));
    const imageUrl = miner.imageUrl || DEFAULT_MINER_IMAGE_URL;

    const rows = users.map((u) => ({
      userId: u.id,
      minerId: miner.id,
      minerName: miner.name,
      level: 1,
      hashRate,
      slotSize,
      imageUrl,
      acquiredAt: now,
      updatedAt: now
    }));

    const CHUNK = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const r = await prisma.userInventory.createMany({ data: chunk });
      inserted += r.count;
    }

    try {
      await prisma.auditLog.create({
        data: {
          userId: null,
          action: "admin_grant_miner_inventory_all",
          ip: req.ip || null,
          userAgent: req.get?.("user-agent") || null,
          detailsJson: JSON.stringify({
            minerId: miner.id,
            minerName: miner.name,
            grantedCount: inserted,
            skipBanned,
            skipIfHasMiner,
            skippedAlreadyHad
          })
        }
      });
    } catch (e) {
      logger.warn("audit log grant all miners", { error: e?.message });
    }

    logger.info("grantMinerInventoryToAllUsers", {
      minerId,
      inserted,
      skipBanned,
      skipIfHasMiner,
      skippedAlreadyHad
    });

    res.json({
      ok: true,
      granted: inserted,
      miner: { id: miner.id, name: miner.name, slug: miner.slug },
      eligibleUsers: users.length,
      skippedAlreadyHad
    });
  } catch (error) {
    logger.error("grantMinerInventoryToAllUsers", { error: error?.message });
    res.status(500).json({ ok: false, message: "Falha ao distribuir máquinas." });
  }
}

export async function deleteMiner(req, res) {
  try {
    const minerId = Number(req.params.id);
    if (!Number.isInteger(minerId) || minerId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid miner id." });
    }
    await minersModel.deleteMiner(minerId);
    res.json({ ok: true, message: "Miner removed from catalog." });
  } catch (error) {
    if (error?.code === "MINER_IN_USE") {
      return res.status(409).json({
        ok: false,
        code: "MINER_IN_USE",
        message:
          "Não é possível excluir: ainda existem máquinas deste modelo com jogadores (rack ou inventário). Desative no catálogo ou remova as instâncias primeiro.",
        counts: error.counts
      });
    }
    logger.error("Admin deleteMiner", { error: error?.message });
    res.status(500).json({ ok: false, message: "Delete failed" });
  }
}

const UPLOAD_ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);

export async function uploadMinerImage(req, res) {
  try {
    const { fileBase64, fileName } = req.body || {};
    if (!fileBase64 || typeof fileName !== "string") {
      return res.status(400).json({ ok: false, message: "Envie fileBase64 e fileName." });
    }
    let buf;
    try {
      buf = Buffer.from(String(fileBase64), "base64");
    } catch {
      return res.status(400).json({ ok: false, message: "Base64 inválido." });
    }
    if (!buf.length || buf.length > 4 * 1024 * 1024) {
      return res.status(400).json({ ok: false, message: "Arquivo vazio ou maior que 4MB." });
    }

    const raw = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
    let ext = path.extname(raw).toLowerCase();
    if (!UPLOAD_ALLOWED_EXT.has(ext)) {
      ext = ".png";
    }
    const stem = path.basename(raw, path.extname(raw)).slice(0, 80) || "miner";
    const destName = `${Date.now()}_${stem}${ext}`;

    const uploadRoot = path.join(process.cwd(), "uploads");
    const dir = path.join(uploadRoot, "machines");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, destName), buf);

    const imageUrl = `/uploads/machines/${destName}`;
    return res.json({ ok: true, imageUrl });
  } catch (error) {
    logger.error("uploadMinerImage", { error: error?.message });
    return res.status(500).json({ ok: false, message: "Upload falhou." });
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
