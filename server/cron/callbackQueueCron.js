import loggerLib from "../utils/logger.js";
const logger = loggerLib.child("CallbackQueue");

export function startCallbackQueueProcessing() {
  logger.info("Callback queue processing started");
  return [];
}
