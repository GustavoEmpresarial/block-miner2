/**
 * Corrige na BD valores de hash com fator 10^9 a mais (ex.: 5e9 onde devia ser 5 H/s).
 * Repete UPDATE enquanto existirem linhas >= 1e9 por coluna (até 12 voltas).
 *
 * Tabelas: miners, user_miners, user_inventory, shortlink_rewards, users_powers_games,
 *          youtube_watch_user_powers, youtube_watch_power_history,
 *          auto_mining_gpu, auto_mining_gpu_logs, auto_mining_rewards
 *
 * Uso:
 *   node scripts/strip_extra_billion_hashscale.js
 *   node scripts/strip_extra_billion_hashscale.js --execute
 *
 * Depois: reiniciar app e, se quiser alinhar tudo ao catálogo, admin "resync" / propagar miners.
 */
import "../server/loadEnv.js";
import prisma from "../server/src/db/prisma.js";

const EXECUTE = process.argv.includes("--execute");
const B = 1_000_000_000;
const MAX_ROUNDS = 12;

/** @type {Array<[string, string]>} */
const TARGETS = [
  ["miners", "base_hash_rate"],
  ["user_miners", "hash_rate"],
  ["user_inventory", "hash_rate"],
  ["shortlink_rewards", "hash_rate"],
  ["users_powers_games", "hash_rate"],
  ["youtube_watch_user_powers", "hash_rate"],
  ["youtube_watch_power_history", "hash_rate"],
  ["auto_mining_gpu", "gpu_hash_rate"],
  ["auto_mining_gpu_logs", "gpu_hash_rate"],
  ["auto_mining_rewards", "gpu_hash_rate"]
];

async function countOver(table, column) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS c FROM "${table}" WHERE "${column}" >= ${B}`
  );
  return Number(rows[0]?.c || 0);
}

async function shrinkOnce(table, column) {
  return prisma.$executeRawUnsafe(
    `UPDATE "${table}" SET "${column}" = "${column}" / ${B} WHERE "${column}" >= ${B}`
  );
}

async function main() {
  console.log("[strip_extra_billion_hashscale] threshold >=", B, EXECUTE ? "(EXECUTE)" : "(dry-run)");

  for (const [table, column] of TARGETS) {
    const initial = await countOver(table, column);
    console.log(`  ${table}.${column}: ${initial} row(s) >= ${B}`);
    if (!EXECUTE || initial === 0) continue;

    let rounds = 0;
    let total = 0;
    while (rounds < MAX_ROUNDS) {
      const n = Number(await shrinkOnce(table, column));
      total += n;
      rounds++;
      if (n === 0) break;
    }
    console.log(`    -> updated ${total} row(s) in ${rounds} round(s)`);
  }

  if (!EXECUTE) {
    console.log("\nDry-run. Rode com --execute para aplicar.");
  } else {
    console.log("\nFeito. Reinicie o serviço app / container.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
