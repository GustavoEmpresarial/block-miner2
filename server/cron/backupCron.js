import { createRequire } from "node:module";
import cron from "node-cron";
import loggerLib from "../utils/logger.js";

const require = createRequire(import.meta.url);
const {
  getBackupConfig,
  createDatabaseBackup,
  createFullSiteBackup,
  pruneBackups,
  replicateBackupToExternal,
  runCloudBackupCommand
} = require("../utils/backup.cjs");

const logger = loggerLib.child("BackupCron");

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function runDatabaseBackupPipeline() {
  const config = getBackupConfig();
  const result = await createDatabaseBackup({
    run: null,
    backupDir: config.backupDir,
    filenamePrefix: config.filenamePrefix,
    logger
  });
  logger.info("Database backup finished", {
    method: result.method,
    durationMs: result.durationMs
  });

  if (config.externalBackupEnabled && config.externalBackupDir) {
    try {
      const external = await replicateBackupToExternal({
        backupFile: result.backupFile,
        externalBackupDir: config.externalBackupDir
      });
      logger.info("External backup replicated", { copied: external.copied });
    } catch (error) {
      logger.warn("External backup replication failed", { error: error.message });
    }
  }

  if (config.cloudBackupEnabled && config.cloudCommandTemplate) {
    const cloud = await runCloudBackupCommand({
      backupFile: result.backupFile,
      commandTemplate: config.cloudCommandTemplate,
      timeoutMs: config.cloudTimeoutMs
    });
    if (cloud.success) {
      logger.info("Cloud backup OK", { durationMs: cloud.durationMs });
    } else {
      logger.warn("Cloud backup failed", {
        exitCode: cloud.exitCode,
        timedOut: cloud.timedOut,
        detail: cloud.error || cloud.stderr || "cloud_backup_failed"
      });
    }
  }

  const pruned = await pruneBackups({ ...config, logger });
  if (pruned.deleted > 0) {
    logger.info("Old local backups pruned", pruned);
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

async function runFullSitePipeline() {
  const config = getBackupConfig();
  const result = await createFullSiteBackup({
    backupDir: config.backupDir,
    filenamePrefix: config.filenamePrefix,
    logger
  });
  logger.info("Full site archive created", { method: result.method, durationMs: result.durationMs });

  if (config.cloudBackupEnabled && config.cloudCommandTemplate) {
    const cloud = await runCloudBackupCommand({
      backupFile: result.backupFile,
      commandTemplate: config.cloudCommandTemplate,
      timeoutMs: config.cloudTimeoutMs
    });
    if (!cloud.success) {
      logger.warn("Full site cloud upload failed", {
        exitCode: cloud.exitCode,
        detail: cloud.stderr || cloud.error
      });
    }
  }

  const pruned = await pruneBackups({ ...config, logger });
  if (pruned.deleted > 0) {
    logger.info("Pruned old archives after full site backup", pruned);
  }
}

export function startBackupCron() {
  if (process.env.NODE_ENV === "test") {
    return [];
  }
  if (!parseBoolean(process.env.BACKUP_ENABLED, false)) {
    logger.info("Backup cron disabled via BACKUP_ENABLED");
    return [];
  }

  const expr = String(process.env.BACKUP_CRON || "0 3 * * *").trim();
  if (!cron.validate(expr)) {
    logger.warn("Invalid BACKUP_CRON; backup scheduler not started", { expr });
    return [];
  }

  const cfg = getBackupConfig();
  if (cfg.cloudBackupEnabled && !cfg.cloudCommandTemplate) {
    logger.warn(
      "BACKUP_CLOUD_ENABLED sem comando: define BACKUP_CLOUD_COMMAND ou BACKUP_CLOUD_FOLDER_ID (+ BACKUP_CLOUD_REMOTE)"
    );
  }

  logger.info("Database backup cron scheduled", {
    expr,
    cloud: cfg.cloudBackupEnabled,
    cloudCommand: Boolean(cfg.cloudCommandTemplate)
  });
  const task = cron.schedule(expr, () => {
    runDatabaseBackupPipeline().catch((error) => {
      logger.error("Scheduled database backup failed", { error: error.message });
    });
  });
  return [task];
}

/** Optional: first DB dump after boot (uploads to Drive if BACKUP_CLOUD_ENABLED). */
export function runDatabaseBackupOnStartup() {
  if (process.env.NODE_ENV === "test") return;
  if (!parseBoolean(process.env.BACKUP_ENABLED, false)) return;
  if (!parseBoolean(process.env.BACKUP_RUN_ON_STARTUP, false)) return;

  const delay = Math.max(0, parseNumber(process.env.BACKUP_STARTUP_DELAY_MS, 60_000));
  setTimeout(() => {
    runDatabaseBackupPipeline().catch((error) => {
      logger.error("Startup database backup failed", { error: error.message });
    });
  }, delay);
  logger.info("Startup database backup scheduled", { delayMs: delay });
}

/** Optional: tar.gz of app tree on boot + cloud copy. */
export function runFullSiteBackupOnStartup() {
  if (process.env.NODE_ENV === "test") return;
  if (!parseBoolean(process.env.BACKUP_ENABLED, false)) return;
  if (!parseBoolean(process.env.BACKUP_FULL_SITE_ON_STARTUP, false)) return;

  const delay = Math.max(0, parseNumber(process.env.BACKUP_FULL_SITE_STARTUP_DELAY_MS, 15_000));
  setTimeout(() => {
    runFullSitePipeline().catch((error) => {
      logger.error("Startup full site backup failed", { error: error.message });
    });
  }, delay);
  logger.info("Startup full site backup scheduled", { delayMs: delay });
}
