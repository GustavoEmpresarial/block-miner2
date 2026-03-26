import fs from "fs/promises";
import path from "path";
import os from "os";
import { promisify } from "util";
import { execFile } from "child_process";
import { fileURLToPath } from "url";
import { isHexString } from "ethers";
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

/** Accepts "0,75" / "1.234,56" (PT) e notação normal (0.75, 5e-8). */
function parseAdminNumber(value) {
  if (value === null || value === undefined) return NaN;
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  let s = String(value).trim().replace(/\s/g, "");
  if (!s) return NaN;
  if (s.includes(",") && !s.includes(".")) return Number(s.replace(",", "."));
  if (s.includes(",") && s.includes(".")) return Number(s.replace(/\./g, "").replace(",", "."));
  return Number(s);
}

/** Normalize admin JSON (camelCase or legacy snake_case) into a miner patch */
function minerPatchFromBody(body) {
  if (!body || typeof body !== "object") return {};
  const b = body;
  const patch = {};
  if (b.name !== undefined) patch.name = String(b.name);
  if (b.slug !== undefined) patch.slug = String(b.slug);
  const bh = b.baseHashRate ?? b.base_hash_rate;
  if (bh !== undefined) patch.baseHashRate = parseAdminNumber(bh);
  if (b.price !== undefined) patch.price = parseAdminNumber(b.price);
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

/**
 * GET /api/admin/users/:id/details
 * Perfil + métricas + transações (painel admin: crédito POL, ban, etc.).
 */
export async function getAdminUserDetails(req, res) {
  try {
    const userId = Number(req.params?.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ ok: false, message: "ID de utilizador inválido." });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        walletAddress: true,
        polBalance: true,
        isBanned: true,
        createdAt: true
      }
    });
    if (!user) {
      return res.status(404).json({ ok: false, message: "Utilizador não encontrado." });
    }

    const [
      totalHs,
      activeMachines,
      faucet,
      shortlink,
      autoGpuClaims,
      youtubeWatchClaims,
      recentTransactions
    ] = await Promise.all([
      syncUserBaseHashRate(userId).catch(() => 0),
      prisma.userMiner.count({ where: { userId, isActive: true } }),
      prisma.faucetClaim.findUnique({ where: { userId } }),
      prisma.shortlinkCompletion.findUnique({ where: { userId } }),
      prisma.autoMiningGpuLog.count({ where: { userId, action: "claim" } }).catch(() =>
        prisma.autoMiningGpuLog.count({ where: { userId } }).catch(() => 0)
      ),
      prisma.youtubeWatchHistory.count({ where: { userId } }).catch(() => 0),
      prisma.transaction.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 25,
        select: {
          id: true,
          type: true,
          amount: true,
          status: true,
          createdAt: true
        }
      })
    ]);

    res.json({
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        walletAddress: user.walletAddress,
        polBalance: Number(user.polBalance),
        baseHashRate: Number(totalHs) || 0,
        isBanned: user.isBanned
      },
      metrics: {
        faucetClaims: faucet?.totalClaims ?? 0,
        shortlinkDailyRuns: shortlink?.dailyRuns ?? 0,
        autoGpuClaims,
        youtubeWatchClaims,
        activeMachines
      },
      recentTransactions: recentTransactions.map((tx) => ({
        id: tx.id,
        type: tx.type,
        amount: Number(tx.amount),
        status: tx.status,
        createdAt: tx.createdAt
      }))
    });
  } catch (error) {
    logger.error("getAdminUserDetails", { error: error?.message, userId: req.params?.id });
    res.status(500).json({ ok: false, message: "Não foi possível carregar o perfil." });
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
    const hint = error?.message ? String(error.message).slice(0, 240) : "";
    res.status(500).json({
      ok: false,
      message: hint ? `Propagation failed: ${hint}` : "Propagation failed"
    });
  }
}

/**
 * Adiciona N unidades da mineradora ao inventário de todos os usuários (ou subset com filtros).
 * Body: { minerId, quantity?: 1, skipBanned?: true, skipIfHasMiner?: false }
 */
export async function grantMinerInventoryToAllUsers(req, res) {
  try {
    const minerId = Number(req.body?.minerId ?? req.body?.miner_id);
    if (!Number.isInteger(minerId) || minerId <= 0) {
      return res.status(400).json({ ok: false, message: "Envie minerId (número) da mineradora do catálogo." });
    }

    const skipBanned = req.body?.skipBanned !== false && req.body?.skip_banned !== false;
    const skipIfHasMiner = Boolean(req.body?.skipIfHasMiner || req.body?.skip_if_has_miner);

    const quantity = Number(req.body?.quantity ?? req.body?.count ?? req.body?.units ?? 1);
    const MAX_QUANTITY = 100;
    if (!Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ ok: false, message: "Envie quantity (inteiro >= 1)." });
    }
    if (quantity > MAX_QUANTITY) {
      return res.status(400).json({ ok: false, message: `quantity muito alta. Limite: ${MAX_QUANTITY}.` });
    }

    const miner = await prisma.miner.findUnique({ where: { id: minerId } });
    if (!miner) {
      return res.status(404).json({ ok: false, message: "Mineradora não encontrada." });
    }

    const userWhere = skipBanned ? { isBanned: false } : {};
    const users = await prisma.user.findMany({
      where: userWhere,
      select: { id: true }
    });

    // IMPORTANT:
    // This endpoint grants "quantity" NEW units per eligible user.
    // It must NOT calculate "remaining to reach quantity" based on what's already in inventory.
    // So every eligible user receives exactly `quantity` rows.
    let skippedAlreadyHad = 0;
    let eligibleUsers = users.length;

    const now = new Date();
    const hashRate = Number(miner.baseHashRate || 0);
    const slotSize = Math.max(1, Number(miner.slotSize || 1));
    const imageUrl = miner.imageUrl || DEFAULT_MINER_IMAGE_URL;
    const userIds = users.map((u) => u.id);

    // Robust insert: single SQL statement (avoids FK race/loop issues with createMany).
    // Inserts `quantity` copies per eligible user using generate_series().
    if (!userIds.length) {
      return res.json({
        ok: true,
        granted: 0,
        miner: { id: miner.id, name: miner.name, slug: miner.slug },
        eligibleUsers: 0,
        skippedAlreadyHad: 0
      });
    }

    const sql = `
      INSERT INTO user_inventory
        (user_id, miner_id, miner_name, level, hash_rate, slot_size, image_url, acquired_at, updated_at)
      SELECT
        v.user_id,
        $1::int,
        $2::text,
        1::int,
        $3::double precision,
        $4::int,
        $5::text,
        now(),
        now()
      FROM unnest($6::int[]) AS v(user_id)
      JOIN users u
        ON u.id = v.user_id
       ${skipBanned ? "AND u.is_banned = false" : ""}
      CROSS JOIN generate_series(1, $7::int) g
    `;

    let inserted = 0;
    let skippedInvalidUserIds = 0;
    try {
      const changes = await prisma.$executeRawUnsafe(
        sql,
        miner.id,
        String(miner.name),
        hashRate,
        slotSize,
        imageUrl,
        userIds,
        quantity
      );
      inserted = Number(changes) || 0;
    } catch (error) {
      // If some user_ids are "ghosts" (FK fails), still grant to the users that exist.
      const msg = String(error?.message || "");
      const isFkUserInventory = error?.code === "23503" || msg.includes("user_inventory_user_id_fkey");
      if (!isFkUserInventory) throw error;

      logger.warn("grantMinerInventoryToAllUsers | bulk insert FK failed, fallback per-user", {
        minerId: miner.id,
        quantity,
        skippedInvalidUserIds: 0,
        eligibleUsers: userIds.length,
        fkMessage: msg.slice(0, 220)
      });

      const singleSql = `
        INSERT INTO public.user_inventory
          (user_id, miner_id, miner_name, level, hash_rate, slot_size, image_url, acquired_at, updated_at)
        SELECT
          $1::int,
          $2::int,
          $3::text,
          1::int,
          $4::double precision,
          $5::int,
          $6::text,
          now(),
          now()
        FROM generate_series(1, $7::int) g
      `;

      for (const userId of userIds) {
        try {
          const changes = await prisma.$executeRawUnsafe(
            singleSql,
            userId,
            miner.id,
            String(miner.name),
            hashRate,
            slotSize,
            imageUrl,
            quantity
          );
          inserted += Number(changes) || 0;
        } catch (e) {
          skippedInvalidUserIds += 1;
        }
      }
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
            quantity,
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
      quantity,
      skipBanned,
      skipIfHasMiner,
      skippedAlreadyHad,
      eligibleUsers,
      skippedInvalidUserIds
    });

    res.json({
      ok: true,
      granted: inserted,
      miner: { id: miner.id, name: miner.name, slug: miner.slug },
      eligibleUsers,
      skippedAlreadyHad,
      skippedInvalidUserIds
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
    const id = Number(withdrawalId);
    const row = await prisma.transaction.findUnique({ where: { id } });
    if (!row || row.type !== "withdrawal") {
      return res.status(404).json({ ok: false, message: "Saque não encontrado." });
    }
    if (row.status !== "pending") {
      return res.status(400).json({ ok: false, message: "Só é possível aprovar saques pendentes." });
    }
    await prisma.transaction.update({
      where: { id },
      data: { status: "approved", updatedAt: new Date() }
    });
    res.json({ ok: true, message: "Withdrawal approved" });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Approval failed" });
  }
}

export async function rejectWithdrawal(req, res) {
  try {
    const { withdrawalId } = req.params;
    const id = Number(withdrawalId);
    const row = await prisma.transaction.findUnique({ where: { id } });
    if (!row || row.type !== "withdrawal") {
      return res.status(404).json({ ok: false, message: "Saque não encontrado." });
    }
    if (!["pending", "approved"].includes(row.status)) {
      return res.status(400).json({ ok: false, message: "Este saque não pode ser rejeitado." });
    }
    await walletModel.updateTransactionStatus(id, "failed");
    res.json({ ok: true, message: "Withdrawal rejected" });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Rejection failed" });
  }
}

function normalizeTxHash(raw) {
  let h = String(raw || "").trim();
  if (!h) return "";
  if (!h.startsWith("0x") && /^[a-fA-F0-9]{64}$/.test(h)) {
    h = `0x${h}`;
  }
  const lower = h.toLowerCase();
  if (!isHexString(lower, 32)) {
    throw new Error("Hash inválido: use o tx hash da Polygon (0x + 64 hex).");
  }
  return lower;
}

export async function completeWithdrawal(req, res) {
  try {
    const { withdrawalId } = req.params;
    const id = Number(withdrawalId);
    const { txHash } = req.body || {};
    let normalized;
    try {
      normalized = normalizeTxHash(txHash);
    } catch (e) {
      return res.status(400).json({ ok: false, message: e.message });
    }
    if (!normalized) {
      return res.status(400).json({ ok: false, message: "Informe o hash da transação on-chain." });
    }
    const row = await prisma.transaction.findUnique({ where: { id } });
    if (!row || row.type !== "withdrawal") {
      return res.status(404).json({ ok: false, message: "Saque não encontrado." });
    }
    if (row.status !== "approved") {
      return res.status(400).json({ ok: false, message: "Só é possível concluir saques já aprovados." });
    }
    await walletModel.updateTransactionStatus(id, "completed", normalized);
    res.json({ ok: true, message: "Withdrawal marked as completed" });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Marking as completed failed" });
  }
}

/**
 * POST /api/admin/users/:id/credit-pol
 * Credita POL na conta (ledger + saldo), sem ticket de suporte. Audit + notificação ao jogador.
 */
export async function creditUserPolManual(req, res) {
  try {
    const userId = parseInt(req.params.id, 10);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ ok: false, message: "ID de utilizador inválido." });
    }

    const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!u) {
      return res.status(404).json({ ok: false, message: "Utilizador não encontrado." });
    }

    const { amountPol, amount, adminNote, txHash, replenishIfDepositExistsForUser } = req.body || {};
    const amt = Number(amountPol ?? amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ ok: false, message: "Indique amountPol (número > 0)." });
    }

    let txOpt;
    if (txHash != null && String(txHash).trim() !== "") {
      try {
        txOpt = normalizeTxHash(txHash);
      } catch (e) {
        return res.status(400).json({ ok: false, message: e.message });
      }
    }

    const ip = req.headers["x-real-ip"] || req.socket?.remoteAddress || req.ip;
    const result = await walletModel.creditPolManualToUser({
      userId,
      amountPol: amt,
      adminNote: String(adminNote || "").trim() || undefined,
      reqIp: ip,
      txHashOptional: txOpt || undefined,
      replenishIfDepositExistsForUser: Boolean(replenishIfDepositExistsForUser)
    });

    logger.info("Admin manual POL credit", { userId, amountPol: amt, mode: result.mode });
    res.json({
      ok: true,
      message: "POL creditado na conta.",
      ...result
    });
  } catch (error) {
    logger.error("creditUserPolManual failed", { error: error.message });
    res.status(400).json({ ok: false, message: error.message || "Não foi possível creditar." });
  }
}
