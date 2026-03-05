import loggerLib from "../utils/logger.js";
const logger = loggerLib.child("BackupCron");

export function startBackupCron() {
  logger.info("Backup cron started");
  // Simple implementation for now to avoid logic bloat
  return [];
}

export function runFullSiteBackupOnStartup() {
  logger.info("Simulating full site backup on startup...");
}
