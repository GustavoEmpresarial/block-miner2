import nodemailer from "nodemailer";
import loggerLib from "./logger.js";
import { getPasswordResetExpiryHumanEn } from "./passwordResetToken.js";

const logger = loggerLib.child("Mailer");

let transporter = null;
let transporterKey = "";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeRecipientEmail(to) {
  const raw = String(to || "").trim();
  const lower = raw.toLowerCase();
  if (!lower || !lower.includes("@")) {
    throw new Error("Invalid recipient email address");
  }
  const [local, ...rest] = lower.split("@");
  const domain = rest.join("@");
  if (!local || !domain) {
    throw new Error("Invalid recipient email address");
  }
  return lower;
}

function recipientDomain(email) {
  const s = String(email || "").trim().toLowerCase();
  const i = s.lastIndexOf("@");
  return i === -1 ? "unknown" : s.slice(i + 1);
}

function getSmtpConfig() {
  const host = String(process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = String(process.env.SMTP_SECURE || "true").toLowerCase() === "true";
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "");
  const from = String(process.env.SMTP_FROM || "").trim();
  const connectionTimeout = Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 10000);
  const greetingTimeout = Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10000);
  const socketTimeout = Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 20000);
  const rejectUnauthorized = String(process.env.SMTP_TLS_REJECT_UNAUTHORIZED || "true").toLowerCase() === "true";

  return {
    host,
    port,
    secure,
    user,
    pass,
    from,
    connectionTimeout,
    greetingTimeout,
    socketTimeout,
    rejectUnauthorized
  };
}

export function isSmtpConfigured() {
  const cfg = getSmtpConfig();
  const fromOk = Boolean(String(cfg.from || cfg.user || "").trim());
  return Boolean(cfg.host && cfg.port && cfg.user && cfg.pass && fromOk);
}

function getTransporter() {
  const cfg = getSmtpConfig();
  if (!isSmtpConfigured()) {
    return null;
  }

  const key = `${cfg.host}:${cfg.port}:${cfg.user}:${cfg.secure}`;
  if (!transporter || transporterKey !== key) {
    transporterKey = key;
    transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      connectionTimeout: cfg.connectionTimeout,
      greetingTimeout: cfg.greetingTimeout,
      socketTimeout: cfg.socketTimeout,
      auth: {
        user: cfg.user,
        pass: cfg.pass
      },
      tls: {
        rejectUnauthorized: cfg.rejectUnauthorized
      }
    });
  }

  return transporter;
}

export async function sendPasswordResetEmail({ to, name, resetUrl }) {
  const cfg = getSmtpConfig();
  const tx = getTransporter();
  if (!tx) {
    throw new Error("SMTP not configured");
  }

  const toNorm = normalizeRecipientEmail(to);
  const domain = recipientDomain(toNorm);
  const safeName = escapeHtml(String(name || "Miner").trim() || "Miner");
  const safeUrlText = String(resetUrl || "");
  const safeUrlAttr = escapeHtml(safeUrlText);
  const expiryHuman = escapeHtml(getPasswordResetExpiryHumanEn());

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif; color:#111; line-height:1.5;">
    <p>Hello, ${safeName}.</p>
    <p>We received a request to reset your BlockMiner password.</p>
    <p>
      To continue, click the link below:<br />
      <a href="${safeUrlAttr}">${escapeHtml(safeUrlText)}</a>
    </p>
    <p>This link expires in ${expiryHuman}.</p>
    <p>If you did not request this change, you can safely ignore this email.</p>
  </div>`;

  const textName = String(name || "Miner").trim() || "Miner";
  const expiryPlain = getPasswordResetExpiryHumanEn();
  const text = [
    "BlockMiner - Password Reset",
    "",
    `Hello, ${textName}.`,
    "We received a request to reset your password.",
    "",
    `Open this link: ${safeUrlText}`,
    "",
    `This link expires in ${expiryPlain}.`,
    "If you did not request this change, you can safely ignore this email."
  ].join("\n");

  // From alinhado ao SMTP_USER melhora entrega (SPF/DMARC em vários provedores).
  const fromAddr = cfg.from || cfg.user;

  /** Cópia oculta para suporte: confirma que o SMTP aceitou o envio (opcional). */
  const bccAudit = String(process.env.PASSWORD_RESET_EMAIL_BCC || "").trim();
  const mailOptions = {
    from: fromAddr,
    replyTo: cfg.from || cfg.user,
    to: toNorm,
    subject: "BlockMiner - Password Reset",
    text,
    html,
    headers: {
      "X-Entity-Ref-ID": `bm-reset-${Date.now()}`
    }
  };
  if (bccAudit.includes("@")) {
    mailOptions.bcc = bccAudit;
  }

  await tx.sendMail(mailOptions);

  logger.info("Password reset email sent", { recipientDomain: domain });
}