import { test, mock } from "node:test";
import assert from "node:assert/strict";
import prisma from "../server/src/db/prisma.js";
import walletModel from "../server/models/walletModel.js";

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

test("walletModel.createDepositRequest - requires amount and txHash", async () => {
  // null amount → rejects
  await assert.rejects(
    () => walletModel.createDepositRequest(1, null, "0xhash"),
    /Amount and TX Hash required/
  );
  // null txHash → rejects
  await assert.rejects(
    () => walletModel.createDepositRequest(1, 10, null),
    /Amount and TX Hash required/
  );
});

test("walletModel.createDepositRequest - success in test mode", async () => {
  const oldTx = prisma.$transaction;
  const oldEnv = process.env.DEPOSIT_WALLET_ADDRESS;
  const oldNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
  process.env.DEPOSIT_WALLET_ADDRESS = "0x742D35CC6634C0532925a3B844Bc9E7595F2bD18";

  let createdData = null;
  let incrementedAmount = null;
  prisma.$transaction = async (cb) => {
    const tx = {
      user: {
        findUnique: async () => ({ id: 1, walletAddress: "0xuserwallet" }),
        update: async (args) => {
          incrementedAmount = args.data.polBalance.increment;
          return { polBalance: 15 };
        }
      },
      transaction: {
        findFirst: async () => null,
        create: async (args) => { createdData = args.data; return { id: 1, ...args.data }; }
      },
      $executeRaw: async () => {}
    };
    return cb(tx);
  };

  try {
    const result = await walletModel.createDepositRequest(1, 5, "0xhash");
    assert.equal(createdData.amount, 5);
    assert.equal(createdData.type, "deposit");
    assert.equal(incrementedAmount, 5);
  } finally {
    prisma.$transaction = oldTx;
    process.env.DEPOSIT_WALLET_ADDRESS = oldEnv;
    process.env.NODE_ENV = oldNodeEnv;
  }
});

test("walletModel.createDepositRequest - duplicate txHash", async () => {
  const oldTx = prisma.$transaction;
  const oldEnv = process.env.DEPOSIT_WALLET_ADDRESS;
  const oldNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
  process.env.DEPOSIT_WALLET_ADDRESS = "0x742D35CC6634C0532925a3B844Bc9E7595F2bD18";

  prisma.$transaction = async (cb) => {
    const tx = {
      user: { findUnique: async () => ({ id: 1, walletAddress: "0xwallet" }) },
      transaction: { findFirst: async () => ({ id: 1 }) },
      $executeRaw: async () => {}
    };
    return cb(tx);
  };

  await assert.rejects(
    () => walletModel.createDepositRequest(1, 10, "0xhash"),
    /Transaction hash already used/
  );

  prisma.$transaction = oldTx;
  process.env.DEPOSIT_WALLET_ADDRESS = oldEnv;
  process.env.NODE_ENV = oldNodeEnv;
});

test("walletModel.createWithdrawal error cases", async () => {
  const oldTx = prisma.$transaction;
  
  // 1. Existing pending
  prisma.$transaction = async (cb) => cb({
    transaction: { findFirst: async () => ({ id: 1 }) },
    user: { findUnique: async () => ({ polBalance: { lt: () => false } }) }
  });
  await assert.rejects(walletModel.createWithdrawal(1, 15, "0xaddr"), /Pending withdrawal exists/);

  // 2. Min amount
  await assert.rejects(walletModel.createWithdrawal(1, 5, "0xaddr"), /Saque mínimo é 10 POL/);

  // 3. Insufficient balance
  prisma.$transaction = async (cb) => cb({
    transaction: { findFirst: async () => null },
    user: { findUnique: async () => ({ polBalance: { lt: () => true } }) }
  });
  await assert.rejects(walletModel.createWithdrawal(1, 20, "0xaddr"), /Insufficient balance/);

  prisma.$transaction = oldTx;
});

test("walletModel.getTransactions and updateTransactionStatus", async () => {
  const oldFindMany = prisma.transaction.findMany;
  const oldTx = prisma.$transaction;
  
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
      user: { update: async () => { balanceIncremented = true; return { polBalance: 110 }; } }
    };
    return cb(tx);
  };
  await walletModel.updateTransactionStatus(1, 'failed');
  assert.equal(balanceIncremented, true);

  // updateTransactionStatus - withdrawal completed (needs user.update for potential refund logic)
  prisma.$transaction = async (cb) => {
    const tx = {
      transaction: { 
        findUnique: async () => ({ id: 1, type: 'withdrawal', status: 'pending', fundsReserved: true, userId: 1, amount: 10 }),
        update: async () => ({})
      },
      user: { update: async () => ({ polBalance: 0 }) }
    };
    return cb(tx);
  };
  await walletModel.updateTransactionStatus(1, 'completed');

  prisma.transaction.findMany = oldFindMany;
  prisma.$transaction = oldTx;
});

test("walletModel helper functions", async () => {
  const oldFindMany = prisma.transaction.findMany;
  const oldFindFirst = prisma.transaction.findFirst;
  const oldTx = prisma.$transaction;
  
  prisma.transaction.findMany = async () => [];
  prisma.transaction.findFirst = async () => null;
  
  assert.deepEqual(await walletModel.getPendingWithdrawals(), []);
  assert.deepEqual(await walletModel.getApprovedWithdrawals(), []);
  assert.ok(await walletModel.hasPendingWithdrawal(1) === false);
  
  // failAllPendingWithdrawals with a failure in updateTransactionStatus
  prisma.transaction.findMany = async () => [{ id: 1 }];
  prisma.$transaction = async () => { throw new Error("Update failed"); };
  const res = await walletModel.failAllPendingWithdrawals();
  assert.equal(res.totalPending, 1);

  prisma.transaction.findMany = oldFindMany;
  prisma.transaction.findFirst = oldFindFirst;
  prisma.$transaction = oldTx;
});
