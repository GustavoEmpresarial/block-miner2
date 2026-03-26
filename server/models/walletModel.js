import crypto from "crypto";
import prisma from '../src/db/prisma.js';
import { Prisma } from "@prisma/client";
import { syncOnlineMinerPolBalance } from "../src/runtime/miningRuntime.js";
import { ethers } from "ethers";
import { getValidatedDepositAddress } from "../utils/depositAddress.js";
import {
  getPolygonTxFromExplorer,
  getPolygonReceiptFromExplorer,
  getPolygonBlockNumberFromExplorer
} from "../utils/polygonExplorerClient.js";

const DEPOSIT_MIN_CONFIRMATIONS = Math.max(1, Number(process.env.DEPOSIT_MIN_CONFIRMATIONS || 3));

const WITHDRAW_MIN_POL = Number(process.env.MIN_WITHDRAWAL) > 0 ? Number(process.env.MIN_WITHDRAWAL) : 10;
const WITHDRAW_MAX_POL = Number(process.env.MAX_WITHDRAWAL) > 0 ? Number(process.env.MAX_WITHDRAWAL) : 1_000_000;

const IN_FLIGHT_WITHDRAW_STATUSES = ["pending", "approved"];

function hashToAdvisoryBigInt(txHash) {
  const normalized = String(txHash || "").trim().toLowerCase();
  if (!normalized) return 0n;
  const clean = normalized.startsWith("0x") ? normalized.slice(2) : normalized;
  const slice = clean.padStart(16, "0").slice(0, 16);
  try {
    // Postgres `pg_advisory_xact_lock` usa BIGINT assinado.
    // Como o nosso slice vem como "unsigned" até 2^64-1, precisamos converter
    // pra faixa assinada (-2^63..2^63-1) pra evitar 22003 out of range.
    const unsigned = BigInt(`0x${slice}`); // 0..2^64-1
    const maxSigned = 9223372036854775807n; // 2^63-1
    if (unsigned <= maxSigned) return unsigned;
    const mod = 18446744073709551616n; // 2^64
    return unsigned - mod; // vira negativo mas fica dentro da faixa signed
  } catch {
    return 0n;
  }
}

async function getUserBalance(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      polBalance: true,
      walletAddress: true,
      miningLogs: {
        select: {
          rewardAmount: true
        }
      }
    }
  });

  if (!user) return { balance: 0, lifetimeMined: 0, totalWithdrawn: 0, walletAddress: null };

  // Calculate lifetime mined from mining logs
  const lifetimeMined = user.miningLogs.reduce((acc, log) => acc + Number(log.rewardAmount), 0);

  // Calculate total withdrawn from transactions
  const aggregations = await prisma.transaction.aggregate({
    where: { userId, type: 'withdrawal', status: 'completed' },
    _sum: { amount: true }
  });

  return {
    balance: Number(user.polBalance),
    lifetimeMined: Number(lifetimeMined),
    totalWithdrawn: Number(aggregations._sum.amount || 0),
    walletAddress: user.walletAddress
  };
}

async function saveWalletAddress(userId, walletAddress) {
  await prisma.user.update({
    where: { id: userId },
    data: { walletAddress }
  });
  return true;
}

const MOCK_RPC_URL = process.env.NODE_ENV === 'test' ? null : null; // Will just use standard logic
async function createDepositRequest(userId, amount, txHash) {
  if (!txHash || !amount) {
    throw new Error("Amount and TX Hash required.");
  }
  const normalizedTxHash = String(txHash).trim().toLowerCase();

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, walletAddress: true }
    });
    if (!user) {
      throw new Error("User not found.");
    }
    const linkedWallet = String(user.walletAddress || "").trim().toLowerCase();
    if (!linkedWallet) {
      throw new Error("No wallet linked. Connect your wallet first.");
    }

    const lockKey = hashToAdvisoryBigInt(normalizedTxHash);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey});`;

    // 1. Check if txHash already exists to prevent double spend
    const existingTx = await tx.transaction.findFirst({
      where: { txHash: normalizedTxHash, type: 'deposit' }
    });

    if (existingTx) {
      throw new Error("Transaction hash already used for deposit.");
    }

    // 2. Setup ethers provider
    const rpcUrl = process.env.POLYGON_RPC_URL || "https://polygon-rpc.com";
    const { address: depositAddress } = getValidatedDepositAddress();

    if (!depositAddress) {
      throw new Error("Deposit wallet address not configured on server.");
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);

    let transaction;
    // For tests running without real network
    if (process.env.NODE_ENV === 'test' && !process.env.REAL_RPC_TEST) {
      // Mock validation passes
    } else {
      // 3. Prefer Polygon reads via Etherscan API v2 (POLYGONSCAN_API_KEY / ETHERSCAN_API_KEY); fallback to RPC
      let usedExplorer = false;
      if (process.env.NODE_ENV !== "test") {
        const [exTx, exReceipt, exHead] = await Promise.all([
          getPolygonTxFromExplorer(txHash).catch(() => null),
          getPolygonReceiptFromExplorer(txHash).catch(() => null),
          getPolygonBlockNumberFromExplorer().catch(() => null)
        ]);
        if (exTx && exReceipt && exHead != null) {
          usedExplorer = true;
          if (!exTx.to || exTx.to.toLowerCase() !== depositAddress.toLowerCase()) {
            throw new Error("Transaction was not sent to the correct deposit address.");
          }
          if (!exTx.from || exTx.from.toLowerCase() !== linkedWallet) {
            throw new Error("Transaction sender does not match your linked wallet.");
          }
          if (exTx.chainId !== 137) {
            throw new Error("Transaction must be on Polygon Mainnet (Chain ID 137).");
          }
          const txValueInPol = ethers.formatEther(exTx.valueWei);
          if (parseFloat(txValueInPol) < parseFloat(amount) * 0.999) {
            throw new Error(`Transaction amount ${txValueInPol} is less than requested amount ${amount}.`);
          }
          if (!exReceipt.statusOk) {
            throw new Error("Transaction is not confirmed yet or has failed on-chain.");
          }
          const confirmations = Math.max(0, exHead - exReceipt.blockNumber);
          if (confirmations < DEPOSIT_MIN_CONFIRMATIONS) {
            throw new Error(`Transaction has ${confirmations} confirmations. Minimum required: ${DEPOSIT_MIN_CONFIRMATIONS}.`);
          }
        }
      }

      if (!usedExplorer) {
        try {
          transaction = await provider.getTransaction(txHash);
        } catch (err) {
          throw new Error("Invalid transaction hash or network error.");
        }

        if (!transaction) {
          throw new Error("Transaction not found on the network. Make sure it's on Polygon Mainnet.");
        }

        if (!transaction.to || transaction.to.toLowerCase() !== depositAddress.toLowerCase()) {
          throw new Error("Transaction was not sent to the correct deposit address.");
        }
        if (!transaction.from || transaction.from.toLowerCase() !== linkedWallet) {
          throw new Error("Transaction sender does not match your linked wallet.");
        }

        if (transaction.chainId !== 137n && transaction.chainId !== 137) {
          throw new Error("Transaction must be on Polygon Mainnet (Chain ID 137).");
        }

        const txValueInPol = ethers.formatEther(transaction.value);
        if (parseFloat(txValueInPol) < parseFloat(amount) * 0.999) {
          throw new Error(`Transaction amount ${txValueInPol} is less than requested amount ${amount}.`);
        }

        const receipt = await provider.getTransactionReceipt(txHash);
        if (!receipt || receipt.status !== 1) {
          throw new Error("Transaction is not confirmed yet or has failed on-chain.");
        }

        const currentBlock = await provider.getBlockNumber();
        const confirmations = Math.max(0, currentBlock - receipt.blockNumber);
        if (confirmations < DEPOSIT_MIN_CONFIRMATIONS) {
          throw new Error(`Transaction has ${confirmations} confirmations. Minimum required: ${DEPOSIT_MIN_CONFIRMATIONS}.`);
        }
      }
    }

    // 5. Update Database
    const newTx = await tx.transaction.create({
      data: {
        userId,
        type: 'deposit',
        amount,
        txHash: normalizedTxHash,
        status: 'completed',
        completedAt: new Date()
      }
    });

    const afterDeposit = await tx.user.update({
      where: { id: userId },
      data: { polBalance: { increment: amount } },
      select: { polBalance: true }
    });

    syncOnlineMinerPolBalance(userId, afterDeposit.polBalance);

    // 6. Create User Notification
    try {
      const { createNotification } = await import('../controllers/notificationController.js');
      await createNotification({
        userId,
        title: "Depósito Confirmado",
        message: `Seu depósito de ${Number(amount).toFixed(4)} POL foi processado com sucesso e adicionado ao seu saldo.`,
        type: "success"
      });
    } catch (notifyErr) {
      console.error("Error creating deposit notification:", notifyErr);
    }

    return newTx;
  });
}

async function hasPendingWithdrawal(userId) {
  const pending = await prisma.transaction.findFirst({
    where: { userId, type: "withdrawal", status: { in: IN_FLIGHT_WITHDRAW_STATUSES } }
  });
  return !!pending;
}

async function createWithdrawal(userId, amount, address) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    throw new Error("Invalid withdrawal amount");
  }
  if (amt < WITHDRAW_MIN_POL) {
    throw new Error(`Saque mínimo é ${WITHDRAW_MIN_POL} POL`);
  }
  if (amt > WITHDRAW_MAX_POL) {
    throw new Error(`Saque máximo é ${WITHDRAW_MAX_POL} POL`);
  }

  const dec = new Prisma.Decimal(String(amt));

  return prisma.$transaction(async (tx) => {
    const inFlight = await tx.transaction.findFirst({
      where: { userId, type: "withdrawal", status: { in: IN_FLIGHT_WITHDRAW_STATUSES } }
    });
    if (inFlight) throw new Error("Pending withdrawal exists");

    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");
    if (user.polBalance.lt(dec)) throw new Error("Insufficient balance");

    const afterWithdraw = await tx.user.update({
      where: { id: userId },
      data: { polBalance: { decrement: dec } },
      select: { polBalance: true }
    });

    const transaction = await tx.transaction.create({
      data: {
        userId,
        type: "withdrawal",
        amount: dec,
        address,
        status: "pending",
        fundsReserved: true
      }
    });

    syncOnlineMinerPolBalance(userId, afterWithdraw.polBalance);
    return transaction;
  });
}

async function getTransactions(userId, limit = 50) {
  return prisma.transaction.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit
  });
}

async function updateTransactionStatus(transactionId, status, txHash = null) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.findUnique({ where: { id: transactionId } });
    if (!transaction) return true;

    const prevStatus = transaction.status;
    await tx.transaction.update({
      where: { id: transactionId },
      data: {
        status,
        txHash: txHash || transaction.txHash,
        completedAt: status === 'completed' ? now : transaction.completedAt,
        updatedAt: now
      }
    });

    if (transaction.type === 'withdrawal') {
      if (status === 'completed' && prevStatus !== 'completed') {
        // Total withdrawn tracking logic here
      }
      if (status === 'failed' && prevStatus !== 'failed' && prevStatus !== 'completed') {
        if (transaction.fundsReserved) {
          const refunded = await tx.user.update({
            where: { id: transaction.userId },
            data: { polBalance: { increment: transaction.amount } },
            select: { polBalance: true }
          });
          syncOnlineMinerPolBalance(transaction.userId, refunded.polBalance);
        }
      }
    }
    return true;
  });
}

async function getPendingWithdrawals() {
  return prisma.transaction.findMany({
    where: { type: "withdrawal", status: { in: ["pending", "approved"] } },
    include: { user: { select: { username: true, email: true, id: true } } },
    orderBy: { createdAt: "asc" }
  });
}

/** Só saques já aprovados pelo admin — usado pelo cron automático (não envia `pending`). */
async function getApprovedWithdrawals() {
  return prisma.transaction.findMany({
    where: { type: "withdrawal", status: "approved" },
    orderBy: { createdAt: "asc" }
  });
}

async function failAllPendingWithdrawals() {
  const pending = await prisma.transaction.findMany({
    where: { type: "withdrawal", status: "pending" }
  });

  for (const tx of pending) {
    try { await updateTransactionStatus(tx.id, 'failed'); } catch { }
  }
  return { totalPending: pending.length };
}

/**
 * Crédito manual de POL (suporte admin) — migração, re-sync falhou, depósito legítimo não no ledger.
 * Regista transação tipo deposit completed + audit log. txHash opcional (único); se omitido, gera referência interna.
 */
async function creditPolManualSupportMigration({
  userId,
  amountPol,
  supportTicketId,
  txHashOptional,
  adminNote,
  reqIp,
  replenishIfDepositExistsForUser = false
}) {
  const amt = Number(amountPol);
  if (!Number.isFinite(amt) || amt <= 0) {
    throw new Error("Valor POL inválido.");
  }
  const maxPol = Math.max(1e-8, Number(process.env.ADMIN_SUPPORT_MANUAL_POL_MAX || 50000));
  if (amt > maxPol) {
    throw new Error(
      `Valor acima do máximo configurado (${maxPol} POL). Ajuste ADMIN_SUPPORT_MANUAL_POL_MAX no servidor se for necessário.`
    );
  }

  const ticketBacked = Number(supportTicketId) > 0;

  let finalTxHash = String(txHashOptional || "").trim().toLowerCase();
  if (finalTxHash) {
    if (/^[a-f0-9]{64}$/.test(finalTxHash)) finalTxHash = `0x${finalTxHash}`;
    if (!/^0x[a-f0-9]{64}$/.test(finalTxHash)) {
      throw new Error("TxHash inválido: use 0x seguido de 64 hexadecimais, ou deixe vazio.");
    }
  } else {
    const suffix = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
    finalTxHash = ticketBacked
      ? `manual-support-t${supportTicketId}-${suffix}`
      : `manual-admin-u${userId}-${suffix}`;
  }

  const dec = new Prisma.Decimal(String(amt));

  return prisma.$transaction(async (db) => {
    const u = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!u) throw new Error("Utilizador não encontrado.");

    const lockKey = hashToAdvisoryBigInt(finalTxHash);
    await db.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey});`;

    const dup = await db.transaction.findFirst({
      where: { txHash: finalTxHash, type: "deposit" }
    });
    if (dup) {
      if (!replenishIfDepositExistsForUser) {
        throw new Error("Este tx hash já está registado como depósito.");
      }
      if (dup.userId !== userId) {
        throw new Error(
          "Este tx hash está associado a outra conta — não é possível repor saldo a partir deste ticket."
        );
      }
      if (String(dup.status) !== "completed") {
        throw new Error(
          "O depósito com este hash não está concluído no ledger — repor saldo só para depósitos completed."
        );
      }

      const after = await db.user.update({
        where: { id: userId },
        data: { polBalance: { increment: dec } },
        select: { polBalance: true }
      });

      await db.auditLog.create({
        data: {
          userId,
          action: "admin_support_pol_replenish_same_tx",
          ip: reqIp ? String(reqIp).slice(0, 128) : null,
          detailsJson: JSON.stringify({
            supportTicketId: ticketBacked ? supportTicketId : null,
            source: ticketBacked ? "support_ticket" : "admin_direct",
            amountPol: amt,
            txHash: finalTxHash,
            existingDepositTransactionId: dup.id,
            ledgerDepositAmount: dup.amount != null ? String(dup.amount) : null,
            adminNote: String(adminNote || "").slice(0, 2000)
          })
        }
      });

      syncOnlineMinerPolBalance(userId, Number(after.polBalance));

      try {
        const { createNotification } = await import("../controllers/notificationController.js");
        await createNotification({
          userId,
          title: "Saldo reposto (suporte)",
          message: `Foram creditados ${amt.toFixed(6)} POL na sua conta (repor saldo após análise — depósito on-chain já constava no registo).`,
          type: "success"
        });
      } catch (notifyErr) {
        console.error("creditPolManualSupportMigration replenish notification:", notifyErr);
      }

      return {
        mode: "replenish",
        depositTransactionId: dup.id,
        txHash: finalTxHash,
        polBalanceAfter: Number(after.polBalance)
      };
    }

    const newTx = await db.transaction.create({
      data: {
        userId,
        type: "deposit",
        amount: dec,
        txHash: finalTxHash,
        status: "completed",
        completedAt: new Date()
      }
    });

    const after = await db.user.update({
      where: { id: userId },
      data: { polBalance: { increment: dec } },
      select: { polBalance: true }
    });

    await db.auditLog.create({
      data: {
        userId,
        action: "admin_support_manual_pol_credit",
        ip: reqIp ? String(reqIp).slice(0, 128) : null,
        detailsJson: JSON.stringify({
          supportTicketId: ticketBacked ? supportTicketId : null,
          source: ticketBacked ? "support_ticket" : "admin_direct",
          amountPol: amt,
          txHash: finalTxHash,
          adminNote: String(adminNote || "").slice(0, 2000)
        })
      }
    });

    syncOnlineMinerPolBalance(userId, Number(after.polBalance));

    try {
      const { createNotification } = await import("../controllers/notificationController.js");
      await createNotification({
        userId,
        title: "Crédito de depósito (suporte)",
        message: `Foram creditados ${amt.toFixed(6)} POL na sua conta após análise do suporte.`,
        type: "success"
      });
    } catch (notifyErr) {
      console.error("creditPolManualSupportMigration notification:", notifyErr);
    }

    return {
      mode: "new_deposit",
      depositTransactionId: newTx.id,
      txHash: finalTxHash,
      polBalanceAfter: Number(after.polBalance)
    };
  });
}

/**
 * Crédito POL manual direto (sem ticket de suporte) — mesmo ledger que migração suporte.
 */
async function creditPolManualToUser({
  userId,
  amountPol,
  adminNote,
  reqIp,
  txHashOptional,
  replenishIfDepositExistsForUser = false
}) {
  return creditPolManualSupportMigration({
    userId,
    amountPol,
    supportTicketId: 0,
    txHashOptional,
    adminNote: String(adminNote || "Crédito manual admin").slice(0, 2000),
    reqIp,
    replenishIfDepositExistsForUser: Boolean(replenishIfDepositExistsForUser)
  });
}

const walletModel = {
  getUserBalance,
  saveWalletAddress,
  createDepositRequest,
  hasPendingWithdrawal,
  createWithdrawal,
  getTransactions,
  updateTransactionStatus,
  getPendingWithdrawals,
  getApprovedWithdrawals,
  failAllPendingWithdrawals,
  creditPolManualSupportMigration,
  creditPolManualToUser,
  WITHDRAW_MIN_POL,
  WITHDRAW_MAX_POL
};

export default walletModel;
export {
  getUserBalance,
  saveWalletAddress,
  createDepositRequest,
  hasPendingWithdrawal,
  createWithdrawal,
  getTransactions,
  updateTransactionStatus,
  getPendingWithdrawals,
  getApprovedWithdrawals,
  failAllPendingWithdrawals,
  creditPolManualSupportMigration,
  creditPolManualToUser,
  WITHDRAW_MIN_POL,
  WITHDRAW_MAX_POL
};
