import prisma from '../src/db/prisma.js';
import { Prisma } from "@prisma/client";
import { syncOnlineMinerPolBalance } from "../src/runtime/miningRuntime.js";
import { ethers } from "ethers";
import { getValidatedDepositAddress } from "../utils/depositAddress.js";

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
    return BigInt(`0x${slice}`);
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
      // 3. Get transaction details from blockchain
      try {
        transaction = await provider.getTransaction(txHash);
      } catch (err) {
        throw new Error("Invalid transaction hash or network error.");
      }

      if (!transaction) {
        throw new Error("Transaction not found on the network. Make sure it's on Polygon Mainnet.");
      }

      // 4. Verify validations
      if (!transaction.to || transaction.to.toLowerCase() !== depositAddress.toLowerCase()) {
        throw new Error("Transaction was not sent to the correct deposit address.");
      }
      if (!transaction.from || transaction.from.toLowerCase() !== linkedWallet) {
        throw new Error("Transaction sender does not match your linked wallet.");
      }

      // Chain ID check (Polygon Mainnet is 137)
      if (transaction.chainId !== 137n && transaction.chainId !== 137) {
        throw new Error("Transaction must be on Polygon Mainnet (Chain ID 137).");
      }

      // Check amount with tolerance for floating point
      const txValueInPol = ethers.formatEther(transaction.value);
      if (parseFloat(txValueInPol) < parseFloat(amount) * 0.999) { // 0.1% tolerance
        throw new Error(`Transaction amount ${txValueInPol} is less than requested amount ${amount}.`);
      }

      const receipt = await provider.getTransactionReceipt(txHash);
      if (!receipt || receipt.status !== 1) {
        throw new Error("Transaction is not confirmed yet or has failed on-chain.");
      }

      // Check minimum confirmations for safer crediting
      const currentBlock = await provider.getBlockNumber();
      const confirmations = Math.max(0, currentBlock - receipt.blockNumber);
      if (confirmations < DEPOSIT_MIN_CONFIRMATIONS) {
        throw new Error(`Transaction has ${confirmations} confirmations. Minimum required: ${DEPOSIT_MIN_CONFIRMATIONS}.`);
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
  WITHDRAW_MIN_POL,
  WITHDRAW_MAX_POL
};
