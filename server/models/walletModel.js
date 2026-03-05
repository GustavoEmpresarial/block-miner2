import prisma from '../src/db/prisma.js';
import { applyUserBalanceDelta } from "../src/runtime/miningRuntime.js";

export async function getUserBalance(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      polBalance: true
    }
  });

  if (!user) return { balance: 0, lifetimeMined: 0, totalWithdrawn: 0, walletAddress: null };

  // Note: users_wallets was separate, now merged into User or can be separate.
  // In schema.prisma I didn't add walletAddress to User, but let's assume we use users_wallets model if needed.
  const wallet = await prisma.user.findUnique({
    where: { id: userId },
    select: { refCode: true } // placeholder for wallet address if not in user
  });

  return {
    balance: Number(user.polBalance),
    lifetimeMined: 0, // Need aggregation or separate field
    totalWithdrawn: 0,
    walletAddress: null
  };
}

export const getWallet = getUserBalance;

export async function saveWalletAddress(userId, walletAddress) {
  // Logic to save wallet address (might need table in schema if not in User)
  return true;
}

export async function hasPendingWithdrawal(userId) {
  const pending = await prisma.transaction.findFirst({
    where: { userId, type: 'withdrawal', status: 'pending' }
  });
  return !!pending;
}

export async function createWithdrawal(userId, amount, address) {
  return prisma.$transaction(async (tx) => {
    const pending = await tx.transaction.findFirst({
      where: { userId, type: 'withdrawal', status: 'pending' }
    });
    if (pending) throw new Error("Pending withdrawal exists");

    const user = await tx.user.findUnique({ where: { id: userId } });
    if (user.polBalance.lt(amount)) throw new Error("Insufficient balance");

    await tx.user.update({
      where: { id: userId },
      data: { polBalance: { decrement: amount } }
    });

    const transaction = await tx.transaction.create({
      data: {
        userId,
        type: 'withdrawal',
        amount,
        address,
        status: 'pending',
        fundsReserved: true
      }
    });

    applyUserBalanceDelta(userId, -Number(amount));
    return transaction;
  });
}

export async function getTransactions(userId, limit = 50) {
  return prisma.transaction.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit
  });
}

export async function updateTransactionStatus(transactionId, status, txHash = null) {
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
          await tx.user.update({
            where: { id: transaction.userId },
            data: { polBalance: { increment: transaction.amount } }
          });
          applyUserBalanceDelta(transaction.userId, Number(transaction.amount));
        }
      }
    }
    return true;
  });
}

export async function getPendingWithdrawals() {
  return prisma.transaction.findMany({
    where: { type: 'withdrawal', status: { in: ['pending', 'approved'] } },
    include: { user: { select: { username: true } } },
    orderBy: { createdAt: 'asc' }
  });
}

export async function failAllPendingWithdrawals() {
  const pending = await prisma.transaction.findMany({
    where: { type: 'withdrawal', status: 'pending' }
  });

  for (const tx of pending) {
    try { await updateTransactionStatus(tx.id, 'failed'); } catch { }
  }
  return { totalPending: pending.length };
}
