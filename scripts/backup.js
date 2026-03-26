const logger = require("../utils/logger").child("BackupCLI");
const { db, run } = require("../src/db/sqlite");
const {
  createDatabaseBackup,
  pruneBackups,
  getBackupConfig,
  replicateBackupToExternal,
  runCloudBackupCommand
} = require("../server/utils/backup.cjs");

function closeDatabase() {
  return new Promise((resolve) => {
    if (!db || typeof db.close !== "function") {
      resolve();
      return;
    }
    db.close(() => resolve());
  });
}

async function main() {
  const config = getBackupConfig();
  const result = await createDatabaseBackup({ run, ...config, logger });
  logger.info("Database backup created", result);

  if (config.externalBackupEnabled && config.externalBackupDir) {
    try {
      const external = await replicateBackupToExternal({
        backupFile: result.backupFile,
        externalBackupDir: config.externalBackupDir
      });
      logger.info("External backup replicated", external);
    } catch (error) {
      logger.warn("External backup replication failed", {
        error: error.message,
        externalBackupDir: config.externalBackupDir
      });
    }
  }

  if (config.cloudBackupEnabled) {
    const cloud = await runCloudBackupCommand({
      backupFile: result.backupFile,
      commandTemplate: config.cloudCommandTemplate,
      timeoutMs: config.cloudTimeoutMs
    });

    if (cloud.success) {
      logger.info("Cloud backup command executed", {
        exitCode: cloud.exitCode,
        durationMs: cloud.durationMs
      });
    } else {
      logger.warn("Cloud backup command failed", {
        exitCode: cloud.exitCode,
        timedOut: cloud.timedOut,
        error: cloud.error || cloud.stderr || "cloud_backup_failed"
      });
    }
  }

  const pruned = await pruneBackups({ ...config, logger });
  if (pruned.deleted > 0) {
    logger.info("Old backups pruned", pruned);
  }

  if (config.externalBackupEnabled && config.externalBackupDir) {
    const externalPruned = await pruneBackups({
      backupDir: config.externalBackupDir,
      retentionDays: config.externalRetentionDays,
      filenamePrefix: config.filenamePrefix,
      logger
    });

    if (externalPruned.deleted > 0) {
      logger.info("Old external backups pruned", externalPruned);
    }
  }
}

main()
  .catch((error) => {
    logger.error("Backup failed", { error: error.message });
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
