import jwt from "jsonwebtoken";
import crypto from "crypto";
import loggerLib from "../utils/logger.js";
import { ADMIN_SESSION_COOKIE, getAdminTokenFromRequest } from "../utils/token.js";

const logger = loggerLib.child("AdminAuthController");

function timingSafeStringEqual(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const ADMIN_SECURITY_CODE = String(process.env.ADMIN_SECURITY_CODE || "").trim();
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.ADMIN_JWT_EXPIRES_IN || "24h";

function buildAdminCookie(token) {
  const parts = [`${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}`, "Path=/", "HttpOnly", "SameSite=Strict"];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export async function login(req, res) {
  try {
    if (!ADMIN_EMAIL || !ADMIN_SECURITY_CODE) {
      return res.status(503).json({ ok: false, message: "Admin auth not configured" });
    }

    const { email, securityCode, password } = req.body;
    const codeInput = typeof securityCode === "string" ? securityCode : password;
    if (typeof email !== "string" || typeof codeInput !== "string") {
      return res.status(400).json({ ok: false, message: "Email and code required" });
    }

    const userEmail = email.trim().toLowerCase();
    const userCode = codeInput.trim();

    const emailMatch = timingSafeStringEqual(userEmail, ADMIN_EMAIL);
    const codeMatch = timingSafeStringEqual(userCode, ADMIN_SECURITY_CODE);

    if (!emailMatch || !codeMatch) {
      return res.status(401).json({ ok: false, message: "Invalid credentials" });
    }

    const token = jwt.sign({ role: "admin", type: "admin_session" }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
      issuer: "blockminer-admin"
    });

    res.setHeader("Set-Cookie", buildAdminCookie(token));
    return res.json({ ok: true, message: "Authenticated", token });
  } catch (error) {
    logger.error("Admin login error", { error: error.message });
    return res.status(500).json({ ok: false, message: "Internal server error" });
  }
}

/** GET /api/admin/auth/check — layout do painel; não exige middleware (valida aqui). */
export function checkAdminSession(req, res) {
  try {
    if (!JWT_SECRET) {
      return res.status(503).json({ ok: false, message: "Admin auth unavailable." });
    }
    const token = getAdminTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ ok: false, message: "Admin session invalid." });
    }
    const payload = jwt.verify(token, JWT_SECRET, {
      issuer: "blockminer-admin",
      algorithms: ["HS256"]
    });
    if (payload.role !== "admin" || payload.type !== "admin_session") {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }
    return res.json({ ok: true });
  } catch {
    return res.status(401).json({ ok: false, message: "Admin session invalid." });
  }
}
