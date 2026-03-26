import { test } from "node:test";
import assert from "node:assert/strict";

import { MiningEngine } from "../server/src/miningEngine.js";

test("MiningEngine.distributeRewards distributes proportionally", () => {
  const engine = new MiningEngine();
  const minerA = engine.createOrGetMiner({ userId: 101, username: "alpha", profile: { rigs: 1, baseHashRate: 10 } });
  const minerB = engine.createOrGetMiner({ userId: 202, username: "beta", profile: { rigs: 1, baseHashRate: 20 } });

  engine.roundWork.set(minerA.id, 100);
  engine.roundWork.set(minerB.id, 300);
  engine.activeMiners = 2;

  let persistedPayload = null;
  engine.setPersistBlockRewardsCallback((payload) => { persistedPayload = payload; });

  engine.distributeRewards();

  assert.ok(Math.abs(minerA.balance - 0.0375) < 1e-12);
  assert.ok(Math.abs(minerB.balance - 0.1125) < 1e-12);
  assert.equal(engine.blockNumber, 2);
  assert.equal(engine.lastReward, 0.15);
  assert.ok(persistedPayload);
  assert.equal(persistedPayload.minerRewards.length, 2);
  assert.deepEqual(
    persistedPayload.minerRewards.map((row) => row.userId).sort((a, b) => a - b),
    [101, 202]
  );
});

test("MiningEngine.distributeRewards handles zero-work round", () => {
  const engine = new MiningEngine();
  const miner = engine.createOrGetMiner({ userId: 303, username: "idle", profile: { rigs: 1, baseHashRate: 0 } });

  engine.roundWork.set(miner.id, 0);
  engine.activeMiners = 0;

  engine.distributeRewards();

  assert.equal(miner.balance, 0);
  assert.equal(engine.lastReward, 0);
  assert.equal(engine.blockNumber, 2);
});
