import { test } from "node:test";
import assert from "node:assert/strict";
import { setMiningEngine, getMiningEngine, applyUserBalanceDelta } from "../server/src/runtime/miningRuntime.js";

test("MiningEngineInstance getter/setter", () => {
  const mockEngine = { id: "mock" };
  setMiningEngine(mockEngine);
  assert.equal(getMiningEngine(), mockEngine);
  setMiningEngine(null);
  assert.equal(getMiningEngine(), null);
});

test("applyUserBalanceDelta updates miner balance", () => {
  const mockMiner = { userId: 1, balance: 100 };
  const mockEngine = {
    findMinerByUserId: (id) => (id === 1 ? mockMiner : null)
  };
  
  setMiningEngine(mockEngine);
  applyUserBalanceDelta(1, 50);
  assert.equal(mockMiner.balance, 150);
  
  applyUserBalanceDelta(1, -20);
  assert.equal(mockMiner.balance, 130);
  
  // Non-existent user
  applyUserBalanceDelta(2, 10);
  
  setMiningEngine(null);
});
