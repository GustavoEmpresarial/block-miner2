import { Prisma } from "@prisma/client";
import prisma from "../src/db/prisma.js";
import { isSmtpConfigured, sendPasswordResetEmail } from "../utils/mailer.js";
import { signPasswordResetToken, getPasswordResetExpiryHumanPt } from "../utils/passwordResetToken.js";
import loggerLib from "../utils/logger.js";
import { getValidatedDepositAddress } from "../utils/depositAddress.js";
import { fetchRecentWalletTxs } from "./walletController.js";
import {
  SUPPORT_WALLET_RECOVERY_MARKER,
  SUPPORT_PASSWORD_RESET_TICKET_MARKER
} from "../constants/supportTicketSubjects.js";

const logger = loggerLib.child("AdminSupport");

const ETH_ADDR_RE = /0x[a-fA-F0-9]{40}/g;
const ETH_TX_HASH_RE = /0x[a-fA-F0-9]{64}/g;

function normTxHash(h) {
  let s = String(h || "")
    .trim()
    .toLowerCase();
  if (!s) return "";
  if (/^[a-f0-9]{64}$/.test(s)) s = `0x${s}`;
  if (!/^0x[a-f0-9]{64}$/.test(s)) return "";
  return s;
}

function extractTxHashesFromText(text) {
  const s = String(text || "");
  const found = s.match(ETH_TX_HASH_RE);
  if (!found?.length) return [];
  const seen = new Set();
  const out = [];
  for (const x of found) {
    const low = x.toLowerCase();
    if (!seen.has(low)) {
      seen.add(low);
      out.push(low);
    }
  }
  return out;
}

function extractWalletAddressesFromText(text) {
  const s = String(text || "");
  const found = s.match(ETH_ADDR_RE);
  if (!found?.length) return [];
  const seen = new Set();
  const out = [];
  for (const a of found) {
    const low = a.toLowerCase();
    if (!seen.has(low)) {
      seen.add(low);
      out.push(low);
    }
  }
  return out;
}

async function resolveUserFromTicket(ticket) {
  if (ticket.userId) {
    const u = await prisma.user.findUnique({
      where: { id: ticket.userId },
      select: { id: true, email: true, name: true }
    });
    if (u) return u;
  }
  const ident = String(ticket.email || "").trim();
  if (!ident) return null;
  return prisma.user.findFirst({
    where: {
      OR: [
        { email: { equals: ident, mode: "insensitive" } },
        { username: { equals: ident, mode: "insensitive" } },
        { name: { equals: ident, mode: "insensitive" } }
      ]
    },
    select: { id: true, email: true, name: true }
  });
}

/**
 * Admin: List all support messages.
 */
export const listMessages = async (req, res) => {
  try {
    const messages = await prisma.supportMessage.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            username: true,
            email: true,
          }
        }
      }
    });

    res.json({ ok: true, messages });
  } catch (error) {
    console.error("[AdminSupportController] Error listing messages:", error);
    res.status(500).json({ ok: false, message: "Error listing messages" });
  }
};

/**
 * Admin: Get specific message details.
 */
export const getMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const message = await prisma.supportMessage.findUnique({
      where: { id: parseInt(id) },
      include: {
        user: {
          select: {
            username: true,
            email: true,
          }
        },
        replies: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!message) {
      return res.status(404).json({ ok: false, message: "Message not found" });
    }

    // Mark as read if it wasn't
    if (!message.isRead) {
      await prisma.supportMessage.update({
        where: { id: parseInt(id) },
        data: { isRead: true }
      });
    }

    res.json({ ok: true, message });
  } catch (error) {
    console.error("[AdminSupportController] Error getting message:", error);
    res.status(500).json({ ok: false, message: "Error getting message" });
  }
};

/**
 * Admin: Reply to a message.
 */
export const replyToMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { reply } = req.body;

    if (!reply) {
      return res.status(400).json({ ok: false, message: "Reply content is required" });
    }

    const message = await prisma.supportMessage.findUnique({
      where: { id: parseInt(id) }
    });

    if (!message) {
      return res.status(404).json({ ok: false, message: "Message not found" });
    }

    // Save as a new reply and update original message status
    const result = await prisma.$transaction([
      prisma.supportReply.create({
        data: {
          supportMessageId: parseInt(id),
          message: reply,
          isAdmin: true
        }
      }),
      prisma.supportMessage.update({
        where: { id: parseInt(id) },
        data: {
          isReplied: true,
          repliedAt: new Date()
        }
      })
    ]);

    res.json({ ok: true, message: "Reply saved successfully", reply: result[0] });

  } catch (error) {
    console.error("[AdminSupportController] Error replying to message:", error);
    res.status(500).json({ ok: false, message: "Error sending reply" });
  }
};

/**
 * Admin: gera token de redefinição e envia o link por e-mail (SMTP/Gmail) para o e-mail cadastrado na conta.
 */
export const sendPasswordResetLink = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, message: "ID inválido." });
    }

    const ticket = await prisma.supportMessage.findUnique({ where: { id } });
    if (!ticket) {
      return res.status(404).json({ ok: false, message: "Ticket não encontrado." });
    }

    if (!String(ticket.subject || "").includes(SUPPORT_PASSWORD_RESET_TICKET_MARKER)) {
      return res.status(400).json({
        ok: false,
        message: "Só é possível liberar recuperação em tickets com assunto [Senha]."
      });
    }

    if (!isSmtpConfigured()) {
      return res.status(503).json({
        ok: false,
        message: "SMTP não configurado. Defina SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS e SMTP_FROM (ex.: Gmail com senha de app)."
      });
    }

    const user = await resolveUserFromTicket(ticket);
    if (!user) {
      return res.status(404).json({
        ok: false,
        message: "Nenhuma conta encontrada para os dados deste ticket. Confira o e-mail ou vincule o usuário correto."
      });
    }

    const resetToken = signPasswordResetToken(user.id);
    const APP_URL = process.env.APP_URL || "https://blockminer.space";
    const resetUrl = `${APP_URL.replace(/\/$/, "")}/forgot-password?token=${encodeURIComponent(resetToken)}`;
    await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetUrl
    });

    await prisma.$transaction([
      prisma.supportReply.create({
        data: {
          supportMessageId: id,
          message: `Enviamos um novo link de redefinição de senha para o e-mail cadastrado na sua conta. O link é válido por ${getPasswordResetExpiryHumanPt()}. Verifique também a caixa de spam.`,
          isAdmin: true
        }
      }),
      prisma.supportMessage.update({
        where: { id },
        data: { isReplied: true, repliedAt: new Date(), isRead: true }
      })
    ]);

    logger.info("Admin sent password reset link from support ticket", { ticketId: id, userId: user.id });
    res.json({ ok: true, message: "Link enviado para o e-mail da conta." });
  } catch (error) {
    logger.error("sendPasswordResetLink failed", { error: error.message });
    res.status(500).json({ ok: false, message: error.message || "Erro ao enviar o link." });
  }
};

/**
 * Admin: histórico de chamados [Senha] e envios de link pela equipe (para o mesmo e-mail/conta).
 */
export const getPasswordRecoveryContext = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, message: "ID inválido." });
    }

    const ticket = await prisma.supportMessage.findUnique({ where: { id } });
    if (!ticket) {
      return res.status(404).json({ ok: false, message: "Ticket não encontrado." });
    }

    if (!String(ticket.subject || "").includes(SUPPORT_PASSWORD_RESET_TICKET_MARKER)) {
      return res.status(400).json({
        ok: false,
        message: "Este protocolo não é de recuperação de senha ([Senha])."
      });
    }

    const user = await resolveUserFromTicket(ticket);
    const emailTrim = String(ticket.email || "").trim();

    const orMatch = [{ email: { equals: emailTrim, mode: "insensitive" } }];
    if (user?.id) {
      orMatch.push({ userId: user.id });
    }

    const senhaTickets = await prisma.supportMessage.findMany({
      where: {
        AND: [
          { subject: { contains: SUPPORT_PASSWORD_RESET_TICKET_MARKER, mode: "insensitive" } },
          { OR: orMatch }
        ]
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        isReplied: true,
        isRead: true,
        email: true,
        userId: true,
        subject: true
      }
    });

    const ticketIds = senhaTickets.map((t) => t.id);
    let adminResetReplies = [];
    if (ticketIds.length) {
      adminResetReplies = await prisma.supportReply.findMany({
        where: {
          supportMessageId: { in: ticketIds },
          isAdmin: true,
          OR: [
            { message: { contains: "link de redefinição", mode: "insensitive" } },
            { message: { contains: "redefinição de senha", mode: "insensitive" } },
            { message: { contains: "password reset", mode: "insensitive" } }
          ]
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true, supportMessageId: true },
        take: 40
      });
    }

    let supportAutoProvisionAt = null;
    if (user?.id) {
      const provisionLog = await prisma.auditLog.findFirst({
        where: {
          userId: user.id,
          action: "support_auto_provision",
          detailsJson: { contains: "password_reset_ticket", mode: "insensitive" }
        },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true }
      });
      supportAutoProvisionAt = provisionLog?.createdAt ?? null;
    }

    const priorSenhaCountExcludingCurrent = senhaTickets.filter((t) => t.id !== id).length;
    const linkedUser = user
      ? { id: user.id, email: user.email, name: user.name }
      : null;

    res.json({
      ok: true,
      context: {
        smtpConfigured: isSmtpConfigured(),
        linkedUser,
        ticketEmail: emailTrim,
        senhaTicketTotal: senhaTickets.length,
        hadPriorSenhaTickets: priorSenhaCountExcludingCurrent > 0,
        priorSenhaCountExcludingCurrent,
        senhaTickets: senhaTickets.map((t) => ({
          id: t.id,
          createdAt: t.createdAt,
          isReplied: t.isReplied,
          isRead: t.isRead,
          isCurrent: t.id === id,
          subject: t.subject
        })),
        adminResetLinkSendsCount: adminResetReplies.length,
        adminResetLinkSendsRecent: adminResetReplies.slice(0, 8).map((r) => ({
          id: r.id,
          createdAt: r.createdAt,
          supportMessageId: r.supportMessageId
        })),
        accountCreatedBySupportTicket: Boolean(supportAutoProvisionAt),
        supportAutoProvisionAt
      }
    });
  } catch (error) {
    logger.error("getPasswordRecoveryContext failed", { error: error.message });
    res.status(500).json({ ok: false, message: error.message || "Erro ao carregar contexto." });
  }
};

/**
 * Admin: análise aprofundada para tickets [Saldo/POL] — depósitos, saques, órfãos, amostra on-chain.
 */
export const getWalletRecoveryForensics = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, message: "ID inválido." });
    }

    const ticket = await prisma.supportMessage.findUnique({ where: { id } });
    if (!ticket) {
      return res.status(404).json({ ok: false, message: "Ticket não encontrado." });
    }

    if (!String(ticket.subject || "").includes(SUPPORT_WALLET_RECOVERY_MARKER)) {
      return res.status(400).json({
        ok: false,
        message: "Este protocolo não é de análise de saldo/carteira."
      });
    }

    const ticketWallets = extractWalletAddressesFromText(`${ticket.message}\n${ticket.subject}`);
    const userRow = await resolveUserFromTicket(ticket);
    const depositCfg = getValidatedDepositAddress();
    const gameDeposit = String(depositCfg.address || "").trim().toLowerCase() || null;

    let linkedUser = null;
    let deposits = [];
    let withdrawals = [];

    if (userRow) {
      const full = await prisma.user.findUnique({
        where: { id: userRow.id },
        select: {
          id: true,
          email: true,
          username: true,
          walletAddress: true,
          polBalance: true
        }
      });
      if (full) {
        linkedUser = {
          id: full.id,
          email: full.email,
          username: full.username,
          walletAddress: full.walletAddress,
          polBalance: Number(full.polBalance || 0)
        };
      }

      const txs = await prisma.transaction.findMany({
        where: { userId: userRow.id },
        orderBy: { createdAt: "desc" },
        take: 80,
        select: {
          id: true,
          type: true,
          amount: true,
          status: true,
          txHash: true,
          address: true,
          fromAddress: true,
          createdAt: true,
          completedAt: true
        }
      });

      for (const t of txs) {
        const row = {
          id: t.id,
          type: t.type,
          amount: Number(t.amount),
          status: t.status,
          txHash: t.txHash,
          address: t.address,
          fromAddress: t.fromAddress,
          createdAt: t.createdAt,
          completedAt: t.completedAt
        };
        if (t.type === "deposit") {
          deposits.push(row);
        } else if (t.type === "withdrawal") {
          withdrawals.push(row);
        }
      }
    }

    const summarize = (rows) => {
      const byStatus = {};
      let completedSum = 0;
      let pendingSum = 0;
      for (const r of rows) {
        byStatus[r.status] = (byStatus[r.status] || 0) + 1;
        if (r.status === "completed") completedSum += r.amount;
        if (r.status === "pending") pendingSum += r.amount;
      }
      return { count: rows.length, byStatus, completedSum, pendingSum };
    };

    const depositSummary = summarize(deposits);
    const withdrawalSummary = summarize(withdrawals);

    const linkedLower = String(linkedUser?.walletAddress || "").trim().toLowerCase();
    const ticketFirst = ticketWallets[0] || null;
    const scanWallet = linkedLower || ticketFirst;

    const depositHashMap = new Map();
    for (const d of deposits) {
      const k = normTxHash(d.txHash);
      if (k) depositHashMap.set(k, d);
    }

    const days = Math.min(Math.max(Number(req.query?.days) || 365, 1), 730);
    const minTs = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;

    const scanWallets = [...new Set([linkedLower, ...ticketWallets].filter(Boolean))].slice(0, 8);

    const mergedTxByHash = new Map();
    const chainFetchErrors = [];
    for (const w of scanWallets) {
      try {
        const raw = await fetchRecentWalletTxs(w);
        for (const tx of raw) {
          const h = String(tx.hash || "").toLowerCase();
          if (!h) continue;
          if (!mergedTxByHash.has(h)) {
            mergedTxByHash.set(h, { ...tx, scannedFromWallets: [w] });
          } else {
            const ex = mergedTxByHash.get(h);
            if (!ex.scannedFromWallets.includes(w)) ex.scannedFromWallets.push(w);
          }
        }
      } catch (e) {
        chainFetchErrors.push({ wallet: w, error: String(e?.message || e) });
        logger.warn("wallet-forensics chain fetch failed for wallet", { ticketId: id, wallet: w, error: String(e?.message || e) });
      }
    }

    let chainError = null;
    if (scanWallets.length > 0 && mergedTxByHash.size === 0 && chainFetchErrors.length >= scanWallets.length) {
      chainError = chainFetchErrors[0]?.error || "Explorer indisponível.";
    }

    const allMerged = [...mergedTxByHash.values()];
    const onChainDepositsToGame = [];
    for (const tx of allMerged) {
      const ts = Number(tx.timeStamp || 0);
      if (ts < minTs) continue;
      if (String(tx.isError || "0") === "1") continue;
      const from = String(tx.from || "").toLowerCase();
      const to = String(tx.to || "").toLowerCase();
      if (!gameDeposit || to !== gameDeposit) continue;
      if (!scanWallets.includes(from)) continue;
      const valuePol = Number(tx.value || 0) / 1e18;
      if (!Number.isFinite(valuePol) || valuePol <= 0) continue;
      const hNorm = normTxHash(tx.hash);
      const led = hNorm ? depositHashMap.get(hNorm) : null;
      onChainDepositsToGame.push({
        hash: tx.hash,
        from,
        to,
        valuePol,
        timeStamp: ts,
        dateIso: new Date(ts * 1000).toISOString(),
        scannedFromWallets: tx.scannedFromWallets || [],
        inLedger: Boolean(led),
        ledgerId: led?.id ?? null,
        ledgerStatus: led?.status ?? null,
        ledgerAmount: led != null ? led.amount : null
      });
    }
    onChainDepositsToGame.sort((a, b) => b.timeStamp - a.timeStamp);

    const ticketHashesRaw = extractTxHashesFromText(`${ticket.message}\n${ticket.subject}`);
    const ticketHashesAnalysis = ticketHashesRaw.map((th) => {
      const k = normTxHash(th);
      const led = k ? depositHashMap.get(k) : null;
      return {
        hash: th,
        inLedger: Boolean(led),
        ledgerId: led?.id ?? null,
        ledgerStatus: led?.status ?? null,
        ledgerAmount: led != null ? led.amount : null
      };
    });

    const chainSample = allMerged
      .filter((tx) => {
        const ts = Number(tx.timeStamp || 0);
        if (ts < minTs) return false;
        if (String(tx.isError || "0") === "1") return false;
        const to = String(tx.to || "").toLowerCase();
        const from = String(tx.from || "").toLowerCase();
        if (gameDeposit && from && scanWallets.includes(from) && to === gameDeposit) return false;
        return scanWallets.includes(from) || scanWallets.includes(to);
      })
      .slice(0, 35)
      .map((tx) => {
        const valuePol = Number(tx.value || 0) / 1e18;
        const to = String(tx.to || "").toLowerCase();
        const from = String(tx.from || "").toLowerCase();
        let tag = "other";
        if (gameDeposit && scanWallets.includes(from) && to === gameDeposit) tag = "out_to_game";
        else if (gameDeposit && scanWallets.includes(to) && from === gameDeposit) tag = "in_from_game";
        return {
          hash: tx.hash,
          from,
          to,
          valuePol,
          timeStamp: Number(tx.timeStamp || 0),
          tag
        };
      });

    /** Fila manual opcional (não é o modelo Prisma `Transaction` / depósitos normais). */
    const orphanByWallet = new Map();
    let orphansError = null;
    let orphanDepositsAuxTablePresent = true;
    for (const w of scanWallets) {
      try {
        const rows = await prisma.$queryRaw(
          Prisma.sql`SELECT wallet_address, amount::float AS amount FROM public.orphan_deposits WHERE LOWER(wallet_address) = ${w}`
        );
        for (const r of rows || []) {
          const key = String(r.wallet_address || "").toLowerCase();
          if (key) orphanByWallet.set(key, { wallet_address: r.wallet_address, amount: r.amount });
        }
      } catch (e) {
        const raw = String(e?.message || e);
        if (/42P01|does not exist/i.test(raw) && /orphan_deposits/i.test(raw)) {
          orphanDepositsAuxTablePresent = false;
          orphansError = null;
        } else {
          orphansError = raw;
        }
        break;
      }
    }
    const orphans = [...orphanByWallet.values()];

    res.json({
      ok: true,
      forensics: {
        ticketWallets,
        gameDepositAddress: gameDeposit,
        depositEnvReason: depositCfg.reason || null,
        linkedUser,
        walletComparison: {
          linkedWallet: linkedLower || null,
          firstWalletInTicket: ticketFirst,
          sameAsTicket: linkedLower && ticketFirst ? linkedLower === ticketFirst : null,
          scanWallet: scanWallet || null,
          scanWallets,
          chainDays: days
        },
        ledger: {
          deposits,
          withdrawals,
          depositSummary,
          withdrawalSummary
        },
        onChainDepositsToGame,
        ticketHashesAnalysis,
        chainFetchErrors,
        orphans: Array.isArray(orphans) ? orphans : [],
        orphansError,
        orphanDepositsAuxTablePresent,
        chainSample,
        chainError,
        polygonscanBase: "https://polygonscan.com/tx/"
      }
    });
  } catch (error) {
    logger.error("getWalletRecoveryForensics failed", { error: error.message });
    res.status(500).json({ ok: false, message: error.message || "Erro na análise." });
  }
};
