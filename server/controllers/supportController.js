import bcrypt from "bcryptjs";
import crypto from "crypto";
import prisma from "../src/db/prisma.js";
import { isSmtpConfigured, sendPasswordResetEmail } from "../utils/mailer.js";
import { signPasswordResetToken } from "../utils/passwordResetToken.js";
import { SUPPORT_PASSWORD_RESET_TICKET_MARKER } from "../constants/supportTicketSubjects.js";
const WELCOME_MINER_SLUG = "welcome-10ghs";
const WELCOME_MINER_NAME = "Welcome Miner";
const WELCOME_MINER_HASH_RATE = 10_000_000_000;
const WELCOME_MINER_SLOT_SIZE = 1;
const WELCOME_MINER_IMAGE_URL = "/machines/reward1.png";

function normalizeSupportEmail(raw) {
  return String(raw || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase();
}

function isLikelyEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

async function generateUniqueRefCode() {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = crypto.randomBytes(5).toString("hex");
    const exists = await prisma.user.findUnique({ where: { refCode: code }, select: { id: true } });
    if (!exists) return code;
  }
  throw new Error("Unable to generate referral code");
}

async function ensureWelcomeMinerForRecovery() {
  let miner = await prisma.miner.findUnique({ where: { slug: WELCOME_MINER_SLUG } });
  if (!miner) {
    miner = await prisma.miner.create({
      data: {
        name: WELCOME_MINER_NAME,
        slug: WELCOME_MINER_SLUG,
        baseHashRate: WELCOME_MINER_HASH_RATE,
        price: 0,
        slotSize: WELCOME_MINER_SLOT_SIZE,
        imageUrl: WELCOME_MINER_IMAGE_URL,
        isActive: true,
        showInShop: false
      }
    });
  }
  return miner;
}

async function pickUsernameFromEmail(normalizedEmail) {
  const raw = (normalizedEmail.split("@")[0] || "user").toLowerCase().replace(/[^a-z0-9._-]/g, "");
  let base = raw.length >= 3 ? raw.slice(0, 24) : "";
  if (base.length < 3) base = `u_${crypto.randomBytes(4).toString("hex")}`;
  let candidate = base;
  for (let i = 0; i < 8; i += 1) {
    const clash = await prisma.user.findFirst({
      where: { username: { equals: candidate, mode: "insensitive" } },
      select: { id: true }
    });
    if (!clash) return candidate;
    candidate = `${base.slice(0, 20)}_${crypto.randomBytes(2).toString("hex")}`;
  }
  return `u_${crypto.randomBytes(6).toString("hex")}`;
}

/**
 * Procura por e-mail exatamente (normalizado). Se não existir, cria conta com senha aleatória (só para o link de reset).
 * @returns {{ user: { id: number, email: string, name: string }, created: boolean } | { user: null, created: false }}
 */
async function findOrCreateUserForPasswordRecovery({ normalizedEmail, displayName }) {
  if (!isLikelyEmail(normalizedEmail)) return { user: null, created: false };

  let user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, email: true, name: true }
  });
  if (user) return { user, created: false };

  const randomPass = crypto.randomBytes(32).toString("hex");
  const passwordHash = await bcrypt.hash(randomPass, 10);
  const username = await pickUsernameFromEmail(normalizedEmail);
  const name = String(displayName || "").trim().slice(0, 48) || username;
  const refCode = await generateUniqueRefCode();
  const welcomeMiner = await ensureWelcomeMinerForRecovery();

  try {
    const created = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          name,
          username,
          email: normalizedEmail,
          passwordHash,
          refCode,
          polBalance: 0,
          usdcBalance: 0
        }
      });
      await tx.userInventory.create({
        data: {
          userId: u.id,
          minerId: welcomeMiner.id,
          minerName: welcomeMiner.name,
          hashRate: welcomeMiner.baseHashRate,
          slotSize: welcomeMiner.slotSize,
          imageUrl: welcomeMiner.imageUrl,
          acquiredAt: new Date()
        }
      });
      await tx.auditLog.create({
        data: {
          userId: u.id,
          action: "support_auto_provision",
          detailsJson: JSON.stringify({ reason: "password_reset_ticket", email: normalizedEmail })
        }
      });
      return u;
    });
    return { user: { id: created.id, email: normalizedEmail, name }, created: true };
  } catch (err) {
    if (err?.code === "P2002") {
      user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true, email: true, name: true }
      });
      if (user) return { user, created: false };
    }
    throw err;
  }
}

async function trySendPasswordResetForUser(user) {
  if (!isSmtpConfigured()) return false;
  const resetToken = signPasswordResetToken(user.id);
  const APP_URL = process.env.APP_URL || "https://blockminer.space";
  const resetUrl = `${APP_URL.replace(/\/$/, "")}/forgot-password?token=${encodeURIComponent(resetToken)}`;
  await sendPasswordResetEmail({
    to: user.email,
    name: user.name,
    resetUrl
  });
  return true;
}

/**
 * Public: Create a new support message.
 */
export const createMessage = async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    let userId = req.user?.id || null;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ ok: false, message: "All fields are required" });
    }

    const isPasswordRecoveryTicket =
      String(subject).includes(SUPPORT_PASSWORD_RESET_TICKET_MARKER) && isLikelyEmail(normalizeSupportEmail(email));

    if (isPasswordRecoveryTicket) {
      try {
        const normalizedEmail = normalizeSupportEmail(email);
        const { user: resolvedUser } = await findOrCreateUserForPasswordRecovery({
          normalizedEmail,
          displayName: name
        });
        if (resolvedUser) {
          userId = resolvedUser.id;
          await trySendPasswordResetForUser(resolvedUser);
        }
      } catch (recoveryErr) {
        console.error("[SupportController] Password recovery ticket flow failed:", recoveryErr);
      }
    }

    const newMessage = await prisma.supportMessage.create({
      data: {
        userId,
        name,
        email,
        subject,
        message
      }
    });

    res.status(201).json({ ok: true, message: "Support message sent successfully", id: newMessage.id });
  } catch (error) {
    console.error("[SupportController] Error creating message:", error);
    res.status(500).json({ ok: false, message: "Error sending support message" });
  }
};


/**
 * Public: List user's support messages.
 */
export const listMessages = async (req, res) => {
  try {
    const userId = req.user?.id;
    const userEmail = req.user?.email;
    
    if (!userId) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const messages = await prisma.supportMessage.findMany({
      where: {
        OR: [
          { userId },
          // Permite "retomar" chamados criados sem login quando o email bate com o usuário autenticado
          ...(userEmail
            ? [
                {
                  userId: null,
                  email: { equals: userEmail, mode: "insensitive" }
                }
              ]
            : [])
        ]
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ ok: true, messages });
  } catch (error) {
    console.error("[SupportController] Error listing messages:", error);
    res.status(500).json({ ok: false, message: "Error listing messages" });
  }
};

/**
 * Public: Get user's specific support message with replies.
 */
export const getMessage = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const message = await prisma.supportMessage.findUnique({
      where: { id: parseInt(id) },
      include: {
        replies: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!message) {
      return res.status(404).json({ ok: false, message: "Message not found" });
    }

    const emailMatches =
      message.userId === null &&
      normalizeSupportEmail(message.email) === normalizeSupportEmail(req.user?.email);

    if (message.userId !== userId && !emailMatches) {
      return res.status(404).json({ ok: false, message: "Message not found" });
    }

    res.json({ ok: true, message });
  } catch (error) {
    console.error("[SupportController] Error getting message:", error);
    res.status(500).json({ ok: false, message: "Error getting message" });
  }
};

/**
 * Public: User replies to a support message.
 */
export const replyToMessage = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { message: replyContent } = req.body;

    if (!userId) return res.status(401).json({ ok: false, message: "Unauthorized" });
    if (!replyContent) return res.status(400).json({ ok: false, message: "Message content is required" });

    const originalMessage = await prisma.supportMessage.findUnique({
      where: { id: parseInt(id) }
    });

    if (!originalMessage) {
      return res.status(404).json({ ok: false, message: "Support ticket not found" });
    }

    const emailMatches =
      originalMessage.userId === null &&
      normalizeSupportEmail(originalMessage.email) === normalizeSupportEmail(req.user?.email);

    if (originalMessage.userId !== userId && !emailMatches) {
      return res.status(404).json({ ok: false, message: "Support ticket not found" });
    }

    const newReply = await prisma.supportReply.create({
      data: {
        supportMessageId: parseInt(id),
        senderId: userId,
        message: replyContent,
        isAdmin: false
      }
    });

    // Atualiza flags para o painel/cliente saber que já houve resposta
    await prisma.supportMessage.update({
      where: { id: parseInt(id) },
      data: {
        isReplied: true,
        repliedAt: new Date()
      }
    });

    res.status(201).json({ ok: true, reply: newReply });
  } catch (error) {
    console.error("[SupportController] Error replying to message:", error);
    res.status(500).json({ ok: false, message: "Error sending reply" });
  }
};

/**
 * Public: List support messages by email (no auth).
 * This is intentionally public because the client UI wants "buscar chamados por e-mail"
 * even before login.
 */
export const publicListMessagesByEmail = async (req, res) => {
  try {
    const rawEmail = req.query.email || req.body?.email;
    const email = normalizeSupportEmail(rawEmail);
    if (!email) return res.status(400).json({ ok: false, message: "Email is required" });

    const messages = await prisma.supportMessage.findMany({
      where: {
        email: { equals: email, mode: "insensitive" }
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    res.json({ ok: true, messages });
  } catch (error) {
    console.error("[SupportController] Error listing messages by email:", error);
    res.status(500).json({ ok: false, message: "Error listing messages" });
  }
};

/**
 * Public: Get a specific message with replies by ID + email match.
 */
export const publicGetMessage = async (req, res) => {
  try {
    const rawEmail = req.query.email || req.body?.email;
    const email = normalizeSupportEmail(rawEmail);
    const { id } = req.params;

    if (!email) return res.status(400).json({ ok: false, message: "Email is required" });
    if (!id) return res.status(400).json({ ok: false, message: "Id is required" });

    const message = await prisma.supportMessage.findUnique({
      where: { id: parseInt(id) },
      include: {
        replies: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!message) return res.status(404).json({ ok: false, message: "Message not found" });

    const storedEmail = normalizeSupportEmail(message.email);
    if (storedEmail !== email) return res.status(404).json({ ok: false, message: "Message not found" });

    res.json({ ok: true, message });
  } catch (error) {
    console.error("[SupportController] Error getting public message:", error);
    res.status(500).json({ ok: false, message: "Error getting message" });
  }
};

/**
 * Public: Reply to a support message by ID + email match.
 */
export const publicReplyToMessage = async (req, res) => {
  try {
    const rawEmail = req.query.email || req.body?.email;
    const email = normalizeSupportEmail(rawEmail);
    const { id } = req.params;
    const { message: replyContent } = req.body;

    if (!email) return res.status(400).json({ ok: false, message: "Email is required" });
    if (!replyContent) return res.status(400).json({ ok: false, message: "Message content is required" });

    const originalMessage = await prisma.supportMessage.findUnique({
      where: { id: parseInt(id) }
    });

    if (!originalMessage) return res.status(404).json({ ok: false, message: "Support ticket not found" });

    const storedEmail = normalizeSupportEmail(originalMessage.email);
    if (storedEmail !== email) {
      return res.status(404).json({ ok: false, message: "Support ticket not found" });
    }

    const newReply = await prisma.supportReply.create({
      data: {
        supportMessageId: parseInt(id),
        senderId: null,
        message: replyContent,
        isAdmin: false
      }
    });

    await prisma.supportMessage.update({
      where: { id: parseInt(id) },
      data: {
        isReplied: true,
        repliedAt: new Date()
      }
    });

    res.status(201).json({ ok: true, reply: newReply });
  } catch (error) {
    console.error("[SupportController] Error replying to public message:", error);
    res.status(500).json({ ok: false, message: "Error sending reply" });
  }
};
