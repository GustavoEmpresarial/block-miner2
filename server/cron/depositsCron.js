import { ethers } from "ethers";
import axios from "axios";
import walletModel from "../models/walletModel.js";
import prisma from "../src/db/prisma.js";
import loggerLib from "../utils/logger.js";
import { createCronActionRunner } from "./cronActionRunner.js";
import { getAllDepositMonitorAddresses } from "../utils/depositAddress.js";

const logger = loggerLib.child("DepositsCron");

// Configurações via Variáveis de Ambiente
const getPolygonscanKey = () => process.env.POLYGONSCAN_API_KEY;
const getWithdrawalPrivKey = () => process.env.WITHDRAWAL_PRIVATE_KEY;
const getWithdrawalMnemonic = () => process.env.WITHDRAWAL_MNEMONIC;

const runCronAction = createCronActionRunner({ logger, cronName: "DepositsCron" });

// Estado do Scanner Reativo
let lastActivationTime = 0;
const SCAN_WINDOW_MS = 30 * 60 * 1000; // 30 minutos de vida após última interação

/**
 * Ativa o scanner ou estende o tempo de monitoramento ativo.
 */
export function wakeUpScanner() {
  lastActivationTime = Date.now();
}

/**
 * Obtém o endereço da Hot Wallet para monitorar depósitos enviados a ela.
 */
function getHotWalletAddress() {
  try {
    const mnemonic = getWithdrawalMnemonic();
    const privKey = getWithdrawalPrivKey();
    if (mnemonic) return ethers.Wallet.fromPhrase(mnemonic).address.toLowerCase();
    if (privKey) {
      const key = privKey.trim();
      const formattedKey = key.startsWith("0x") ? key : `0x${key}`;
      return new ethers.Wallet(formattedKey).address.toLowerCase();
    }
  } catch (e) {}
  return null;
}

/**
 * Lista todas as carteiras do sistema que devem ser monitoradas.
 */
function getAllowedWallets() {
  const wallets = [...getAllDepositMonitorAddresses()];
  const hot = getHotWalletAddress();
  if (hot && !wallets.includes(hot)) wallets.push(hot);
  return wallets;
}

/**
 * Consulta a API V2 do Polygonscan.
 */
async function fetchTxs(address) {
  const apiKey = getPolygonscanKey();
  if (!apiKey) return [];
  const url = `https://api.etherscan.io/v2/api?chainid=137&module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${apiKey}`;
  try {
    const resp = await axios.get(url);
    return resp.data.status === "1" ? resp.data.result : [];
  } catch (e) {
    logger.error("Polygonscan API error", { address, error: e.message });
    return [];
  }
}

/**
 * Escaneia a rede em busca de novos depósitos.
 * @param {boolean} force - Força o escaneamento mesmo em modo idle.
 */
export async function scanForNewDeposits(force = false, deps = {}) {
  const now = Date.now();
  const db = deps.prisma || prisma;
  const model = deps.walletModel || walletModel;
  
  if (!force && (now - lastActivationTime > SCAN_WINDOW_MS)) {
    return { ok: false, reason: "idle" };
  }

  return await runCronAction({
    action: "scan_api_deposits",
    meta: { trigger: force ? "active_trigger" : "reactive_timer" },
    logStart: force, 
    prepare: async () => {
      const wallets = getAllowedWallets();
      if (wallets.length === 0) throw new Error("No monitored wallets configured.");
      return { wallets };
    },
    validate: async ({ wallets }) => {
      if (!getPolygonscanKey()) return { ok: false, reason: "missing_api_key" };
      return { ok: true, details: { walletsCount: wallets.length } };
    },
    execute: async ({ wallets }) => {
      let found = 0;
      const searchTs = Math.floor(Date.now() / 1000) - (12 * 3600);

      for (const wallet of wallets) {
        const txs = await fetchTxs(wallet);
        for (const tx of txs) {
          if (parseInt(tx.timeStamp) < searchTs) break;
          if (tx.to?.toLowerCase() !== wallet || tx.isError === "1") continue;

          const amount = Number(ethers.formatEther(tx.value));
          if (amount <= 0) continue;

          const existing = await db.transaction.findFirst({
            where: { txHash: tx.hash, type: 'deposit' }
          });

          if (!existing) {
            const user = await db.user.findFirst({
              where: { walletAddress: { equals: tx.from, mode: 'insensitive' } }
            });

            if (user) {
              try {
                await model.createDepositRequest(user.id, amount, tx.hash);
                found++;
                logger.info("Auto-deposit detected", { user: user.username, amount, hash: tx.hash });
              } catch (e) {}
            }
          }
        }
      }
      return { newDepositsFound: found };
    }
  });
}

export function startDepositMonitoring() {
  const interval = setInterval(() => {
    scanForNewDeposits().catch(() => {});
  }, 60 * 1000);
  
  wakeUpScanner();
  scanForNewDeposits(true).catch(() => {});
  
  logger.info("Reactive Deposit Scanner initialized.");
  return [interval];
}

export default {
  startDepositMonitoring,
  scanForNewDeposits,
  wakeUpScanner
};
