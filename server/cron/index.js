import { startMiningLoop } from "./miningCron.js";
import { startGamePowerCleanup } from "./gamePowerCleanup.js";
import { startWithdrawalMonitoring } from "./withdrawalsCron.js";
import { startBackupCron, runDatabaseBackupOnStartup, runFullSiteBackupOnStartup } from "./backupCron.js";
import { startCallbackQueueProcessing } from "./callbackQueueCron.js";
import { startShortlinkResetCron } from "./shortlinkResetCron.js";
import { startDepositMonitoring } from "./depositsCron.js";

export function startCronTasks({
  engine,
  io,
  persistMinerProfile,
  run,
  buildPublicState,
  syncEngineMiners,
  syncUserBaseHashRate
}) {
  const miningTimers = startMiningLoop(
    { engine, io, persistMinerProfile, buildPublicState },
    { syncEngineMiners, syncUserBaseHashRate }
  );

  const cleanupTimers = startGamePowerCleanup({ engine, io, run });
  const withdrawalTimers = startWithdrawalMonitoring();
  const backupTimers = startBackupCron();
  const callbackQueueTimers = startCallbackQueueProcessing();
  const shortlinkResetTimers = startShortlinkResetCron();
  const depositTimers = startDepositMonitoring();

  runDatabaseBackupOnStartup();
  runFullSiteBackupOnStartup();

  return {
    ...miningTimers,
    ...cleanupTimers,
    ...withdrawalTimers,
    ...backupTimers,
    ...callbackQueueTimers,
    ...shortlinkResetTimers,
    ...depositTimers
  };
}
