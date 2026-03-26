import express from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import prisma from "../src/db/prisma.js";
import { getTokenFromRequest, getRefreshTokenFromRequest, ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME } from "../utils/token.js";
import { issueAccessAndRefreshTokens, verifyAccessToken } from "../utils/authTokens.js";
import { updateUserLoginMeta, getUserById } from "../models/userModel.js";
import { createAuditLog } from "../models/auditLogModel.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { validateBody } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { getUserByRefCode, createReferral, listReferredUsers } from "../models/referralModel.js";
import { getMinerBySlug } from "../models/minersModel.js";
import { addInventoryItem } from "../models/inventoryModel.js";
import { getAnonymizedRequestIp, getClientIpForStorage, getUserAgentForStorage } from "../utils/clientIp.js";
import { getMiningEngine } from "../src/miningEngineInstance.js";
import { isSmtpConfigured, sendPasswordResetEmail } from "../utils/mailer.js";
import { signPasswordResetToken, verifyPasswordResetToken } from "../utils/passwordResetToken.js";
import loggerLib from "../utils/logger.js";

const logger = loggerLib.child("AuthRoutes");
export const authRouter = express.Router();

const WELCOME_MINER_SLUG = "welcome-10ghs";
const WELCOME_MINER_NAME = "Welcome Miner";
const WELCOME_MINER_HASH_RATE = 10_000_000_000; // 10 GH/s represented in H/s base
const WELCOME_MINER_SLOT_SIZE = 1;
const WELCOME_MINER_IMAGE_URL = "/machines/reward1.png";
const APP_URL = process.env.APP_URL || "https://blockminer.space";

// Helper functions using Prisma
async function generateUniqueRefCode() {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = crypto.randomBytes(5).toString("hex");
    const exists = await prisma.user.findUnique({ where: { refCode: code }, select: { id: true } });
    if (!exists) return code;
  }
  throw new Error("Unable to generate referral code");
}

async function ensureWelcomeMiner() {
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

function buildCookie(name, value, maxAgeSeconds) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Max-Age=${maxAgeSeconds}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

function buildAccessCookie(accessToken) {
  // Usar decode (não verify): o token acabou de ser assinado; verify falharia em edge cases
  // (relógio, env) e zeraria Max-Age — o browser perdia a sessão logo após "login ok".
  const payload = jwt.decode(accessToken);
  const expSeconds = Number(payload?.exp || 0);
  const maxAgeSeconds = Math.max(0, expSeconds - Math.floor(Date.now() / 1000));
  return buildCookie(ACCESS_COOKIE_NAME, accessToken, maxAgeSeconds);
}

function buildRefreshCookie(refreshToken, expiresAt) {
  const maxAgeSeconds = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  return buildCookie(REFRESH_COOKIE_NAME, refreshToken, maxAgeSeconds);
}

function clearAuthCookies() {
  return [buildCookie(ACCESS_COOKIE_NAME, "", 0), buildCookie(REFRESH_COOKIE_NAME, "", 0)];
}

const registerSchema = z.object({
  username: z.string().trim().min(3, "Username deve ter pelo menos 3 caracteres").max(24, "Username pode ter no maximo 24 caracteres").regex(/^[a-zA-Z0-9._-]+$/, "Username so pode conter letras, numeros, ponto, underline e hifen"),
  email: z.string().trim().email("Email invalido"),
  password: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
  refCode: z.string().trim().optional()
});

import { authenticator } from "otplib";

const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Email ou username é obrigatório"),
  password: z.string().min(1, "Senha é obrigatória"),
  twoFactorToken: z.string().optional()
});

const authLimiter = createRateLimiter({ windowMs: 60_000, max: 12 });

function normalizeIdentifier(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim();
}

function normalizeEmail(value) {
  return normalizeIdentifier(value).toLowerCase();
}

function isPrismaMissingColumnError(err) {
  return err?.code === "P2022" || /column.*does not exist/i.test(String(err?.message || ""));
}

/**
 * Bcrypt e JWT estão corretos; o bug foi BD sem colunas que o schema Prisma lista.
 * Isto evita SELECT * no login; o arranque sério do contentor exige `prisma db push` OK (docker-entrypoint).
 */
const USER_LOGIN_SELECT_TIERS = [
  {
    id: true,
    name: true,
    email: true,
    username: true,
    passwordHash: true,
    isBanned: true,
    isTwoFactorEnabled: true,
    twoFactorSecret: true
  },
  {
    id: true,
    name: true,
    email: true,
    username: true,
    passwordHash: true,
    isBanned: true
  },
  { id: true, name: true, email: true, passwordHash: true, isBanned: true }
];

async function findUserForLogin(where, orderBy = null) {
  for (const select of USER_LOGIN_SELECT_TIERS) {
    try {
      const args = { where, select };
      if (orderBy) args.orderBy = orderBy;
      return await prisma.user.findFirst(args);
    } catch (err) {
      if (!isPrismaMissingColumnError(err)) throw err;
    }
  }
  return null;
}

async function findUserByIdForLogin(id) {
  const nid = Number(id);
  if (!Number.isFinite(nid)) return null;
  for (const select of USER_LOGIN_SELECT_TIERS) {
    try {
      return await prisma.user.findUnique({ where: { id: nid }, select });
    } catch (err) {
      if (!isPrismaMissingColumnError(err)) throw err;
    }
  }
  return null;
}

/**
 * Finds users whose email/username/name in DB has accidental leading/trailing spaces
 * or differs only by Unicode normalization — Prisma `equals` won't match those.
 */
async function findUserByDbTrimFallback(normalizedIdentifier) {
  const key = normalizeEmail(normalizedIdentifier);
  const hasAt = normalizedIdentifier.includes("@");

  try {
    if (hasAt) {
      const rows = await prisma.$queryRaw`
        SELECT id FROM users
        WHERE LOWER(TRIM(BOTH FROM email)) = ${key}
        LIMIT 1
      `;
      const id = rows?.[0]?.id;
      if (id != null) return findUserByIdForLogin(id);
    } else {
      const rows = await prisma.$queryRaw`
        SELECT id FROM users
        WHERE LOWER(TRIM(BOTH FROM COALESCE(username, ''))) = ${key}
           OR LOWER(TRIM(BOTH FROM name)) = ${key}
        LIMIT 1
      `;
      const id = rows?.[0]?.id;
      if (id != null) return findUserByIdForLogin(id);
    }
  } catch (err) {
    logger.warn("findUserByDbTrimFallback failed", { message: err?.message });
  }
  return null;
}

function sanitizeResetToken(value) {
  return String(value || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/\s+/g, "");
}

async function findUserByIdentifier(identifier) {
  const normalizedIdentifier = normalizeIdentifier(identifier);
  const normalizedEmail = normalizeEmail(identifier);

  let user = await findUserForLogin({
    OR: [
      { email: { equals: normalizedEmail, mode: "insensitive" } },
      { username: { equals: normalizedIdentifier, mode: "insensitive" } },
      { name: { equals: normalizedIdentifier, mode: "insensitive" } }
    ]
  });

  if (user) return user;

  // Legacy fallback for historically concatenated/corrupted emails.
  if (normalizedIdentifier.includes("@")) {
    user = await findUserForLogin(
      {
        OR: [
          { email: { endsWith: normalizedEmail, mode: "insensitive" } },
          { email: { contains: normalizedEmail, mode: "insensitive" } }
        ]
      },
      { id: "desc" }
    );
  }

  if (user) return user;

  user = await findUserByDbTrimFallback(normalizedIdentifier);
  return user;
}

authRouter.post("/register", authLimiter, validateBody(registerSchema), async (req, res) => {
  try {
    const { username, email, password, refCode: refCodeInput } = req.body;
    const normalizedUsername = normalizeIdentifier(username);
    const normalizedEmail = normalizeEmail(email);
    const clientIp = getClientIpForStorage(req);

    // 1. IP-based Anti-Abuse: Limit accounts per IP (max 5 for families/roommates)
    const accountsWithSameIp = await prisma.user.count({
      where: { ip: clientIp }
    });

    if (accountsWithSameIp >= 5) {
      logger.warn(`Registration blocked: IP ${clientIp} already has ${accountsWithSameIp} accounts.`);
      return res.status(403).json({ ok: false, code: "REGISTRATION_LIMIT_REACHED", message: "Registration limit reached for this connection." });
    }

    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: normalizedEmail, mode: "insensitive" } },
          { username: { equals: normalizedUsername, mode: "insensitive" } },
          { name: { equals: normalizedUsername, mode: "insensitive" } }
        ]
      },
      select: { id: true }
    });
    if (existing) return res.status(409).json({ ok: false, code: "USER_ALREADY_EXISTS", message: "User already exists." });

    const passwordHash = await bcrypt.hash(password, 10);
    const refCode = await generateUniqueRefCode();
    let referrerId = null;

    if (refCodeInput) {
      const referrer = await prisma.user.findUnique({
        where: { refCode: refCodeInput },
        select: { id: true, ip: true }
      });
      if (referrer) {
        // 2. Anti-Self-Referral: Prevent referring if IP matches or last known IP matches
        if (referrer.ip === clientIp) {
          logger.warn(`Self-referral attempt blocked: User ${normalizedUsername} tried to use refCode from same IP ${clientIp}`);
        } else {
          referrerId = referrer.id;
        }
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: username,
          username: normalizedUsername,
          email: normalizedEmail,
          passwordHash,
          refCode: refCode,
          ip: clientIp, // Store IP immediately on registration
          polBalance: 0,
          usdcBalance: 0
        }
      });

      if (referrerId) {
        await tx.referral.create({ data: { referrerId, referredId: user.id } });
      }

      const welcomeMiner = await ensureWelcomeMiner();
      
      // IMPORTANT: Add to INVENTORY, not directly to RACK
      await tx.userInventory.create({
        data: {
          userId: user.id,
          minerId: welcomeMiner.id,
          minerName: welcomeMiner.name,
          hashRate: welcomeMiner.baseHashRate,
          slotSize: welcomeMiner.slotSize,
          imageUrl: welcomeMiner.imageUrl,
          acquiredAt: new Date()
        }
      });

      // Audit Log for registration
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "register",
          ip: clientIp,
          detailsJson: JSON.stringify({ referrerId })
        }
      });

      return user;
    });

    const { accessToken, refreshToken } = await issueAccessAndRefreshTokens(result);

    // Reload referrer profile if online
    if (referrerId) {
      try {
        const engine = getMiningEngine();
        if (engine) {
          await engine.reloadMinerProfile(referrerId);
        }
      } catch (err) {
        logger.error("Failed to reload referrer profile", { referrerId, error: err.message });
      }
    }

    res.setHeader("Set-Cookie", [buildAccessCookie(accessToken), buildRefreshCookie(refreshToken.token, refreshToken.expiresAt)]);
    res.status(201).json({ ok: true, user: { id: result.id, username: normalizedUsername, email: normalizedEmail } });
  } catch (error) {
    logger.error("Register error", { error: error.message });
    res.status(500).json({ ok: false, code: "REGISTRATION_FAILED", message: "Registration failed." });
  }
});

authRouter.post("/login", authLimiter, validateBody(loginSchema), async (req, res) => {
  try {
    const { identifier, password, twoFactorToken } = req.body;
    const clientIp = getClientIpForStorage(req);
    const userAgentStored = getUserAgentForStorage(req);

    const user = await findUserByIdentifier(identifier);

    if (!user) {
      return res.status(401).json({ ok: false, code: "IDENTIFIER_NOT_FOUND", message: "Email ou username não existe." });
    }

    const hash = user.passwordHash;
    if (hash == null || typeof hash !== "string" || hash.trim() === "") {
      logger.warn("Login blocked: missing password hash", { userId: user.id });
      return res.status(401).json({
        ok: false,
        code: "INVALID_CREDENTIALS",
        message: "Conta sem senha válida. Use redefinição de senha."
      });
    }

    const isPasswordMatch = await bcrypt.compare(password, hash);
    if (!isPasswordMatch) {
      return res.status(401).json({ ok: false, code: "INVALID_CREDENTIALS", message: "Invalid credentials." });
    }

    if (user.isBanned) return res.status(403).json({ ok: false, message: "Account disabled." });

    if (user.isTwoFactorEnabled) {
      if (!twoFactorToken) {
        return res.status(403).json({ ok: false, code: "REQUIRE_2FA", require2FA: true, message: "2FA token required." });
      }

      if (user.twoFactorSecret == null || user.twoFactorSecret === "") {
        logger.error("Login: 2FA flag set but secret missing", { userId: user.id });
        return res.status(500).json({
          ok: false,
          code: "LOGIN_FAILED",
          message: "Configuração 2FA inconsistente. Contacte o suporte."
        });
      }

      const isValid = authenticator.check(twoFactorToken, user.twoFactorSecret);
      if (!isValid) {
        return res.status(401).json({ ok: false, code: "INVALID_2FA", message: "Código 2FA inválido." });
      }
    }

    // Update login meta and store AuditLog
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { 
          ip: clientIp,
          lastLoginAt: new Date(),
          userAgent: userAgentStored
        }
      }),
      prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "login",
          ip: clientIp,
          userAgent: userAgentStored
        }
      })
    ]);

    let accessToken;
    let refreshToken;
    try {
      ({ accessToken, refreshToken } = await issueAccessAndRefreshTokens(user));
    } catch (tokenError) {
      logger.error("Token generation failed", {
        userId: user.id,
        error: tokenError.message,
        prismaCode: tokenError?.code,
        stack: tokenError.stack,
        clientIp,
        userAgent: userAgentStored,
        twoFactorProvided: Boolean(twoFactorToken),
        identifierPreview: String(identifier || "").slice(0, 60)
      });
      return res.status(500).json({ ok: false, code: "LOGIN_FAILED", message: "Falha na geração de token. Tente novamente." });
    }

    res.setHeader("Set-Cookie", [buildAccessCookie(accessToken), buildRefreshCookie(refreshToken.token, refreshToken.expiresAt)]);
    res.json({
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        unlockedRooms: user.unlockedRooms ?? []
      }
    });
  } catch (error) {
    logger.error("Login error", {
      error: error.message,
      stack: error.stack,
      prismaCode: error?.code,
      prismaMeta: error?.meta,
      clientIp: getClientIpForStorage(req),
      userAgent: getUserAgentForStorage(req),
      twoFactorProvided: Boolean(req.body?.twoFactorToken),
      identifierPreview: String(req.body?.identifier || "").slice(0, 60)
    });
    res.status(500).json({ ok: false, code: "LOGIN_FAILED", message: "Erro ao fazer login. Tente novamente ou redefinir sua senha." });
  }
});

authRouter.get("/session", async (req, res) => {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return res.status(401).json({ ok: false });

    const payload = verifyAccessToken(token);
    if (!payload?.sub) return res.status(401).json({ ok: false });

    const user = await getUserById(Number(payload.sub));
    if (!user || user.isBanned) return res.status(401).json({ ok: false });

    res.json({
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        unlockedRooms: user.unlockedRooms ?? []
      }
    });
  } catch {
    res.status(500).json({ ok: false });
  }
});

authRouter.post("/logout", (req, res) => {
  res.setHeader("Set-Cookie", clearAuthCookies());
  res.json({ ok: true });
});

authRouter.post("/mark-adblock", requireAuth, async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { hasAdblock: true }
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false });
  }
});

authRouter.post("/legacy-password-reset", async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;
    const safeResetToken = sanitizeResetToken(resetToken);
    if (!safeResetToken || !newPassword || newPassword.length < 8) {
      return res.status(400).json({ ok: false, message: "Dados inválidos." });
    }

    const payload = verifyPasswordResetToken(safeResetToken);
    if (!payload?.sub) {
      return res.status(401).json({ ok: false, message: "Token de reset inválido ou expirado." });
    }

    const user = await prisma.user.findUnique({
      where: { id: Number(payload.sub) },
      select: { id: true }
    });
    if (!user) {
      return res.status(404).json({ ok: false, message: "Usuário não encontrado." });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash }
    });

    logger.info(`[SECURITY_AUDIT] Legacy password reset completed`, { 
      userId: user.id, 
      ip: req.headers['x-real-ip'] || req.ip,
      timestamp: new Date().toISOString()
    });
    res.json({ ok: true, message: "Sua senha foi atualizada com sucesso. Agora você já pode logar!" });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao resetar senha de migração." });
  }
});

authRouter.post("/reset-password-manual", async (req, res) => {
  try {
    const { email, newPassword, adminKey } = req.body;
    
    // Segurança básica para esta rota manual
    if (adminKey !== process.env.ADMIN_SECURITY_CODE) {
      return res.status(403).json({ ok: false, message: "Unauthorized manual reset." });
    }

    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) return res.status(404).json({ ok: false, message: "User not found." });

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash }
    });

    logger.info(`Manual password reset for ${email}`);
    res.json({ ok: true, message: "Senha alterada com sucesso." });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro no reset manual." });
  }
});

// 🔐 Esqueci a Senha - Redefinição Forçada da Conta
authRouter.post("/forgot-password", authLimiter, async (req, res) => {
  try {
    const rawInput = normalizeIdentifier(req.body?.email ?? req.body?.identifier ?? "");
    if (!rawInput) {
      return res.status(400).json({ ok: false, message: "E-mail ou nome de usuário é obrigatório." });
    }

    const normalizedEmail = normalizeEmail(rawInput);
    const user = await findUserByIdentifier(rawInput);

    if (!user) {
      const inputDomain =
        rawInput.includes("@")
          ? String(rawInput.split("@").pop() || "")
              .toLowerCase()
              .trim() || null
          : null;
      logger.info("forgot-password outcome", {
        outcome: "no_user_match",
        hasAt: rawInput.includes("@"),
        inputDomain,
        inputLength: rawInput.length
      });
      // Não revela se email existe ou não (segurança)
      return res.json({ ok: true, message: "Se o email existe, você receberá instruções de redefinição." });
    }

    const storedEmail = String(user.email || "").trim();
    const recipientDomain = storedEmail.includes("@")
      ? storedEmail.split("@").pop().toLowerCase()
      : "unknown";

    const resetToken = signPasswordResetToken(user.id);
    const resetUrl = `${APP_URL.replace(/\/$/, "")}/forgot-password?token=${encodeURIComponent(resetToken)}`;
    const smtpConfigured = isSmtpConfigured();
    let smtpDelivered = false;

    if (smtpConfigured) {
      try {
        await sendPasswordResetEmail({
          to: storedEmail,
          name: user.name,
          resetUrl
        });
        smtpDelivered = true;
      } catch (smtpError) {
        // SMTP may be temporarily unavailable; keep forgot-password endpoint functional.
        logger.error("Failed to deliver password reset email", {
          userId: user.id,
          recipientDomain,
          error: smtpError.message
        });
      }
    }

    logger.info("forgot-password outcome", {
      outcome: smtpDelivered ? "email_sent" : smtpConfigured ? "smtp_failed" : "no_smtp_token_in_response",
      userId: user.id,
      recipientDomain
    });
    if (smtpDelivered) {
      return res.json({ ok: true, message: "Enviamos um link de redefinição para o seu e-mail." });
    }

    if (smtpConfigured) {
      return res.status(202).json({
        ok: true,
        message: "Solicitação recebida. O envio de e-mail está instável; tente novamente em alguns minutos."
      });
    }

    return res.json({ ok: true, message: "Solicitação registrada. Continue para definir sua nova senha.", resetToken });
  } catch (error) {
    logger.error("Forgot password error", { error: error.message });
    res.status(500).json({ ok: false, message: "Erro ao processar redefinição de senha." });
  }
});

// 🔐 Redefinição Forçada com Admin (requer chave de admin)
authRouter.post("/admin/force-password-reset", async (req, res) => {
  try {
    const { email, newPassword, adminKey } = req.body;
    
    // Validação de chave de admin
    if (!adminKey || adminKey !== process.env.ADMIN_SECURITY_CODE) {
      return res.status(403).json({ ok: false, message: "Chave de admin inválida." });
    }

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ ok: false, message: "Nova senha inválida." });
    }

    const rawInput = normalizeIdentifier(email ?? "");
    const normalizedEmail = normalizeEmail(rawInput);
    const user = await findUserByIdentifier(rawInput);

    if (!user) {
      return res.status(404).json({ ok: false, message: "Usuário não encontrado." });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash }
    });

    logger.info(`[ADMIN] Force password reset completed for email: ${normalizedEmail}`);
    res.json({ ok: true, message: "Senha redefinida com sucesso." });
  } catch (error) {
    logger.error("Admin force reset error", { error: error.message });
    res.status(500).json({ ok: false, message: "Erro ao forçar redefinição de senha." });
  }
});

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8)
});

authRouter.post("/change-password", requireAuth, validateBody(changePasswordSchema), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, passwordHash: true }
    });

    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return res.status(401).json({ ok: false, message: "Senha atual incorreta." });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash }
    });

    res.json({ ok: true, message: "Senha alterada com sucesso." });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao alterar senha." });
  }
});
