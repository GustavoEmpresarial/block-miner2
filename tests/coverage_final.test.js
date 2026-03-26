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

test('Coverage Final - Absolute 99% Target', async (t) => {
  const oldNodeEnv = process.env.NODE_ENV;

  await t.test('ZerAdsController Branches', async () => {
    const res = { 
      status: mock.fn(() => res), 
      send: mock.fn(), 
      setHeader: mock.fn(),
      json: mock.fn()
    };

    // 1. handlePtcCallback with missing payload params
    await zeradsController.handlePtcCallback({ query: {}, body: {} }, res);
    assert.strictEqual(res.status.mock.calls[0].arguments[0], 400);

    // 2. handlePtcCallback error
    res.status.mock.resetCalls();
    res.send.mock.resetCalls();
    await zeradsController.handlePtcCallback(null, res);
    assert.strictEqual(res.status.mock.calls[0]?.arguments[0], 500);

    // 3. getPtcLink success
    res.json.mock.resetCalls();
    await zeradsController.getPtcLink({ user: { id: 1 } }, res);
    assert.strictEqual(res.json.mock.calls[0].arguments[0].ok, true);
  });

  await t.test('Auth Middleware Branches', async () => {
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

    // 3. authenticateTokenOptional catch block
    next.mock.resetCalls();
    const reqBad = {};
    Object.defineProperty(reqBad, 'headers', { get() { throw new Error("DB Error"); } });
    await authMiddleware.authenticateTokenOptional(reqBad, res, next);
    assert.strictEqual(next.mock.calls.length, 1);
  });

  await t.test('WalletController/Model Additional Branches', async () => {
    const res = { status: mock.fn(() => res), send: mock.fn(), json: mock.fn() };

    // 1. getTransactions catch block
    const originalGetTransactions = walletModel.getTransactions;
    walletModel.getTransactions = () => { throw new Error("Fail"); };
    
    await walletController.getTransactions({ user: { id: 1 } }, res);
    assert.strictEqual(res.status.mock.calls[0].arguments[0], 500);
    
    walletModel.getTransactions = originalGetTransactions;

    // 2. requestWithdrawal with invalid address
    res.status.mock.resetCalls();
    res.json.mock.resetCalls();
    await walletController.requestWithdrawal({ user: { id: 1 }, body: { amount: 10, address: '0xabc' } }, res);
    assert.strictEqual(res.status.mock.calls[0].arguments[0], 400);

    // 3. requestWithdrawal missing fields
    res.status.mock.resetCalls();
    await walletController.requestWithdrawal({ user: { id: 1 }, body: {} }, res);
    assert.strictEqual(res.status.mock.calls[0].arguments[0], 400);

    // 4. walletModel.createWithdrawal saque minimo
    const oldTx = prisma.$transaction;
    prisma.$transaction = async (cb) => cb({ transaction: { findFirst: async () => null } });
    try {
      await walletModel.createWithdrawal(1, 5, '0xabc');
    } catch (e) {
      assert.ok(e.message.includes("mínimo") || e.message.includes("10"));
    }
    prisma.$transaction = oldTx;
  });

  await t.test('UserModel and MiningEngine Branches', async () => {
    // 1. userModel.listUsers catch block
    const originalFindMany = prisma.user.findMany;
    const originalCount = prisma.user.count;
    prisma.user.findMany = () => { throw new Error("DB Fail"); };
    prisma.user.count = async () => 0;
    try {
      await userModel.listUsers({ page: 1, pageSize: 10 });
    } catch (e) {
      assert.strictEqual(e.message, "DB Fail");
    }
    prisma.user.findMany = originalFindMany;
    prisma.user.count = originalCount;

    // 2. MiningEngine - setIo
    const engine = new MiningEngine();
    const mockIo = { to: mock.fn(() => ({ emit: mock.fn() })) };
    engine.setIo(mockIo);
    assert.strictEqual(engine.io, mockIo);

    // 3. MiningEngine - reloadMinerProfile with io
    engine.createOrGetMiner({ userId: 1, profile: { rigs: 1 } });
    engine.setProfileLoader(async () => ({ rigs: 5 }));
    await engine.reloadMinerProfile(1);
    assert.strictEqual(mockIo.to.mock.calls.length, 2);

    // 4. MiningEngine - finalizeBlockDistribution
    engine.nextBlockAt = Date.now();
    engine.finalizeBlockDistribution(1, 0.15);
    assert.ok(engine.nextBlockAt > Date.now() + engine.blockDurationMs - 10000);

    // 5. MiningEngine - tick - boostEndsAt expired
    const miner = engine.createOrGetMiner({ userId: 2 });
    miner.boostMultiplier = 1.25;
    miner.boostEndsAt = Date.now() - 1000;
    engine.tick();
    assert.strictEqual(miner.boostMultiplier, 1);

    // 6. MiningEngine - getPublicState with userId and blockHistory
    engine.blockHistory = [{ blockNumber: 1, reward: 0.15, userRewards: { "2": 0.05 }, minerCount: 1, timestamp: Date.now() }];
    const state = engine.getPublicState(miner.id);
    assert.strictEqual(state.blockHistory[0].userReward, 0.05);
  });

  process.env.NODE_ENV = oldNodeEnv;
});
