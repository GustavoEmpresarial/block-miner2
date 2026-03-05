const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatTimestamp(date) {
  const yyyy = date.getFullYear();
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const min = pad2(date.getMinutes());
  const ss = pad2(date.getSeconds());
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
}

function getDefaultDbPath() {
  return path.resolve(process.env.DB_PATH || path.join(process.cwd(), "data", "blockminer.db"));
}

function getBackupConfig() {
  const backupDir = path.resolve(process.env.BACKUP_DIR || path.join(process.cwd(), "backups"));
  const retentionDays = parseNumber(process.env.BACKUP_RETENTION_DAYS, 7);
  const filenamePrefix = process.env.BACKUP_FILENAME_PREFIX || "blockminer-db-";
  const externalBackupDirRaw = String(process.env.BACKUP_EXTERNAL_DIR || "").trim();
  const externalBackupEnabled = parseBoolean(process.env.BACKUP_EXTERNAL_ENABLED, Boolean(externalBackupDirRaw));
  const externalBackupDir = externalBackupDirRaw ? path.resolve(externalBackupDirRaw) : "";
  const externalRetentionDays = parseNumber(process.env.BACKUP_EXTERNAL_RETENTION_DAYS, retentionDays);
  const cloudBackupEnabled = parseBoolean(process.env.BACKUP_CLOUD_ENABLED, false);
  const cloudCommandTemplate = String(process.env.BACKUP_CLOUD_COMMAND || "").trim();
  const cloudTimeoutMs = Math.max(1_000, parseNumber(process.env.BACKUP_CLOUD_TIMEOUT_MS, 120_000));

  return {
    backupDir,
    retentionDays,
    filenamePrefix,
    externalBackupEnabled,
    externalBackupDir,
    externalRetentionDays,
    cloudBackupEnabled,
    cloudCommandTemplate,
    cloudTimeoutMs
  };
}

function escapeSqlString(value) {
  return String(value).replaceAll("'", "''");
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function createDatabaseBackup({ run, backupDir, filenamePrefix, logger }) {
  const startedAt = Date.now();
  await ensureDir(backupDir);

  const stamp = formatTimestamp(new Date());
  const backupFile = path.join(backupDir, `${filenamePrefix}${stamp}.db`);

  // Preferred: consistent SQLite backup without racing a live WAL file.
  try {
    const sqlPath = escapeSqlString(backupFile);
    await run(`VACUUM INTO '${sqlPath}'`);
    return { backupFile, method: "vacuum-into", durationMs: Date.now() - startedAt };
  } catch (error) {
    if (logger && logger.warn) {
      logger.warn("VACUUM INTO failed; falling back to file copy", { error: error.message });
    }
  }

  // Fallback: best-effort file copy (may be inconsistent if SQLite is writing).
  const dbPath = getDefaultDbPath();
  await ensureDir(path.dirname(backupFile));
  await fsp.copyFile(dbPath, backupFile);
  return { backupFile, method: "copy-file", durationMs: Date.now() - startedAt };
}

async function pruneBackups({ backupDir, retentionDays, filenamePrefix, logger }) {
  const days = Number(retentionDays);
  if (!Number.isFinite(days) || days <= 0) {
    return { deleted: 0 };
  }

  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
  if (!fs.existsSync(backupDir)) {
    return { deleted: 0 };
  }

  const entries = await fsp.readdir(backupDir, { withFileTypes: true });
  const backupRegex = new RegExp(`^${escapeRegExp(filenamePrefix)}\\d{8}-\\d{6}\\.db$`);
  let deleted = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!backupRegex.test(entry.name)) continue;

    const fullPath = path.join(backupDir, entry.name);
    let stat;
    try {
      stat = await fsp.stat(fullPath);
    } catch {
      continue;
    }

    if (stat.mtimeMs < cutoffMs) {
      try {
        await fsp.unlink(fullPath);
        deleted += 1;
      } catch (error) {
        if (logger && logger.warn) {
          logger.warn("Failed to delete old backup", { file: fullPath, error: error.message });
        }
      }
    }
  }

  return { deleted };
}

async function replicateBackupToExternal({ backupFile, externalBackupDir }) {
  if (!backupFile || !externalBackupDir) {
    return { backupFile: null, durationMs: 0, copied: false };
  }

  const startedAt = Date.now();
  await ensureDir(externalBackupDir);

  const targetFile = path.join(externalBackupDir, path.basename(backupFile));
  await fsp.copyFile(backupFile, targetFile);

  return {
    backupFile: targetFile,
    durationMs: Date.now() - startedAt,
    copied: true
  };
}

function applyTemplate(template, backupFile) {
  const filename = path.basename(backupFile);
  return String(template)
    .replaceAll("{backupFile}", backupFile)
    .replaceAll("{backupFilename}", filename);
}

async function runCloudBackupCommand({ backupFile, commandTemplate, timeoutMs }) {
  if (!backupFile || !commandTemplate) {
    return { executed: false, success: false, exitCode: null, durationMs: 0, command: null };
  }

  const command = applyTemplate(commandTemplate, backupFile);
  const startedAt = Date.now();

  return await new Promise((resolve) => {
    const child = spawn(command, {
      shell: true,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let finished = false;

    const finish = (result) => {
      if (finished) {
        return;
      }
      finished = true;
      resolve(result);
    };

    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignore
      }

      finish({
        executed: true,
        success: false,
        timedOut: true,
        exitCode: null,
        durationMs: Date.now() - startedAt,
        command,
        stdout: stdout.slice(-4000),
        stderr: stderr.slice(-4000)
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk || "");
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      finish({
        executed: true,
        success: false,
        timedOut: false,
        exitCode: null,
        durationMs: Date.now() - startedAt,
        command,
        error: error.message,
        stdout: stdout.slice(-4000),
        stderr: stderr.slice(-4000)
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      finish({
        executed: true,
        success: code === 0,
        timedOut: false,
        exitCode: code,
        durationMs: Date.now() - startedAt,
        command,
        stdout: stdout.slice(-4000),
        stderr: stderr.slice(-4000)
      });
    });
  });
}

async function createFullSiteBackup({ backupDir, filenamePrefix, logger }) {
  const startedAt = Date.now();
  await ensureDir(backupDir);

  const stamp = formatTimestamp(new Date());
  const backupFile = path.join(backupDir, `${filenamePrefix}${stamp}.tar.gz`);

  const appRoot = process.cwd();
  const excludeDirs = [
    "node_modules",
    "backups",
    "logs",
    ".git",
    "data/blockminer.db-wal",
    "data/blockminer.db-shm"
  ];

  const excludeArgs = excludeDirs.map(dir => `--exclude='${dir}'`).join(" ");
  const tarCommand = `cd "${appRoot}" && tar -czf "${backupFile}" ${excludeArgs} .`;

  return await new Promise((resolve, reject) => {
    const child = spawn(tarCommand, {
      shell: true,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });

    child.on("error", (error) => {
      reject(new Error(`Tar command failed: ${error.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({
          backupFile,
          method: "tar-gz",
          durationMs: Date.now() - startedAt
        });
      } else {
        reject(new Error(`Tar exited with code ${code}: ${stderr.slice(-500)}`));
      }
    });
  });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  getBackupConfig,
  createDatabaseBackup,
  createFullSiteBackup,
  pruneBackups,
  replicateBackupToExternal,
  runCloudBackupCommand
};
