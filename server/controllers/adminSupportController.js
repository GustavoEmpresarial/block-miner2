import prisma from "../src/db/prisma.js";
import { isSmtpConfigured, sendPasswordResetEmail } from "../utils/mailer.js";
import { signPasswordResetToken, getPasswordResetExpiryHumanPt } from "../utils/passwordResetToken.js";
import loggerLib from "../utils/logger.js";

const logger = loggerLib.child("AdminSupport");

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
