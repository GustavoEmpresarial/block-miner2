import { startMiningLoop } from "./miningCron.js";
import { startGamePowerCleanup } from "./gamePowerCleanup.js";
import { startWithdrawalMonitoring } from "./withdrawalsCron.js";
import { startBackupCron, runFullSiteBackupOnStartup } from "./backupCron.js";
import { startCallbackQueueProcessing } from "./callbackQueueCron.js";
import { startShortlinkResetCron } from "./shortlinkResetCron.js";

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
  
  const cleanupTimers = startGamePowerCleanup({ run });
  const depositTimers = [];
  const backupTimers = startBackupCron({ run });
  const callbackQueueTimers = startCallbackQueueProcessing();
  const shortlinkResetTimers = startShortlinkResetCron();

  // Run full site backup on startup (includes DB + all files)
  runFullSiteBackupOnStartup();

  return {
    ...miningTimers,
    ...cleanupTimers,
    ...depositTimers,
    ...backupTimers,
    ...callbackQueueTimers,
    ...shortlinkResetTimers
  };
}
