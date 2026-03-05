import loggerLib from "../utils/logger.js";
const logger = loggerLib.child("WithdrawalsCron");

export function startWithdrawalMonitoring() {
  logger.info("Withdrawal monitoring started");
  return [];
}
