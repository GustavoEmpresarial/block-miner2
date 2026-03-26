/**
 * Tickets de análise de depósito/saldo. Alinhar assunto com server/constants/supportTicketSubjects.js (MARKER).
 * Cabeçalhos do corpo: o admin faz parse por estes textos exatos.
 */
export const SUPPORT_WALLET_RECOVERY_MARKER = '[Saldo/POL]';

/** Deteta tickets de análise de depósito ainda que o assunto varie em maiúsculas (CSS também força uppercase na UI). */
export function isWalletRecoverySupportSubject(subject) {
  return String(subject || '')
    .toLowerCase()
    .includes('[saldo/pol]');
}

/** Assuntos de recuperação de senha começam com isto — alinhar com server/constants/supportTicketSubjects.js */
export const SUPPORT_PASSWORD_RESET_TICKET_MARKER = '[Senha]';

/**
 * Painel admin: mostrar “Liberar recuperação” e histórico mesmo se o assunto variar ligeiramente.
 * Manter alinhado com `isPasswordRecoverySupportTicket` em server/constants/supportTicketSubjects.js
 */
export function isPasswordRecoverySupportTicket(subject, message) {
  const subj = String(subject || '');
  const subjL = subj.toLowerCase();
  const msgL = String(message || '')
    .toLowerCase()
    .normalize('NFKC');

  if (subj.includes(SUPPORT_PASSWORD_RESET_TICKET_MARKER)) return true;
  if (/\[[\s\u00a0]*senha[\s\u00a0]*\]/i.test(subj)) return true;

  if (isWalletRecoverySupportSubject(subj)) return false;

  const bodyHints = [
    'não recebi o e-mail com o link de redefinição',
    'nao recebi o e-mail com o link de redefinição',
    'peço ajuda para concluir a recuperação',
    'peco ajuda para concluir a recuperação',
    'link de redefinição de senha',
    'nao recebi o link de redefinição',
    'não recebi o link de redefinição'
  ];
  if (bodyHints.some((h) => msgL.includes(h))) return true;

  if (
    subjL.includes('senha') &&
    (subjL.includes('redef') || subjL.includes('recuper') || subjL.includes('esqueci') || subjL.includes('login'))
  ) {
    return true;
  }

  return false;
}

export const SUPPORT_WALLET_MSG = {
  wallets: '--- Carteiras informadas pelo jogador ---',
  txHashes: '--- TxHashes informados (prioridade análise) ---',
  auto: '--- Dados automáticos da conta (não apague) ---',
  notes: '--- Observações extras ---'
};

function sliceAfterHeader(text, header, nextHeaders) {
  const idx = text.indexOf(header);
  if (idx === -1) return null;
  const start = idx + header.length;
  let end = text.length;
  for (const h of nextHeaders) {
    const j = text.indexOf(h, start);
    if (j !== -1 && j < end) end = j;
  }
  return text.slice(start, end).trim();
}

/** @returns {{ wallets: string, hashes: string, auto: string, notes: string } | null} */
export function parseWalletDepositTicketBody(message) {
  const M = SUPPORT_WALLET_MSG;
  const raw = String(message || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  if (!raw.includes(M.wallets)) return null;
  return {
    wallets: sliceAfterHeader(raw, M.wallets, [M.txHashes, M.auto, M.notes]) || '',
    hashes: sliceAfterHeader(raw, M.txHashes, [M.auto, M.notes]) || '',
    auto: sliceAfterHeader(raw, M.auto, [M.notes]) || '',
    notes: sliceAfterHeader(raw, M.notes, []) || ''
  };
}
