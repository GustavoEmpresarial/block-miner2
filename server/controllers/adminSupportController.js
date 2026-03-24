import { Prisma } from "@prisma/client";
import prisma from "../src/db/prisma.js";
import { isSmtpConfigured, sendPasswordResetEmail } from "../utils/mailer.js";
import { signPasswordResetToken, getPasswordResetExpiryHumanPt } from "../utils/passwordResetToken.js";
import loggerLib from "../utils/logger.js";
import { getValidatedDepositAddress } from "../utils/depositAddress.js";
import { fetchRecentWalletTxs } from "./walletController.js";
import { SUPPORT_WALLET_RECOVERY_MARKER } from "../constants/supportTicketSubjects.js";

const logger = loggerLib.child("AdminSupport");

const ETH_ADDR_RE = /0x[a-fA-F0-9]{40}/g;

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
    let chainSample = [];
    let chainError = null;

    if (scanWallet) {
      try {
        const raw = await fetchRecentWalletTxs(scanWallet);
        const minTs = Math.floor(Date.now() / 1000) - 90 * 24 * 60 * 60;
        chainSample = raw
          .filter((tx) => Number(tx.timeStamp || 0) >= minTs)
          .slice(0, 40)
          .map((tx) => {
            const valuePol = Number(tx.value || 0) / 1e18;
            const to = String(tx.to || "").toLowerCase();
            const from = String(tx.from || "").toLowerCase();
            let tag = "other";
            if (gameDeposit && from === scanWallet && to === gameDeposit) tag = "out_to_game";
            else if (gameDeposit && to === scanWallet && from === gameDeposit) tag = "in_from_game";
            return {
              hash: tx.hash,
              from,
              to,
              valuePol,
              timeStamp: Number(tx.timeStamp || 0),
              tag
            };
          });
      } catch (e) {
        chainError = String(e?.message || e);
        logger.warn("wallet-forensics chain fetch failed", { ticketId: id, error: chainError });
      }
    }

    let orphans = [];
    let orphansError = null;
    if (scanWallet) {
      try {
        orphans = await prisma.$queryRaw(
          Prisma.sql`SELECT wallet_address, amount::float AS amount FROM public.orphan_deposits WHERE LOWER(wallet_address) = ${scanWallet}`
        );
      } catch (e) {
        orphansError = String(e?.message || e);
        orphans = [];
      }
    }

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
          scanWallet: scanWallet || null
        },
        ledger: {
          deposits,
          withdrawals,
          depositSummary,
          withdrawalSummary
        },
        orphans: Array.isArray(orphans) ? orphans : [],
        orphansError,
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
