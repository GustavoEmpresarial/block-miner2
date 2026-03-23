/**
 * Remove todo o poder de mineração extra vindo de JOGOS e YOUT (todas as linhas ativas ou não).
 *
 * Afeta apenas:
 *   - users_powers_games       (UserPowerGame)
 *   - youtube_watch_user_powers (YoutubeWatchPower)
 *
 * NÃO altera: máquinas (rack/inventário), GPU Auto-Mining, histórico youtube_watch_power_history,
 * saldo yt_seconds_balance, nem outros bonus.
 *
 * Uso:
 *   node scripts/clear_game_yt_powers.js           # dry-run: só mostra contagens
 *   node scripts/clear_game_yt_powers.js --execute # apaga tudo
 *
 * Produção (Docker): carregue DATABASE_URL / use .env na mesma pasta do projeto:
 *   docker compose exec app node scripts/clear_game_yt_powers.js --execute
 *
 * Depois de executar, reinicie o serviço `app` (ou espere recarga de perfil) para o motor
 * em memória alinhar com a BD.
 */
import "../server/loadEnv.js";
import prisma from "../server/src/db/prisma.js";

const EXECUTE = process.argv.includes("--execute");

async function main() {
  const [gameCount, ytCount] = await Promise.all([
    prisma.userPowerGame.count(),
    prisma.youtubeWatchPower.count()
  ]);

  console.log("[clear_game_yt_powers] Jogos (users_powers_games):", gameCount);
  console.log("[clear_game_yt_powers] YouTube (youtube_watch_user_powers):", ytCount);

  if (!EXECUTE) {
    console.log("\nDry-run. Para apagar, rode de novo com --execute");
    return;
  }

  const [g, y] = await prisma.$transaction([
    prisma.userPowerGame.deleteMany({}),
    prisma.youtubeWatchPower.deleteMany({})
  ]);

  console.log("\nRemovido:");
  console.log("  users_powers_games:", g.count);
  console.log("  youtube_watch_user_powers:", y.count);
  console.log("\nRecomendação: reiniciar o container/serviço da API (app) para atualizar perfis no mining engine.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
