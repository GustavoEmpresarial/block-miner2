import express from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import prisma from "../src/db/prisma.js";
import { getTokenFromRequest, getRefreshTokenFromRequest, ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME } from "../utils/token.js";
import { signAccessToken, createRefreshToken, parseRefreshToken, verifyAccessToken } from "../utils/authTokens.js";
import { createRefreshTokenRecord, getRefreshTokenById, revokeRefreshToken } from "../models/refreshTokenModel.js";
import { updateUserLoginMeta } from "../models/userModel.js";
import { createAuditLog } from "../models/auditLogModel.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { validateBody } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { getUserByRefCode, createReferral, listReferredUsers } from "../models/referralModel.js";
import { getMinerBySlug } from "../models/minersModel.js";
import { addInventoryItem } from "../models/inventoryModel.js";
import { getAnonymizedRequestIp } from "../utils/clientIp.js";
import { getMiningEngine } from "../src/miningEngineInstance.js";
import { isSmtpConfigured, sendPasswordResetEmail } from "../utils/mailer.js";
import loggerLib from "../utils/logger.js";

const logger = loggerLib.child("AuthRoutes");
export const authRouter = express.Router();

const WELCOME_MINER_SLUG = "welcome-10ghs";
const WELCOME_MINER_NAME = "Welcome Miner";
const WELCOME_MINER_HASH_RATE = 10;
const WELCOME_MINER_SLOT_SIZE = 1;
const WELCOME_MINER_IMAGE_URL = "/machines/reward1.png";
const PASSWORD_RESET_TOKEN_TTL = process.env.PASSWORD_RESET_TOKEN_TTL || "20m";
const JWT_ISSUER = process.env.JWT_ISSUER || "blockminer";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "blockminer.app";
const APP_URL = process.env.APP_URL || "https://blockminer.space";

// Helper functions using Prisma
async function generateUniqueRefCode() {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = crypto.randomBytes(5).toString("hex");
    const exists = await prisma.user.findUnique({ where: { refCode: code } });
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
  const payload = verifyAccessToken(accessToken);
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
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return normalizeIdentifier(value).toLowerCase();
}

function signPasswordResetToken(userId) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is required.");
  }

  return jwt.sign({ sub: String(userId), typ: "pwd_reset" }, process.env.JWT_SECRET, {
    expiresIn: PASSWORD_RESET_TOKEN_TTL,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE
  });
}

function verifyPasswordResetToken(token) {
  try {
    if (!process.env.JWT_SECRET) return null;
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE
    });
    if (payload?.typ !== "pwd_reset") return null;
    return payload;
  } catch {
    return null;
  }
}

async function findUserByIdentifier(identifier) {
  const normalizedIdentifier = normalizeIdentifier(identifier);
  const normalizedEmail = normalizeEmail(identifier);

  let user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: { equals: normalizedEmail, mode: "insensitive" } },
        { username: { equals: normalizedIdentifier, mode: "insensitive" } },
        { name: { equals: normalizedIdentifier, mode: "insensitive" } }
      ]
    }
  });

  if (user) return user;

  // Legacy fallback for historically concatenated/corrupted emails.
  if (normalizedIdentifier.includes("@")) {
    user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { endsWith: normalizedEmail, mode: "insensitive" } },
          { email: { contains: normalizedEmail, mode: "insensitive" } }
        ]
      },
      orderBy: { id: "desc" }
    });
  }

  return user;
}

authRouter.post("/register", authLimiter, validateBody(registerSchema), async (req, res) => {
  try {
    const { username, email, password, refCode: refCodeInput } = req.body;
    const normalizedUsername = normalizeIdentifier(username);
    const normalizedEmail = normalizeEmail(email);
    const clientIp = req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.ip;

    // 1. IP-based Anti-Abuse: Limit accounts per IP (max 2 for families/roommates)
    const accountsWithSameIp = await prisma.user.count({
      where: { ip: clientIp }
    });

    if (accountsWithSameIp >= 2) {
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
      }
    });
    if (existing) return res.status(409).json({ ok: false, code: "USER_ALREADY_EXISTS", message: "User already exists." });

    const passwordHash = await bcrypt.hash(password, 10);
    const refCode = await generateUniqueRefCode();
    let referrerId = null;

    if (refCodeInput) {
      const referrer = await prisma.user.findUnique({ where: { refCode: refCodeInput } });
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

    const accessToken = signAccessToken(result);
    const refreshToken = createRefreshToken();
    await createRefreshTokenRecord({ userId: result.id, ...refreshToken, createdAt: Date.now() });

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
    const clientIp = req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.ip;

    const user = await findUserByIdentifier(identifier);

    if (!user) {
      return res.status(401).json({ ok: false, code: "IDENTIFIER_NOT_FOUND", message: "Email ou username não existe." });
    }

    const isPasswordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordMatch) {
      return res.status(401).json({ ok: false, code: "INVALID_CREDENTIALS", message: "Invalid credentials." });
    }

    if (user.isBanned) return res.status(403).json({ ok: false, message: "Account disabled." });

    if (user.isTwoFactorEnabled) {
      if (!twoFactorToken) {
        return res.json({ ok: false, code: "REQUIRE_2FA", require2FA: true, message: "2FA token required." });
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
          userAgent: req.headers['user-agent']
        }
      }),
      prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "login",
          ip: clientIp,
          userAgent: req.headers['user-agent']
        }
      })
    ]);

    const accessToken = signAccessToken(user);
    const refreshToken = createRefreshToken();
    await createRefreshTokenRecord({ userId: user.id, ...refreshToken, createdAt: Date.now() });

    res.setHeader("Set-Cookie", [buildAccessCookie(accessToken), buildRefreshCookie(refreshToken.token, refreshToken.expiresAt)]);
    res.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, unlockedRooms: user.unlockedRooms } });
  } catch (error) {
    res.status(500).json({ ok: false, code: "LOGIN_FAILED", message: "Login failed." });
  }
});

authRouter.get("/session", async (req, res) => {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return res.status(401).json({ ok: false });

    const payload = verifyAccessToken(token);
    if (!payload?.sub) return res.status(401).json({ ok: false });

    const user = await prisma.user.findUnique({ where: { id: Number(payload.sub) } });
    if (!user || user.isBanned) return res.status(401).json({ ok: false });

    res.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, unlockedRooms: user.unlockedRooms } });
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
    if (!resetToken || !newPassword || newPassword.length < 8) {
      return res.status(400).json({ ok: false, message: "Dados inválidos." });
    }

    const payload = verifyPasswordResetToken(resetToken);
    if (!payload?.sub) {
      return res.status(401).json({ ok: false, message: "Token de reset inválido ou expirado." });
    }

    const user = await prisma.user.findUnique({ where: { id: Number(payload.sub) } });
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

    const user = await prisma.user.findUnique({ where: { email } });
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
    const { email } = req.body;
    if (!email || email.trim().length === 0) {
      return res.status(400).json({ ok: false, message: "Email é obrigatório." });
    }

    const normalizedEmail = normalizeEmail(email);
    const user = await findUserByIdentifier(normalizedEmail);

    if (!user) {
      // Não revela se email existe ou não (segurança)
      return res.json({ ok: true, message: "Se o email existe, você receberá instruções de redefinição." });
    }

    const resetToken = signPasswordResetToken(user.id);
    const resetUrl = `${APP_URL.replace(/\/$/, "")}/forgot-password?token=${encodeURIComponent(resetToken)}`;
    const smtpConfigured = isSmtpConfigured();
    let smtpDelivered = false;

    if (smtpConfigured) {
      try {
        await sendPasswordResetEmail({
          to: user.email,
          name: user.name,
          resetUrl,
          ttlMinutes: Number(String(PASSWORD_RESET_TOKEN_TTL).replace(/[^0-9]/g, "")) || 20
        });
        smtpDelivered = true;
      } catch (smtpError) {
        // SMTP may be temporarily unavailable; keep forgot-password endpoint functional.
        logger.error("Failed to deliver password reset email", {
          email: normalizedEmail,
          error: smtpError.message
        });
      }
    }

    logger.info(`[SECURITY] Password reset requested for email: ${normalizedEmail}`);
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

    const normalizedEmail = normalizeEmail(email);
    const user = await findUserByIdentifier(normalizedEmail);

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
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

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
