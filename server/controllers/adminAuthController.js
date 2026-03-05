import jwt from "jsonwebtoken";
import crypto from "crypto";
import loggerLib from "../utils/logger.js";
import { ADMIN_SESSION_COOKIE } from "../utils/token.js";

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

    const { email, securityCode } = req.body;
    if (typeof email !== "string" || typeof securityCode !== "string") {
      return res.status(400).json({ ok: false, message: "Email and code required" });
    }

    const userEmail = email.trim().toLowerCase();
    const userCode = securityCode.trim();

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
