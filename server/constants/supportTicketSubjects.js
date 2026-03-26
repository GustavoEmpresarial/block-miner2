/** Marcar no assunto do ticket para o admin ver análise de saldo/carteira/blockchain. Manter alinhado com o cliente: `client/src/constants/supportWalletTicket.js`. */
export const SUPPORT_WALLET_RECOVERY_MARKER = "[Saldo/POL]";

/** Case-insensitive — na UI o título pode aparecer como [SALDO/POL]. */
export function isWalletRecoverySupportSubject(subject) {
  return String(subject || "")
    .toLowerCase()
    .includes("[saldo/pol]");
}

/** Prefixo no assunto dos tickets de "não recebi o link" / recuperação de senha (ex.: `[Senha] Não recebi o link...`). Alinhar com o cliente. */
export const SUPPORT_PASSWORD_RESET_TICKET_MARKER = "[Senha]";

/**
 * Deteção alargada para o painel admin (enviar link / histórico).
 * Manter alinhado com `isPasswordRecoverySupportTicket` em `client/src/constants/supportWalletTicket.js`.
 */
export function isPasswordRecoverySupportTicket(subject, message) {
  const subj = String(subject || "");
  const subjL = subj.toLowerCase();
  const msgL = String(message || "")
    .toLowerCase()
    .normalize("NFKC");

  if (subj.includes(SUPPORT_PASSWORD_RESET_TICKET_MARKER)) return true;
  if (/\[[\s\u00a0]*senha[\s\u00a0]*\]/i.test(subj)) return true;

  if (isWalletRecoverySupportSubject(subj)) return false;

  const bodyHints = [
    "não recebi o e-mail com o link de redefinição",
    "nao recebi o e-mail com o link de redefinição",
    "peço ajuda para concluir a recuperação",
    "peco ajuda para concluir a recuperação",
    "link de redefinição de senha",
    "nao recebi o link de redefinição",
    "não recebi o link de redefinição"
  ];
  if (bodyHints.some((h) => msgL.includes(h))) return true;

  if (
    subjL.includes("senha") &&
    (subjL.includes("redef") || subjL.includes("recuper") || subjL.includes("esqueci") || subjL.includes("login"))
  ) {
    return true;
  }

  return false;
}
