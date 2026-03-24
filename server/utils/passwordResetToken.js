import jwt from "jsonwebtoken";
import loggerLib from "./logger.js";

const logger = loggerLib.child("PasswordResetToken");

const PASSWORD_RESET_TOKEN_TTL = process.env.PASSWORD_RESET_TOKEN_TTL || "24h";
const JWT_ISSUER = process.env.JWT_ISSUER || "blockminer";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "blockminer.app";

/**
 * Texto para o e-mail (inglês), alinhado a PASSWORD_RESET_TOKEN_TTL (ex.: 24h, 20m, 7d).
 */
export function getPasswordResetExpiryHumanEn() {
  const raw = String(PASSWORD_RESET_TOKEN_TTL).trim().toLowerCase();
  const numMatch = raw.match(/^(\d+)/);
  const n = numMatch ? parseInt(numMatch[1], 10) : 24;
  if (!Number.isFinite(n) || n <= 0) return "24 hours";
  if (raw.includes("d")) return `${n} day${n === 1 ? "" : "s"}`;
  if (raw.includes("h")) return `${n} hour${n === 1 ? "" : "s"}`;
  return `${n} minute${n === 1 ? "" : "s"}`;
}

/** Texto curto em português (avisos ao utilizador / respostas admin). */
export function getPasswordResetExpiryHumanPt() {
  const raw = String(PASSWORD_RESET_TOKEN_TTL).trim().toLowerCase();
  const numMatch = raw.match(/^(\d+)/);
  const n = numMatch ? parseInt(numMatch[1], 10) : 24;
  if (!Number.isFinite(n) || n <= 0) return "24 horas";
  if (raw.includes("d")) return `${n} ${n === 1 ? "dia" : "dias"}`;
  if (raw.includes("h")) return `${n} ${n === 1 ? "hora" : "horas"}`;
  return `${n} ${n === 1 ? "minuto" : "minutos"}`;
}

export function signPasswordResetToken(userId) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is required.");
  }

  return jwt.sign({ sub: String(userId), typ: "pwd_reset" }, process.env.JWT_SECRET, {
    expiresIn: PASSWORD_RESET_TOKEN_TTL,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE
  });
}

export function verifyPasswordResetToken(token) {
  try {
    if (!process.env.JWT_SECRET) return null;
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE
    });
    if (payload?.typ !== "pwd_reset") return null;
    return payload;
  } catch (strictError) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (!payload?.sub) return null;
      if (payload?.typ && payload.typ !== "pwd_reset") return null;
      return payload;
    } catch (legacyError) {
      logger.warn("Invalid password reset token", {
        strictReason: strictError?.message,
        legacyReason: legacyError?.message
      });
      return null;
    }
  }
}
