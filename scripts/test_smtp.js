import "../server/loadEnv.js";
import nodemailer from "nodemailer";

async function main() {
  const host = String(process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = String(process.env.SMTP_SECURE || 'true').toLowerCase() === 'true';
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "");

  if (!host || !user || !pass) {
    console.error('SMTP_FAIL missing SMTP env vars (SMTP_HOST/SMTP_USER/SMTP_PASS).');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 10000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 20000),
    auth: {
      user,
      pass
    },
    tls: {
      rejectUnauthorized: String(process.env.SMTP_TLS_REJECT_UNAUTHORIZED || "true").toLowerCase() === "true"
    }
  });

  await transporter.verify();
  console.log('SMTP_OK');
}

main().catch((err) => {
  console.error('SMTP_FAIL', err.message);
  process.exit(1);
});
