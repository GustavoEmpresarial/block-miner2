import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_LEVELS = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };
const CURRENT_LOG_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

const logDir = path.join(__dirname, "..", "logs");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

function formatLog(level, category, message, details) {
  const timestamp = new Date().toISOString();
  let logStr = `[${timestamp}] [${level}] [${category}] ${message}`;
  if (details) logStr += ` | ${JSON.stringify(details)}`;
  return logStr;
}

function writeToFile(level, logStr) {
  const date = new Date().toISOString().split("T")[0];
  const logFile = path.join(logDir, `${level.toLowerCase()}-${date}.log`);
  fs.appendFileSync(logFile, logStr + "\n");
}

class Logger {
  constructor(category = "App") {
    this.category = category;
  }
  child(subCategory) {
    return new Logger(`${this.category}:${subCategory}`);
  }
  _log(level, message, details) {
    if (LOG_LEVELS[level] > CURRENT_LOG_LEVEL) return;
    const logStr = formatLog(level, this.category, message, details);
    console.log(logStr);
    try { writeToFile(level, logStr); } catch (e) { /* ignore */ }
  }
  error(m, d) { this._log("ERROR", m, d); }
  warn(m, d) { this._log("WARN", m, d); }
  info(m, d) { this._log("INFO", m, d); }
  debug(m, d) { this._log("DEBUG", m, d); }
}

const defaultLogger = new Logger();
export default defaultLogger;
