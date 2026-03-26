import crypto from "crypto";
import jwt from "jsonwebtoken";
import { createRefreshTokenRecord } from "../models/refreshTokenModel.js";

const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || "12h";
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);
const JWT_ISSUER = process.env.JWT_ISSUER || "blockminer";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "blockminer.app";

function requireJwtSecret() {
  const secret = process.env.JWT_SECRET != null ? String(process.env.JWT_SECRET).trim() : "";
  if (!secret) {
    throw new Error("JWT_SECRET is required. Please set it in your .env file.");
  }
  return secret;
}

/** Evita que `null`, objectos ou caracteres de controlo no perfil partam o `jwt.sign` (erro genérico no login). */
function safeClaimString(value, maxLen) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .slice(0, maxLen);
}

export function signAccessToken(user) {
  const id = Number(user?.id);
  if (!Number.isFinite(id) || id < 1 || id > 2147483647) {
    throw new Error("Invalid user id for JWT");
  }

  const payload = {
    sub: String(id),
    name: safeClaimString(user?.name, 200),
    email: safeClaimString(user?.email, 320)
  };

  return jwt.sign(payload, requireJwtSecret(), {
    expiresIn: ACCESS_TOKEN_TTL,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE
  });
}

/**
 * Gera access JWT + refresh e persiste o refresh (com retentativas — falhas transitórias da BD / colisão de UUID).
 */
export async function issueAccessAndRefreshTokens(user, { maxAttempts = 5 } = {}) {
  const numericId = Number(user?.id);
  if (!Number.isFinite(numericId) || numericId < 1) {
    throw new Error("INVALID_USER_ID_FOR_SESSION");
  }

  const safeUser = {
    id: numericId,
    name: user?.name,
    email: user?.email
  };

  const accessToken = signAccessToken(safeUser);
  if (!accessToken) {
    throw new Error("signAccessToken returned empty token");
  }

  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const refreshToken = createRefreshToken();
      if (!refreshToken?.token) {
        throw new Error("createRefreshToken returned invalid token");
      }
      await createRefreshTokenRecord({
        userId: numericId,
        tokenId: refreshToken.tokenId,
        tokenHash: refreshToken.tokenHash,
        createdAt: Date.now(),
        expiresAt: refreshToken.expiresAt
      });
      return { accessToken, refreshToken };
    } catch (e) {
      lastErr = e;
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 45 + attempt * 35));
      }
    }
  }
  throw lastErr;
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, requireJwtSecret(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE
    });
  } catch (error) {
    return null;
  }
}

function hashRefreshSecret(secret) {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

export function createRefreshToken() {
  const tokenId = crypto.randomUUID();
  const secret = crypto.randomBytes(48).toString("hex");
  const token = `${tokenId}.${secret}`;
  const expiresAt = Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

  return {
    token,
    tokenId,
    tokenHash: hashRefreshSecret(secret),
    expiresAt
  };
}

export function parseRefreshToken(rawToken) {
  if (!rawToken || typeof rawToken !== "string") {
    return null;
  }

  const parts = rawToken.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [tokenId, secret] = parts;
  if (!tokenId || !secret) {
    return null;
  }

  return {
    tokenId,
    secret,
    tokenHash: hashRefreshSecret(secret)
  };
}

export {
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL_DAYS
};
