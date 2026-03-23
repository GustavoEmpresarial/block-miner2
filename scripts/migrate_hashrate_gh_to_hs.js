/**
 * GH → H/s migration + audit.
 *
 * Legacy rule: positive values < LEGACY_MAX were stored as "GH/s as plain number"
 * (e.g. 5 meant 5 GH/s). They are multiplied by 1e9 to match UI base H/s.
 *
 * After multiply, syncFromMinerCatalog() realigns user_miners / user_inventory /
 * shortlink_rewards rows with miners.base_hash_rate * level.
 *
 * Flags:
 *   (none)     dry-run: counts + optional --audit stats, no writes
 *   --execute  apply updates
 *   --audit    print per-column distribution (legacy vs likely H/s)
 */
import "../server/loadEnv.js";
import prisma from "../server/src/db/prisma.js";

const GH = 1_000_000_000;
const LEGACY_MAX = 1_000_000; // Values below this are considered legacy GH-scale numbers.
const EXECUTE = process.argv.includes("--execute");
const AUDIT = process.argv.includes("--audit");

const AUDIT_TARGETS = [
  ["miners", "base_hash_rate"],
  ["user_miners", "hash_rate"],
  ["user_inventory", "hash_rate"],
  ["users_powers_games", "hash_rate"],
  ["youtube_watch_user_powers", "hash_rate"],
  ["youtube_watch_power_history", "hash_rate"],
  ["auto_mining_rewards", "gpu_hash_rate"],
  ["auto_mining_gpu", "gpu_hash_rate"],
  ["auto_mining_gpu_logs", "gpu_hash_rate"],
  ["shortlink_rewards", "hash_rate"]
];

async function auditNumericColumn(table, column) {
  const sql = `
    SELECT
      COUNT(*)::int AS total_rows,
      COUNT(*) FILTER (WHERE ${column} > 0)::int AS positive,
      COUNT(*) FILTER (WHERE ${column} > 0 AND ${column} < ${LEGACY_MAX})::int AS legacy_gh_candidates,
      COUNT(*) FILTER (WHERE ${column} >= ${LEGACY_MAX})::int AS likely_already_hs_or_large,
      MIN(${column}) FILTER (WHERE ${column} > 0)::float AS min_positive,
      MAX(${column})::float AS max_all
    FROM ${table}
  `;
  const rows = await prisma.$queryRawUnsafe(sql);
  return rows[0];
}

async function multiplyLegacyColumn(table, column) {
  const sql = `
    UPDATE ${table}
    SET ${column} = ${column} * ${GH}
    WHERE ${column} > 0 AND ${column} < ${LEGACY_MAX}
  `;
  if (!EXECUTE) {
    return prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS count FROM ${table} WHERE ${column} > 0 AND ${column} < ${LEGACY_MAX}`
    );
  }
  return prisma.$executeRawUnsafe(sql);
}

async function syncFromMinerCatalog() {
  const miners = await prisma.miner.findMany({
    where: { baseHashRate: { gt: 0 } },
    select: { id: true, name: true, baseHashRate: true, slotSize: true, imageUrl: true }
  });

  let userMinerUpdates = 0;
  let inventoryUpdates = 0;
  let shortlinkUpdates = 0;

  for (const miner of miners) {
    const userMiners = await prisma.userMiner.findMany({
      where: { minerId: miner.id },
      select: { id: true, level: true }
    });
    for (const row of userMiners) {
      const level = Math.max(1, Number(row.level || 1));
      if (EXECUTE) {
        await prisma.userMiner.update({
          where: { id: row.id },
          data: {
            hashRate: Number(miner.baseHashRate) * level,
            slotSize: Number(miner.slotSize || 1),
            imageUrl: miner.imageUrl ?? null
          }
        });
      }
      userMinerUpdates += 1;
    }

    const inv = await prisma.userInventory.findMany({
      where: { minerId: miner.id },
      select: { id: true, level: true }
    });
    for (const row of inv) {
      const level = Math.max(1, Number(row.level || 1));
      if (EXECUTE) {
        await prisma.userInventory.update({
          where: { id: row.id },
          data: {
            minerName: miner.name,
            hashRate: Number(miner.baseHashRate) * level,
            slotSize: Number(miner.slotSize || 1),
            imageUrl: miner.imageUrl ?? null
          }
        });
      }
      inventoryUpdates += 1;
    }

    if (EXECUTE) {
      const r = await prisma.shortlinkReward.updateMany({
        where: { minerId: miner.id },
        data: {
          rewardName: miner.name,
          hashRate: Number(miner.baseHashRate),
          slotSize: Number(miner.slotSize || 1),
          imageUrl: miner.imageUrl ?? null
        }
      });
      shortlinkUpdates += Number(r.count || 0);
    } else {
      const c = await prisma.shortlinkReward.count({ where: { minerId: miner.id } });
      shortlinkUpdates += c;
    }
  }

  return { userMinerUpdates, inventoryUpdates, shortlinkUpdates };
}

async function printAuditBanner(title) {
  console.log("\n=== " + title + " (legacy = 0 < value < " + LEGACY_MAX + " → * " + GH + " when migrating) ===\n");
  for (const [table, col] of AUDIT_TARGETS) {
    try {
      const s = await auditNumericColumn(table, col);
      console.log(`${table}.${col}:`, JSON.stringify(s));
    } catch (e) {
      console.log(`${table}.${col}: ERROR`, e?.message || e);
    }
  }
  console.log("");
}

async function main() {
  console.log(EXECUTE ? "Running migration (EXECUTE mode)..." : "Dry run mode. Use --execute to apply changes.");

  const minerLegacy = await multiplyLegacyColumn("miners", "base_hash_rate");
  const ytPowerLegacy = await multiplyLegacyColumn("youtube_watch_user_powers", "hash_rate");
  const ytHistLegacy = await multiplyLegacyColumn("youtube_watch_power_history", "hash_rate");
  const gamePowerLegacy = await multiplyLegacyColumn("users_powers_games", "hash_rate");
  const autoRewardLegacy = await multiplyLegacyColumn("auto_mining_rewards", "gpu_hash_rate");
  const autoGpuLegacy = await multiplyLegacyColumn("auto_mining_gpu", "gpu_hash_rate");
  const autoLogLegacy = await multiplyLegacyColumn("auto_mining_gpu_logs", "gpu_hash_rate");
  const invLooseLegacy = await multiplyLegacyColumn("user_inventory", "hash_rate");
  const minerLooseLegacy = await multiplyLegacyColumn("user_miners", "hash_rate");
  const shortlinkLegacy = await multiplyLegacyColumn("shortlink_rewards", "hash_rate");

  const synced = await syncFromMinerCatalog();

  const out = {
    execute: EXECUTE,
    converted: {
      miners: EXECUTE ? minerLegacy : Number(minerLegacy?.[0]?.count || 0),
      youtubeWatchPower: EXECUTE ? ytPowerLegacy : Number(ytPowerLegacy?.[0]?.count || 0),
      youtubeWatchHistory: EXECUTE ? ytHistLegacy : Number(ytHistLegacy?.[0]?.count || 0),
      usersPowersGames: EXECUTE ? gamePowerLegacy : Number(gamePowerLegacy?.[0]?.count || 0),
      autoMiningReward: EXECUTE ? autoRewardLegacy : Number(autoRewardLegacy?.[0]?.count || 0),
      autoMiningGpu: EXECUTE ? autoGpuLegacy : Number(autoGpuLegacy?.[0]?.count || 0),
      autoMiningGpuLog: EXECUTE ? autoLogLegacy : Number(autoLogLegacy?.[0]?.count || 0),
      userInventoryLoose: EXECUTE ? invLooseLegacy : Number(invLooseLegacy?.[0]?.count || 0),
      userMinersLoose: EXECUTE ? minerLooseLegacy : Number(minerLooseLegacy?.[0]?.count || 0),
      shortlinkRewardsLoose: EXECUTE ? shortlinkLegacy : Number(shortlinkLegacy?.[0]?.count || 0)
    },
    resyncedFromCatalog: synced
  };

  console.log(JSON.stringify(out, null, 2));

  if (AUDIT) {
    await printAuditBanner(EXECUTE ? "Audit after run (DB state now)" : "Audit (current DB — dry run did not write)");
  }

  if (!EXECUTE) {
    console.log("No data changed in dry run mode.");
  }
}

main()
  .catch((err) => {
    console.error("Migration failed:", err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
