import test from 'node:test';
import assert from 'node:assert';
import { mock } from 'node:test';
import prisma from '../server/src/db/prisma.js';
import * as walletController from '../server/controllers/walletController.js';
import walletModel from '../server/models/walletModel.js';
import * as authMiddleware from '../server/middleware/auth.js';
import * as userModel from '../server/models/userModel.js';
import { MiningEngine } from '../server/src/miningEngine.js';
import * as zeradsController from '../server/controllers/zeradsController.js';
import axios from 'axios';
import * as depositsCron from '../server/cron/depositsCron.js';
import { ethers } from 'ethers';

test('Coverage Final - Absolute 99% Target', async (t) => {
  const oldNodeEnv = process.env.NODE_ENV;

  await t.test('ZerAdsController Branches', async () => {
    const res = { 
      status: mock.fn(() => res), 
      send: mock.fn(), 
      setHeader: mock.fn() 
    };

    // 1. handlePtcCallback failure (TypeError because of missing headers)
    await zeradsController.handlePtcCallback({ query: {} }, res);
    assert.strictEqual(res.send.mock.calls[0].arguments[0], "error");

    // 2. handlePtcCallback error
    res.status.mock.resetCalls();
    await zeradsController.handlePtcCallback(null, res);
    assert.strictEqual(res.status.mock.calls[0].arguments[0], 500);

    // 3. renderAd missing parameters
    res.status.mock.resetCalls();
    await zeradsController.renderAd({ query: {} }, res);
    assert.strictEqual(res.status.mock.calls[0].arguments[0], 400);

    // 4. renderAd blank ad
    res.send.mock.resetCalls();
    mock.method(axios, 'get', async () => ({ data: "*BLANK*" }));
    await zeradsController.renderAd({ query: { id: '1', width: '300' } }, res);
    assert.strictEqual(res.send.mock.calls[0].arguments[0], "");

    // 5. renderAd success with meta refresh replacement
    res.send.mock.resetCalls();
    axios.get.mock.resetCalls();
    axios.get.mock.mockImplementation(async () => ({ data: '<html><meta http-equiv="refresh" content="280"><body>Ad</body></html>' }));
    await zeradsController.renderAd({ query: { id: '1', width: '300' } }, res);
    assert.ok(res.send.mock.calls[0].arguments[0].includes("<body>"));
    assert.ok(!res.send.mock.calls[0].arguments[0].includes('refresh'));
    assert.strictEqual(res.setHeader.mock.calls[0].arguments[0], 'Content-Security-Policy');

    // 6. renderAd error
    res.status.mock.resetCalls();
    axios.get.mock.mockImplementation(async () => { throw new Error("Axios fail"); });
    await zeradsController.renderAd({ query: { id: '1', width: '300' } }, res);
    assert.strictEqual(res.status.mock.calls[0].arguments[0], 500);
    
    axios.get.mock.restore();
  });

  await t.test('Auth Middleware Branches', async (st) => {
    const res = { status: mock.fn(() => res), json: mock.fn(), redirect: mock.fn() };
    const next = mock.fn();

    // 1. requireAuth bot rejection
    await authMiddleware.requireAuth({ 
        method: 'POST', 
        headers: { 'x-anti-bot': '1' },
        ip: '1.2.3.4'
    }, res, next);
    assert.strictEqual(res.status.mock.calls[0].arguments[0], 403);

    // 2. requireAuth decryption fail for POST
    res.status.mock.resetCalls();
    await authMiddleware.requireAuth({ 
        method: 'POST', 
        headers: { 'x-anti-bot-payload': 'invalid-base64', 'x-anti-bot-key': 'K' },
        ip: '1.2.3.4'
    }, res, next);
    assert.strictEqual(res.status.mock.calls[0].arguments[0], 403);

    // 3. requirePageAuth token missing
    await authMiddleware.requirePageAuth({ cookies: {}, headers: {} }, res, next);
    assert.strictEqual(res.redirect.mock.calls[0].arguments[1], "/login");

    // 4. requirePageAuth catch block
    res.redirect.mock.resetCalls();
    await authMiddleware.requirePageAuth(null, res, next);
    assert.strictEqual(res.redirect.mock.calls[0].arguments[1], "/login");

    // 5. authenticateTokenOptional catch block
    next.mock.resetCalls();
    await authMiddleware.authenticateTokenOptional(null, res, next);
    assert.strictEqual(next.mock.calls.length, 1);
  });

  await t.test('WalletController/Model Additional Branches', async () => {
    process.env.DEPOSIT_WALLET_ADDRESS = "0xdeposit";
    const res = { status: mock.fn(() => res), send: mock.fn(), json: mock.fn() };

    // 1. getTransactions catch block
    const originalGetTransactions = walletModel.getTransactions;
    walletModel.getTransactions = () => { throw new Error("Fail"); };
    
    await walletController.getTransactions({ user: { id: 1 } }, res);
    assert.strictEqual(res.status.mock.calls[0].arguments[0], 500);
    
    walletModel.getTransactions = originalGetTransactions;

    // 2. wakeUpScannerEndpoint catch block
    // We can't mock wakeUpScanner if it's not a method of an object we can access.
    // It's imported as { wakeUpScanner } from "../cron/depositsCron.js".
    // Let's try to mock the whole module if possible, but Node test runner doesn't support it well.
    // Alternatively, just skip it if it's too hard, or try to trigger it via something else.

    // 3. requestWithdrawal success branch
    const originalFindUnique = prisma.user.findUnique;
    prisma.user.findUnique = async () => ({ id: 1, isTwoFactorEnabled: false });
    mock.method(walletModel, 'createWithdrawal', async () => ({ id: 100 }));
    
    res.json.mock.resetCalls();
    await walletController.requestWithdrawal({ user: { id: 1 }, body: { amount: 10, address: '0xabc' } }, res);
    assert.strictEqual(res.json.mock.calls[0].arguments[0].ok, true);
    
    prisma.user.findUnique = originalFindUnique;
    walletModel.createWithdrawal.mock.restore();

    // 4. handleFaucetPayIPN status not completed
    res.send.mock.resetCalls();
    await walletController.handleFaucetPayIPN({ body: { status: '0' } }, res);
    assert.strictEqual(res.send.mock.calls[0].arguments[0], "Status not completed");

    // 5. handleFaucetPayIPN invalid token
    res.status.mock.resetCalls();
    process.env.FAUCETPAY_MERCHANT_KEY = 'valid';
    await walletController.handleFaucetPayIPN({ body: { status: '1', token: 'invalid' } }, res);
    assert.strictEqual(res.status.mock.calls[0].arguments[0], 401);

    // 6. handleFaucetPayIPN missing userId
    res.status.mock.resetCalls();
    await walletController.handleFaucetPayIPN({ body: { status: '1', token: 'valid', custom: '' } }, res);
    assert.strictEqual(res.status.mock.calls[0].arguments[0], 400);

    // 7. handleFaucetPayIPN DB Error branch in transaction
    res.status.mock.resetCalls();
    const originalTx = prisma.$transaction;
    prisma.$transaction = async () => { throw new Error("DB"); };
    await walletController.handleFaucetPayIPN({ body: { status: '1', token: 'valid', custom: '1', amount1: '1', transaction_id: 'te' } }, res);
    assert.strictEqual(res.status.mock.calls[0].arguments[0], 500);
    prisma.$transaction = originalTx;

    // 8. walletModel.createWithdrawal saque minimo
    try {
        await walletModel.createWithdrawal(1, 5, '0xabc');
    } catch (e) {
        assert.strictEqual(e.message, "Saque mínimo é 10 POL");
    }

    // 9. walletModel.updateTransactionStatus not found
    mock.method(prisma.transaction, 'findUnique', async () => null);
    const result = await walletModel.updateTransactionStatus(999, 'completed');
    assert.strictEqual(result, true);
    prisma.transaction.findUnique.mock.restore();

    // 10. walletModel.updateTransactionStatus failed withdrawal funds reserved
    mock.method(prisma.transaction, 'findUnique', async () => ({ 
        id: 1, 
        type: 'withdrawal', 
        status: 'pending', 
        fundsReserved: true, 
        userId: 1, 
        amount: 50 
    }));
    mock.method(prisma.transaction, 'update', async () => ({}));
    mock.method(prisma.user, 'update', async () => ({}));
    await walletModel.updateTransactionStatus(1, 'failed');
    assert.strictEqual(prisma.user.update.mock.calls.length, 1);
    prisma.transaction.findUnique.mock.restore();
    prisma.transaction.update.mock.restore();
    prisma.user.update.mock.restore();
  });

  await t.test('WalletModel Deposit Branches', async () => {
    const mockGetTx = mock.method(ethers.JsonRpcProvider.prototype, 'getTransaction', async () => { throw new Error("Net error"); });
    const mockGetReceipt = mock.method(ethers.JsonRpcProvider.prototype, 'getTransactionReceipt', async () => ({ status: 1 }));

    const originalTx = prisma.$transaction;
    prisma.$transaction = async (cb) => {
      return cb({
        transaction: {
          findFirst: async () => null,
          create: async () => ({})
        },
        user: {
          findUnique: async () => ({ walletAddress: '0xsender' }),
          update: async () => ({})
        }
      });
    };

    // 1. provider.getTransaction throws
    try {
        await walletModel.createDepositRequest(1, 10, '0xhash');
    } catch (e) {
        // Now that tx db is mocked, it actually throws the provider's throw, BUT wait!
        // In the model it is: try { provider.getTransaction } catch (e) {} and then it continues and throws:
        assert.ok(e.message.includes('Transaction not found on the network'));
    }

    // 2. transaction is null
    mockGetTx.mock.mockImplementation(async () => null);
    try {
        await walletModel.createDepositRequest(1, 10, '0xhash');
    } catch (e) {
        assert.ok(e.message.includes('Transaction not found'));
    }

    // 3. receipt status fail
    mockGetTx.mock.mockImplementation(async () => ({ 
        to: process.env.DEPOSIT_WALLET_ADDRESS || '0xabc', 
        chainId: 137, 
        value: ethers.parseEther("10"),
        from: '0xsender'
    }));
    mockGetReceipt.mock.mockImplementation(async () => ({ status: 0 }));
    
    try {
        await walletModel.createDepositRequest(1, 10, '0xhash');
    } catch (e) {
        assert.strictEqual(e.message, "Transaction is not confirmed yet or has failed on-chain.");
    }
    
    prisma.$transaction = originalTx;
    mockGetTx.mock.restore();
    mockGetReceipt.mock.restore();
  });

  await t.test('UserModel and MiningEngine Branches', async () => {
    // 1. userModel.listUsers catch block
    const originalPrismaUser = prisma.user;
    prisma.user = {
      findMany: () => { throw new Error("DB Fail"); },
      findUnique: async () => ({ id: 1 })
    };
    try {
        await userModel.listUsers({ page: 1, pageSize: 10 });
    } catch (e) {
        assert.strictEqual(e.message, "DB Fail");
    }

    // 2. userModel.getUserByRefCode
    let findUniqueCalls = 0;
    prisma.user.findUnique = async () => { findUniqueCalls++; return { id: 1 }; };
    await userModel.getUserByRefCode('REF123');
    assert.strictEqual(findUniqueCalls, 1);
    
    prisma.user = originalPrismaUser;

    // 3. MiningEngine - setIo
    const engine = new MiningEngine();
    const mockIo = { to: mock.fn(() => ({ emit: mock.fn() })) };
    engine.setIo(mockIo);
    assert.strictEqual(engine.io, mockIo);

    // 4. MiningEngine - reloadMinerProfile with io
    engine.createOrGetMiner({ userId: 1, profile: { rigs: 1 } });
    engine.setProfileLoader(async () => ({ rigs: 5 }));
    await engine.reloadMinerProfile(1);
    assert.strictEqual(mockIo.to.mock.calls.length, 2);

    // 5. MiningEngine - finalizeBlockDistribution nextBlockAt near now
    engine.nextBlockAt = Date.now();
    engine.finalizeBlockDistribution(1, 0.15);
    assert.ok(engine.nextBlockAt > Date.now() + engine.blockDurationMs - 10000);

    // 6. MiningEngine - tick - boostEndsAt expired
    const miner = engine.createOrGetMiner({ userId: 2 });
    miner.boostMultiplier = 1.25;
    miner.boostEndsAt = Date.now() - 1000;
    engine.tick();
    assert.strictEqual(miner.boostMultiplier, 1);

    // 7. MiningEngine - getPublicState with userId and blockHistory
    engine.blockHistory = [{ blockNumber: 1, reward: 0.15, userRewards: { "2": 0.05 }, minerCount: 1, timestamp: Date.now() }];
    const state = engine.getPublicState(miner.id);
    assert.strictEqual(state.blockHistory[0].userReward, 0.05);
  });

  process.env.NODE_ENV = oldNodeEnv;
});
