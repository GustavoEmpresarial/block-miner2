import express from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
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
import loggerLib from "../utils/logger.js";

const logger = loggerLib.child("AuthRoutes");
export const authRouter = express.Router();

const WELCOME_MINER_SLUG = "welcome-10ghs";
const WELCOME_MINER_NAME = "Welcome Miner";
const WELCOME_MINER_HASH_RATE = 10;
const WELCOME_MINER_SLOT_SIZE = 1;
const WELCOME_MINER_IMAGE_URL = "/assets/machines/reward1.png";

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
  username: z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9._-]+$/),
  email: z.string().trim().email(),
  password: z.string().min(8),
  refCode: z.string().trim().optional()
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8)
});

const authLimiter = createRateLimiter({ windowMs: 60_000, max: 12 });

authRouter.post("/register", authLimiter, validateBody(registerSchema), async (req, res) => {
  try {
    const { username, email, password, refCode: refCodeInput } = req.body;

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] }
    });
    if (existing) return res.status(409).json({ ok: false, message: "User already exists." });

    const passwordHash = await bcrypt.hash(password, 10);
    const refCode = await generateUniqueRefCode();
    let referrerId = null;

    if (refCodeInput) {
      const referrer = await prisma.user.findUnique({ where: { refCode: refCodeInput } });
      if (referrer) referrerId = referrer.id;
    }

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: username,
          username,
          email,
          passwordHash,
          refCode: refCode,
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

      return user;
    });

    const accessToken = signAccessToken(result);
    const refreshToken = createRefreshToken();
    await createRefreshTokenRecord({ userId: result.id, ...refreshToken, createdAt: Date.now() });

    res.setHeader("Set-Cookie", [buildAccessCookie(accessToken), buildRefreshCookie(refreshToken.token, refreshToken.expiresAt)]);
    res.status(201).json({ ok: true, user: { id: result.id, username, email } });
  } catch (error) {
    logger.error("Register error", { error: error.message });
    res.status(500).json({ ok: false, message: "Registration failed." });
  }
});

authRouter.post("/login", authLimiter, validateBody(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ ok: false, message: "Invalid credentials." });
    }

    if (user.isBanned) return res.status(403).json({ ok: false, message: "Account disabled." });

    const accessToken = signAccessToken(user);
    const refreshToken = createRefreshToken();
    await createRefreshTokenRecord({ userId: user.id, ...refreshToken, createdAt: Date.now() });

    res.setHeader("Set-Cookie", [buildAccessCookie(accessToken), buildRefreshCookie(refreshToken.token, refreshToken.expiresAt)]);
    res.json({ ok: true, user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Login failed." });
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

    res.json({ ok: true, user: { id: user.id, name: user.name, email: user.email } });
  } catch {
    res.status(500).json({ ok: false });
  }
});

authRouter.post("/logout", (req, res) => {
  res.setHeader("Set-Cookie", clearAuthCookies());
  res.json({ ok: true });
});
