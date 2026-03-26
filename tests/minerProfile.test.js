import { test, mock } from "node:test";
import assert from "node:assert/strict";
import prisma from "../server/src/db/prisma.js";
import * as minerProfileModel from "../server/models/minerProfileModel.js";

test("getOrCreateMinerProfile handles missing user", async () => {
  const original = prisma.user.findUnique;
  prisma.user.findUnique = async () => null;
  try {
    const res = await minerProfileModel.getOrCreateMinerProfile({ id: 999 });
    assert.equal(res, null);
  } finally {
    prisma.user.findUnique = original;
  }
});

test("getOrCreateMinerProfile generates refCode if missing", async () => {
  const originalFindUnique = prisma.user.findUnique;
  const originalUpdate = prisma.user.update;
  const originalUserMinerFindMany = prisma.userMiner.findMany;
  const originalUserInventoryCount = prisma.userInventory.count;
  const originalUserPowerGameFindMany = prisma.userPowerGame.findMany;
  const originalYoutubeWatchPowerFindMany = prisma.youtubeWatchPower.findMany;
  const originalAutoMiningGpuFindMany = prisma.autoMiningGpu.findMany;

  let updateCalled = false;
  prisma.user.findUnique = async () => ({
    id: 1, username: "test", polBalance: 10, refCode: null,
    _count: { referrals: 0 }
  });
  prisma.user.update = async (args) => {
    updateCalled = true;
    assert.ok(args.data.refCode);
    return { ...args.data, id: 1, username: "test", polBalance: 10, _count: { referrals: 0 } };
  };
  prisma.userMiner.findMany = async () => [];
  prisma.userInventory.count = async () => 0;
  prisma.userPowerGame.findMany = async () => [];
  prisma.youtubeWatchPower.findMany = async () => [];
  prisma.autoMiningGpu.findMany = async () => [];

  try {
    await minerProfileModel.getOrCreateMinerProfile({ id: 1 });
    assert.equal(updateCalled, true);
  } finally {
    prisma.user.findUnique = originalFindUnique;
    prisma.user.update = originalUpdate;
    prisma.userMiner.findMany = originalUserMinerFindMany;
    prisma.userInventory.count = originalUserInventoryCount;
    prisma.userPowerGame.findMany = originalUserPowerGameFindMany;
    prisma.youtubeWatchPower.findMany = originalYoutubeWatchPowerFindMany;
    prisma.autoMiningGpu.findMany = originalAutoMiningGpuFindMany;
  }
});

test("getOrCreateMinerProfile returns profile with hashRate calculation", async () => {
  const originalFindUnique = prisma.user.findUnique;
  const originalUserMinerFindMany = prisma.userMiner.findMany;
  const originalUserInventoryCount = prisma.userInventory.count;
  const originalUserPowerGameFindMany = prisma.userPowerGame.findMany;
  const originalYoutubeWatchPowerFindMany = prisma.youtubeWatchPower.findMany;
  const originalAutoMiningGpuFindMany = prisma.autoMiningGpu.findMany;

  prisma.user.findUnique = async () => ({
    id: 1, username: "test", polBalance: 10, refCode: "REF",
    _count: { referrals: 5 }
  });
  // Test with some null/undefined hashRates to cover reduction logic
  prisma.userMiner.findMany = async () => [{ hashRate: 10 }, { hashRate: null }];
  prisma.userInventory.count = async () => 2;
  prisma.userPowerGame.findMany = async () => [{ hashRate: 5 }, {}];
  prisma.youtubeWatchPower.findMany = async () => [{ hashRate: 2 }];
  prisma.autoMiningGpu.findMany = async () => [{ gpuHashRate: 3 }];

  try {
    const profile = await minerProfileModel.getOrCreateMinerProfile({ id: 1 });
    assert.equal(profile.username, "test");
    assert.equal(profile.referralCount, 5);
    assert.equal(profile.rigs, 2);
    assert.equal(profile.base_hash_rate, 20); 
  } finally {
    prisma.user.findUnique = originalFindUnique;
    prisma.userMiner.findMany = originalUserMinerFindMany;
    prisma.userInventory.count = originalUserInventoryCount;
    prisma.userPowerGame.findMany = originalUserPowerGameFindMany;
    prisma.youtubeWatchPower.findMany = originalYoutubeWatchPowerFindMany;
    prisma.autoMiningGpu.findMany = originalAutoMiningGpuFindMany;
  }
});

test("persistMinerProfile handles invalid miner", async () => {
  const res = await minerProfileModel.persistMinerProfile(null);
  assert.equal(res, undefined);
  const res2 = await minerProfileModel.persistMinerProfile({});
  assert.equal(res2, undefined);
});

test("syncUserBaseHashRate handles various power sources", async () => {
  const oldUserMiner = prisma.userMiner;
  const oldUserPowerGame = prisma.userPowerGame;
  const oldYoutubeWatchPower = prisma.youtubeWatchPower;
  const oldAutoMiningGpu = prisma.autoMiningGpu;

  prisma.userMiner = { findMany: async () => [{ hashRate: 100 }] };
  prisma.userPowerGame = { findMany: async () => [{ hashRate: 50 }] };
  prisma.youtubeWatchPower = { findMany: async () => [{ hashRate: 25 }] };
  prisma.autoMiningGpu = { findMany: async () => [{ gpuHashRate: 10 }] };

  try {
    const total = await minerProfileModel.syncUserBaseHashRate(1);
    assert.equal(total, 185);
  } finally {
    prisma.userMiner = oldUserMiner;
    prisma.userPowerGame = oldUserPowerGame;
    prisma.youtubeWatchPower = oldYoutubeWatchPower;
    prisma.autoMiningGpu = oldAutoMiningGpu;
  }
});

test("persistMinerProfile syncs miner balance from DB", async () => {
  const originalFindUnique = prisma.user.findUnique;

  // Simula DB com polBalance 50, miner.balance 30 (DB > RAM → atualiza RAM)
  prisma.user.findUnique = async () => ({ polBalance: 50 });

  const miner = { userId: 1, balance: 30 };
  try {
    await minerProfileModel.persistMinerProfile(miner);
    assert.equal(miner.balance, 50);
  } finally {
    prisma.user.findUnique = originalFindUnique;
  }
});
