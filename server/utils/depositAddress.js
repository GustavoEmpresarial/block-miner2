import { getAddress, isAddress } from "ethers";

/**
 * Endereço onde o usuário deve enviar POL para depósito.
 * Aceita DEPOSIT_WALLET_ADDRESS ou, em deploys antigos, só CHECKIN_RECEIVER.
 */
export function getPrimaryDepositAddress() {
  const a = String(process.env.DEPOSIT_WALLET_ADDRESS || "").trim();
  if (a) return a;
  const b = String(process.env.CHECKIN_RECEIVER || "").trim();
  return b || null;
}

/**
 * Endereço checksummed válido para Polygon/EVM, ou null se env ausente/ inválido.
 */
export function getValidatedDepositAddress() {
  const raw = getPrimaryDepositAddress();
  if (!raw) return { address: null, reason: "missing" };
  if (!isAddress(raw)) return { address: null, reason: "invalid_format" };
  try {
    return { address: getAddress(raw), reason: null };
  } catch {
    return { address: null, reason: "invalid_checksum" };
  }
}

/** Endereços distintos a monitorar no cron (check-in + depósito podem divergir). */
export function getAllDepositMonitorAddresses() {
  const set = new Set();
  for (const key of ["DEPOSIT_WALLET_ADDRESS", "CHECKIN_RECEIVER"]) {
    const v = String(process.env[key] || "").trim();
    if (v) set.add(v.toLowerCase());
  }
  return [...set];
}
