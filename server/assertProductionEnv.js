/**
 * Falha cedo em produção se variáveis críticas faltam (evita app “saudável” com login 500).
 * Deve ser importado imediatamente após loadEnv.js.
 */
const isProd = process.env.NODE_ENV === "production";
if (isProd) {
  const jwt = process.env.JWT_SECRET != null ? String(process.env.JWT_SECRET).trim() : "";
  if (!jwt) {
    // eslint-disable-next-line no-console
    console.error(
      "[FATAL] JWT_SECRET is missing or empty. Add it to the host .env next to docker-compose.yml (compose env_file). Without it, login returns generic failure."
    );
    process.exit(1);
  }
}
