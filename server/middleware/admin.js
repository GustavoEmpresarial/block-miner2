import loggerLib from "../utils/logger.js";

const logger = loggerLib.child("AdminAuth");

function parseAllowlist(value) {
  return String(value || "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

const allowedEmails = parseAllowlist(process.env.ADMIN_EMAILS);
const allowAllInDev = process.env.NODE_ENV !== "production" && allowedEmails.length === 0;

export function requireAdmin(req, res, next) {
  if (allowAllInDev) {
    next();
    return;
  }

  if (allowedEmails.length === 0) {
    logger.warn("Admin access denied: ADMIN_EMAILS not configured");
    res.status(403).json({ ok: false, message: "Admin access not configured." });
    return;
  }

  const email = String(req.user?.email || "").trim().toLowerCase();
  if (!email || !allowedEmails.includes(email)) {
    res.status(403).json({ ok: false, message: "Forbidden" });
    return;
  }

  next();
}
