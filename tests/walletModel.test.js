import { test, mock } from "node:test";
import assert from "node:assert/strict";
import prisma from "../server/src/db/prisma.js";
import * as walletModel from "../server/models/walletModel.js";
import { ethers } from "ethers";

test("walletModel.getUserBalance handles missing user", async () => {
  const oldFindUnique = prisma.user.findUnique;
  prisma.user.findUnique = async () => null;
  const balance = await walletModel.getUserBalance(999);
  assert.equal(balance.balance, 0);
  assert.equal(balance.lifetimeMined, 0);
  prisma.user.findUnique = oldFindUnique;
});

test("walletModel.saveWalletAddress updates user", async () => {
  const oldUpdate = prisma.user.update;
  let updated = false;
  prisma.user.update = async () => { updated = true; return {}; };
  const res = await walletModel.saveWalletAddress(1, "0xaddr");
  assert.equal(res, true);
  assert.equal(updated, true);
  prisma.user.update = oldUpdate;
});

test("walletModel.createDepositRequest - auto fetch amount and verify sender", async () => {
  const oldPrisma = { ...prisma };
  const oldEnv = { ...process.env };
  
  process.env.DEPOSIT_WALLET_ADDRESS = "0xdeposit";
  
  const getTransactionMock = mock.method(ethers.JsonRpcProvider.prototype, "getTransaction", async () => ({
    from: "0xuserwallet",
    to: "0xdeposit",
    chainId: 137n,
    value: ethers.parseEther("5.0"),
    hash: "0xhash"
  }));
  
  const getReceiptMock = mock.method(ethers.JsonRpcProvider.prototype, "getTransactionReceipt", async () => ({
    status: 1,
    blockNumber: 100
  }));

  let updatedBalance = 0;
  prisma.$transaction = async (cb) => {
    const tx = {
      transaction: {
        findFirst: async () => null,
        create: async (args) => ({ id: 1, ...args.data })
      },
      user: {
        findUnique: async () => ({ walletAddress: "0xuserwallet" }),
        update: async (args) => { 
          updatedBalance = args.data.polBalance.increment;
          return { id: 1 };
        }
      }
    };
    return cb(tx);
  };

  try {
    const result = await walletModel.createDepositRequest(1, null, "0xhash");
    assert.equal(result.amount, 5.0);
    assert.equal(updatedBalance, 5.0);
  } finally {
    Object.assign(prisma, oldPrisma);
    process.env = oldEnv;
    getTransactionMock.mock.restore();
    getReceiptMock.mock.restore();
  }
});

test("walletModel.createDepositRequest - error cases", async () => {
  const oldPrisma = { ...prisma };
  const oldEnv = { ...process.env };
  process.env.DEPOSIT_WALLET_ADDRESS = "0xdeposit";

  // 1. Missing txHash
  await assert.rejects(walletModel.createDepositRequest(1, 10, null), /TX Hash required/);

  // 2. Already used hash
  prisma.$transaction = async (cb) => cb({ transaction: { findFirst: async () => ({ id: 1 }) } });
  await assert.rejects(walletModel.createDepositRequest(1, 10, "0xhash"), /Transaction hash already used/);

  // 3. Invalid network/hash error
  mock.method(ethers.JsonRpcProvider.prototype, "getTransaction", async () => { throw new Error("Net Error"); });
  prisma.$transaction = async (cb) => cb({ transaction: { findFirst: async () => null } });
  await assert.rejects(
    () => walletModel.createDepositRequest(999, 50, "0xINVALID_HASH"),
    /Transaction not found/
  );

  // 4. Transaction not found
  mock.method(ethers.JsonRpcProvider.prototype, "getTransaction", async () => null);
  await assert.rejects(walletModel.createDepositRequest(1, 10, "0xhash"), /Transaction not found on the network/);

  // 5. Wrong deposit address
  mock.method(ethers.JsonRpcProvider.prototype, "getTransaction", async () => ({ to: "0xwrong", chainId: 137n }));
  await assert.rejects(walletModel.createDepositRequest(1, 10, "0xhash"), /Transaction was not sent to the correct deposit address/);

  // 6. Wrong chain ID
  mock.method(ethers.JsonRpcProvider.prototype, "getTransaction", async () => ({ to: "0xdeposit", chainId: 1n }));
  await assert.rejects(walletModel.createDepositRequest(1, 10, "0xhash"), /Transaction must be on Polygon Mainnet/);

  // 7. Amount mismatch
  mock.method(ethers.JsonRpcProvider.prototype, "getTransaction", async () => ({ to: "0xdeposit", chainId: 137n, value: ethers.parseEther("5.0"), from: "0xabc" }));
  prisma.$transaction = async (cb) => cb({ 
    transaction: { findFirst: async () => null }, 
    user: { findUnique: async () => ({ walletAddress: null }) } 
  });
  await assert.rejects(walletModel.createDepositRequest(1, 10, "0xhash"), /Transaction amount 5 is less than requested amount 10/);

  // 8. Zero/Negative value
  mock.method(ethers.JsonRpcProvider.prototype, "getTransaction", async () => ({ to: "0xdeposit", chainId: 137n, value: 0n, from: "0xabc" }));
  await assert.rejects(walletModel.createDepositRequest(1, null, "0xhash"), /Transaction value must be greater than zero/);

  // 9. Receipt status fail
  mock.method(ethers.JsonRpcProvider.prototype, "getTransaction", async () => ({ to: "0xdeposit", chainId: 137n, value: ethers.parseEther("1.0"), from: "0xabc" }));
  mock.method(ethers.JsonRpcProvider.prototype, "getTransactionReceipt", async () => ({ status: 0 }));
  await assert.rejects(walletModel.createDepositRequest(1, null, "0xhash"), /Transaction is not confirmed yet or has failed/);

  Object.assign(prisma, oldPrisma);
  process.env = oldEnv;
});

test("walletModel.createWithdrawal error cases", async () => {
  const oldPrisma = { ...prisma };
  
  // 1. Existing pending
  prisma.$transaction = async (cb) => cb({ transaction: { findFirst: async () => ({ id: 1 }) } });
  await assert.rejects(walletModel.createWithdrawal(1, 15, "0xaddr"), /Pending withdrawal exists/);

  // 2. Min amount
  prisma.$transaction = async (cb) => cb({ transaction: { findFirst: async () => null } });
  await assert.rejects(walletModel.createWithdrawal(1, 5, "0xaddr"), /Saque mínimo é 10 POL/);

  // 3. Insufficient balance
  prisma.$transaction = async (cb) => {
    return cb({
      transaction: { findFirst: async () => null },
      user: { findUnique: async () => ({ polBalance: { lt: (v) => true } }) }
    });
  };
  await assert.rejects(walletModel.createWithdrawal(1, 20, "0xaddr"), /Insufficient balance/);

  Object.assign(prisma, oldPrisma);
});

test("walletModel.getTransactions and updateTransactionStatus", async () => {
  const oldPrisma = { ...prisma };
  
  const oldFindMany = prisma.transaction.findMany;
  prisma.transaction.findMany = async () => [{ id: 1 }];
  const txs = await walletModel.getTransactions(1);
  assert.equal(txs.length, 1);

  // updateTransactionStatus - missing tx
  prisma.$transaction = async (cb) => cb({ transaction: { findUnique: async () => null } });
  const res1 = await walletModel.updateTransactionStatus(1, 'completed');
  assert.equal(res1, true);

  // updateTransactionStatus - withdrawal failure return funds
  let balanceIncremented = false;
  prisma.$transaction = async (cb) => {
    const tx = {
      transaction: { 
        findUnique: async () => ({ id: 1, type: 'withdrawal', status: 'pending', fundsReserved: true, userId: 1, amount: 10 }),
        update: async () => ({})
      },
      user: { update: async () => { balanceIncremented = true; } }
    };
    return cb(tx);
  };
  await walletModel.updateTransactionStatus(1, 'failed');
  assert.equal(balanceIncremented, true);

  // updateTransactionStatus - withdrawal completed
  prisma.$transaction = async (cb) => {
    const tx = {
      transaction: { 
        findUnique: async () => ({ id: 1, type: 'withdrawal', status: 'pending', fundsReserved: true, userId: 1, amount: 10 }),
        update: async () => ({})
      }
    };
    return cb(tx);
  };
  await walletModel.updateTransactionStatus(1, 'completed');

  prisma.transaction.findMany = oldFindMany;
  Object.assign(prisma, oldPrisma);
});

test("walletModel helper functions", async () => {
  const oldPrisma = { ...prisma };
  const oldFindMany = prisma.transaction.findMany;
  const oldFindFirst = prisma.transaction.findFirst;
  
  prisma.transaction.findMany = async () => [];
  prisma.transaction.findFirst = async () => null;
  
  assert.deepEqual(await walletModel.getPendingWithdrawals(), []);
  assert.deepEqual(await walletModel.getApprovedWithdrawals(), []);
  assert.ok(await walletModel.hasPendingWithdrawal(1) === false);
  
  // failAllPendingWithdrawals with a failure in updateTransactionStatus
  prisma.transaction.findMany = async () => [{ id: 1 }];
  prisma.$transaction = async (cb) => { throw new Error("Update failed"); };
  const res = await walletModel.failAllPendingWithdrawals();
  assert.equal(res.totalPending, 1);

  prisma.transaction.findMany = oldFindMany;
  prisma.transaction.findFirst = oldFindFirst;
  Object.assign(prisma, oldPrisma);
});

test("walletModel.getROIMetrics handles edge cases", async () => {
  const oldPrisma = { ...prisma };
  const oldTransaction = prisma.transaction;
  const oldMiningLog = prisma.miningLog;

  // Case 1: No data
  prisma.transaction = { ...oldTransaction, aggregate: async () => ({ _sum: { amount: 0 } }) };
  prisma.miningLog = { ...oldMiningLog, findMany: async () => [] };
  
  let metrics = await walletModel.getROIMetrics(1);
  assert.equal(metrics.totalDeposited, 0);
  assert.equal(metrics.daysToROI, null);

  // Case 2: Some data
  prisma.transaction = { ...oldTransaction, aggregate: async () => ({ _sum: { amount: 100 } }) };
  prisma.miningLog = { ...oldMiningLog, findMany: async () => [{ rewardAmount: 1 }, { rewardAmount: 1 }] };
  
  metrics = await walletModel.getROIMetrics(1);
  assert.equal(metrics.totalDeposited, 100);
  assert.equal(metrics.avgPoolReward, 1);
  assert.equal(metrics.estimatedDailyEarnings, 1 * 288);
  assert.equal(metrics.daysToROI, Number((100 / 288).toFixed(1)));

  prisma.transaction = oldTransaction;
  prisma.miningLog = oldMiningLog;
});
