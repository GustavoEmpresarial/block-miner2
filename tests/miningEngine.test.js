import { test, mock } from "node:test";
import assert from "node:assert/strict";

import { MiningEngine } from "../server/src/miningEngine.js";

test("MiningEngine - Constructor defaults", () => {
  const engine = new MiningEngine();
  assert.equal(engine.tokenSymbol, "POL");
  assert.equal(engine.blockNumber, 1);
  assert.ok(engine.blockDurationMs > 0);
});

test("MiningEngine - createOrGetMiner", () => {
  const engine = new MiningEngine();
  const userId = 123;
  const m1 = engine.createOrGetMiner({ userId, username: "user1" });
  assert.ok(m1.id);
  assert.equal(m1.userId, userId);
  assert.equal(m1.username, "user1");

  const m2 = engine.createOrGetMiner({ userId, username: "user1-updated" });
  assert.equal(m1.id, m2.id);
  assert.equal(m2.username, "user1-updated");
});

test("MiningEngine - findMinerByUserId", () => {
  const engine = new MiningEngine();
  assert.equal(engine.findMinerByUserId(null), null);
  engine.createOrGetMiner({ userId: 1 });
  assert.ok(engine.findMinerByUserId(1));
});

test("MiningEngine - reloadMinerProfile", async () => {
  const engine = new MiningEngine();
  const userId = 1;
  engine.createOrGetMiner({ userId, profile: { rigs: 1, baseHashRate: 10, balance: 5 } });
  
  engine.setProfileLoader(async (uid) => {
    if (uid === userId) return { rigs: 5, base_hash_rate: 50, balance: 100, refCode: "REF", referralCount: 10 };
    return null;
  });

  await engine.reloadMinerProfile(userId);
  const miner = engine.findMinerByUserId(userId);
  assert.equal(miner.rigs, 5);
  assert.equal(miner.baseHashRate, 50);
  assert.equal(miner.balance, 100);
  assert.equal(miner.refCode, "REF");
});

test("MiningEngine - reloadMinerProfile handles missing loaders or missing user", async () => {
  const engine = new MiningEngine();
  // No loader
  await engine.reloadMinerProfile(1);
  
  engine.setProfileLoader(async () => null);
  await engine.reloadMinerProfile(1);
  
  engine.setProfileLoader(async () => ({ balance: 100 }));
  // No miner in engine
  await engine.reloadMinerProfile(1);
  assert.equal(engine.findMinerByUserId(1), null);
});

test("MiningEngine - setConnected / setActive / setWallet", () => {
  const engine = new MiningEngine();
  const m = engine.createOrGetMiner({ userId: 1 });
  
  engine.setConnected(m.id, false);
  assert.equal(m.connected, false);
  
  engine.setActive(m.id, false);
  assert.equal(m.active, false);
  
  engine.setWallet(m.id, "0x123");
  assert.equal(m.walletAddress, "0x123");
  
  assert.equal(engine.setActive("non-existent", true), null);
  assert.equal(engine.setWallet("non-existent", "0x123"), null);
});

test("MiningEngine - applyBoost", () => {
  const engine = new MiningEngine();
  const m = engine.createOrGetMiner({ userId: 1, profile: { balance: 1 } });
  
  const res = engine.applyBoost(m.id);
  assert.equal(res.ok, true);
  assert.equal(m.boostMultiplier, 1.25);
  assert.ok(m.balance < 1);

  const fail = engine.applyBoost("wrong");
  assert.equal(fail.ok, false);

  m.balance = 0;
  const failBalance = engine.applyBoost(m.id);
  assert.equal(failBalance.ok, false);
});

test("MiningEngine - upgradeRig", () => {
  const engine = new MiningEngine();
  const m = engine.createOrGetMiner({ userId: 1, profile: { balance: 10, rigs: 1, baseHashRate: 10 } });
  
  const res = engine.upgradeRig(m.id);
  assert.equal(res.ok, true);
  assert.equal(m.rigs, 2);
  assert.equal(m.baseHashRate, 28);

  const fail = engine.upgradeRig("wrong");
  assert.equal(fail.ok, false);

  m.balance = 0;
  const failBalance = engine.upgradeRig(m.id);
  assert.equal(failBalance.ok, false);
});

test("MiningEngine - distributeRewards (with zero work)", () => {
  const engine = new MiningEngine();
  engine.createOrGetMiner({ userId: 1 });
  engine.distributeRewards();
  assert.equal(engine.blockNumber, 2);
  assert.equal(engine.lastReward, 0);
});

test("MiningEngine - distributeRewards (persistence failure)", async () => {
  const engine = new MiningEngine();
  const m = engine.createOrGetMiner({ userId: 1, profile: { balance: 0, lifetimeMined: 0 } });
  engine.roundWork.set(m.id, 100);
  
  engine.setPersistBlockRewardsCallback(async () => {
    throw new Error("DB Error");
  });

  engine.distributeRewards();
  
  await new Promise(r => setTimeout(r, 10));
  
  assert.equal(m.balance, 0, "Balance should be rolled back");
  assert.equal(m.lifetimeMined, 0, "Lifetime should be rolled back");
});

test("MiningEngine - distributeRewards with non-existent miner in roundWork", () => {
  const engine = new MiningEngine();
  engine.roundWork.set("ghost", 100);
  engine.distributeRewards();
  assert.equal(engine.roundWork.get("ghost"), 0);
});

test("MiningEngine - finalizeBlockDistribution handles logReward failure", () => {
  const engine = new MiningEngine();
  engine.setRewardLogger(() => { throw new Error("Logger fail"); });
  engine.finalizeBlockDistribution(1, 0.15);
});

test("MiningEngine - tick logic and transitions", () => {
  const engine = new MiningEngine();
  const m = engine.createOrGetMiner({ userId: 1, profile: { baseHashRate: 10 } });
  
  const initialWork = engine.roundWork.get(m.id) || 0;
  engine.tick();
  assert.ok((engine.roundWork.get(m.id) || 0) > initialWork);

  engine.nextBlockAt = Date.now() - 1000; 
  engine.tick();
  assert.equal(engine.blockNumber, 2);
});

test("MiningEngine - drift correction", () => {
  const engine = new MiningEngine();
  engine.createOrGetMiner({ userId: 1, profile: { baseHashRate: 10 } });
  
  engine.nextBlockAt = Date.now() + 100 * 60 * 1000; // 100 min in future
  engine.tick();
  assert.ok(Math.abs(engine.nextBlockAt - Date.now()) <= engine.blockDurationMs + 5000);
});

test("MiningEngine - referral fields in public state", () => {
  const engine = new MiningEngine();
  const userId = 1;
  const m = engine.createOrGetMiner({ 
    userId, 
    profile: { referralCount: 5, refCode: "MYREF123" } 
  });
  
  const state = engine.getPublicState(m.id);
  assert.equal(state.miner.referralCount, 5);
  assert.equal(state.miner.refCode, "MYREF123");
});

test("MiningEngine - getPublicState", () => {
  const engine = new MiningEngine();
  const m = engine.createOrGetMiner({ userId: 1 });
  
  const state = engine.getPublicState(m.id);
  assert.equal(state.miner.id, m.id);
  assert.ok(state.leaderboard.length >= 0);
  
  const guestState = engine.getPublicState(null);
  assert.equal(guestState.miner, null);
});
