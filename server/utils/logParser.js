/**
 * utils/logParser.js
 *
 * Utilities for reading, parsing and summarising structured log files
 * from the storage/logs directory hierarchy.
 *
 * Extracted from server.js to keep the entry-point focused on wiring.
 */

const fs = require("fs/promises");
const path = require("path");

const LOG_CATEGORY_DIRS = Object.freeze({
    audit: path.join(__dirname, "..", "storage", "logs", "audit"),
    critical: path.join(__dirname, "..", "storage", "logs", "critical"),
    general: path.join(__dirname, "..", "storage", "logs", "general"),
    security: path.join(__dirname, "..", "storage", "logs", "security"),
    transactions: path.join(__dirname, "..", "storage", "logs", "transactions")
});

const LOG_LEVEL_SET = new Set(["ERROR", "WARN", "INFO", "DEBUG"]);
const LOG_LINE_REGEX = /^\[([^\]]+)]\s+\[([^\]]+)]\s+\[([^\]]+)]\s+([\s\S]*)$/;

function parseCsvList(value) {
    return String(value || "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function parseDateQuery(value) {
    if (!value) return null;
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && asNumber > 0) {
        return asNumber;
    }

    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : null;
}

function clampInt(value, min, max, fallback) {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

function parseLogLine(rawLine, category, fileName) {
    const line = String(rawLine || "").trim();
    if (!line) return null;

    const match = line.match(LOG_LINE_REGEX);
    if (!match) {
        return {
            timestamp: null,
            level: "INFO",
            module: "Unknown",
            message: line,
            details: null,
            category,
            file: fileName
        };
    }

    const timestampRaw = match[1] || "";
    const levelRaw = String(match[2] || "INFO").toUpperCase();
    const moduleName = match[3] || "Unknown";
    const payload = match[4] || "";
    const separatorIndex = payload.indexOf(" | ");
    const message = separatorIndex >= 0 ? payload.slice(0, separatorIndex).trim() : payload.trim();
    const detailsRaw = separatorIndex >= 0 ? payload.slice(separatorIndex + 3).trim() : "";

    let details = null;
    if (detailsRaw) {
        try {
            details = JSON.parse(detailsRaw);
        } catch {
            details = detailsRaw;
        }
    }

    const timestampMs = Date.parse(timestampRaw);

    return {
        timestamp: Number.isFinite(timestampMs) ? timestampMs : null,
        level: LOG_LEVEL_SET.has(levelRaw) ? levelRaw : "INFO",
        module: moduleName,
        message,
        details,
        category,
        file: fileName
    };
}

async function listCategoryLogFiles(category) {
    const categoryDir = LOG_CATEGORY_DIRS[category];
    if (!categoryDir) return [];

    const entries = await fs.readdir(categoryDir, { withFileTypes: true }).catch(() => []);
    const files = entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .filter((name) => /\.log(\.\d+)?$/i.test(name));

    const filesWithStats = await Promise.all(
        files.map(async (name) => {
            const filePath = path.join(categoryDir, name);
            const stat = await fs.stat(filePath).catch(() => null);
            return {
                name,
                filePath,
                modifiedAt: Number(stat?.mtimeMs || 0)
            };
        })
    );

    return filesWithStats
        .filter((item) => item.modifiedAt > 0)
        .sort((a, b) => b.modifiedAt - a.modifiedAt);
}

async function readTailLines(filePath, maxLines = 400, maxBytes = 256 * 1024) {
    const handle = await fs.open(filePath, "r");
    try {
        const stat = await handle.stat();
        const fileSize = Number(stat?.size || 0);
        if (fileSize <= 0) return [];

        const readSize = Math.min(fileSize, maxBytes);
        const start = Math.max(0, fileSize - readSize);
        const buffer = Buffer.alloc(readSize);
        await handle.read(buffer, 0, readSize, start);

        const text = buffer.toString("utf8");
        const lines = text
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);

        if (lines.length <= maxLines) {
            return lines;
        }

        return lines.slice(lines.length - maxLines);
    } finally {
        await handle.close();
    }
}

function buildLogSummary(events, categories, bucketMinutes) {
    const byLevel = { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0 };
    const byCategory = Object.fromEntries(categories.map((category) => [category, 0]));
    const bucketSizeMs = Math.max(1, bucketMinutes) * 60 * 1000;
    const buckets = new Map();

    for (const event of events) {
        if (!event) continue;

        if (byLevel[event.level] !== undefined) {
            byLevel[event.level] += 1;
        }

        if (byCategory[event.category] !== undefined) {
            byCategory[event.category] += 1;
        }

        if (!event.timestamp) continue;
        const bucketTs = Math.floor(event.timestamp / bucketSizeMs) * bucketSizeMs;
        const bucket = buckets.get(bucketTs) || {
            timestamp: bucketTs,
            total: 0,
            errors: 0,
            warnings: 0,
            byCategory: Object.fromEntries(categories.map((category) => [category, 0]))
        };

        bucket.total += 1;
        if (event.level === "ERROR") bucket.errors += 1;
        if (event.level === "WARN") bucket.warnings += 1;
        bucket.byCategory[event.category] = Number(bucket.byCategory[event.category] || 0) + 1;
        buckets.set(bucketTs, bucket);
    }

    const series = Array.from(buckets.values()).sort((a, b) => a.timestamp - b.timestamp);
    const peakErrorBucket = series.reduce(
        (best, current) => (current.errors > (best?.errors || 0) ? current : best),
        null
    );

    return {
        total: events.length,
        byLevel,
        byCategory,
        peakErrorBucket,
        bucketMinutes,
        series
    };
}

module.exports = {
    LOG_CATEGORY_DIRS,
    LOG_LEVEL_SET,
    parseCsvList,
    parseDateQuery,
    clampInt,
    parseLogLine,
    listCategoryLogFiles,
    readTailLines,
    buildLogSummary
};
