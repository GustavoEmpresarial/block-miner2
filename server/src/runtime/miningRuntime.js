let miningEngine = null;

export function setMiningEngine(engine) {
  miningEngine = engine;
}

export function getMiningEngine() {
  return miningEngine;
}

export function applyUserBalanceDelta(userId, delta) {
  if (!miningEngine) return;
  const miner = miningEngine.findMinerByUserId(userId);
  if (miner) {
    miner.balance += delta;
  }
}
