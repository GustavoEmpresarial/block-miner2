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

/** Após mutar `pol_balance` na BD, alinha o minerador em RAM (evita persist periódico reverter compra/saque). */
export function syncOnlineMinerPolBalance(userId, polBalance) {
  if (!miningEngine || userId == null) return;
  const miner = miningEngine.findMinerByUserId(Number(userId));
  if (miner) miner.balance = Number(polBalance);
}
