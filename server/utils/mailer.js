import nodemailer from "nodemailer";
import loggerLib from "./logger.js";

const logger = loggerLib.child("Mailer");

let transporter = null;
let transporterKey = "";

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
  return Boolean(cfg.host && cfg.port && cfg.user && cfg.pass && cfg.from);
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

export async function sendPasswordResetEmail({ to, name, resetUrl, ttlMinutes }) {
  const cfg = getSmtpConfig();
  const tx = getTransporter();
  if (!tx) {
    throw new Error("SMTP not configured");
  }

  const safeName = name || "Miner";
  const safeTtl = Number(ttlMinutes || 20);

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#020617;color:#e2e8f0;padding:24px;">
    <div style="max-width:640px;margin:0 auto;background:#0f172a;border:1px solid #1e293b;border-radius:16px;padding:24px;">
      <h2 style="margin:0 0 8px 0;color:#60a5fa;">BlockMiner - Redefinicao de Senha</h2>
      <p style="margin:0 0 16px 0;color:#cbd5e1;">Ola, ${safeName}.</p>
      <p style="margin:0 0 16px 0;color:#cbd5e1;">Recebemos uma solicitacao para redefinir sua senha.</p>
      <p style="margin:0 0 20px 0;">
        <a href="${resetUrl}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">Redefinir senha agora</a>
      </p>
      <p style="margin:0 0 6px 0;color:#94a3b8;">Este link expira em ${safeTtl} minutos.</p>
      <p style="margin:0;color:#64748b;font-size:12px;">Se voce nao solicitou, ignore este e-mail.</p>
    </div>
  </div>`;

  const text = [
    "BlockMiner - Redefinicao de Senha",
    "",
    `Ola, ${safeName}.`,
    "Recebemos uma solicitacao para redefinir sua senha.",
    "",
    `Abra este link: ${resetUrl}`,
    "",
    `Este link expira em ${safeTtl} minutos.`,
    "Se voce nao solicitou, ignore este e-mail."
  ].join("\n");

  await tx.sendMail({
    from: cfg.from,
    to,
    subject: "BlockMiner - Redefinicao de Senha",
    text,
    html
  });

  logger.info("Password reset email sent", { to });
}