function formatError(error) {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  return error.message || String(error);
}

export function sanitizeMeta(input) {
  if (!input || typeof input !== "object") return {};
  const result = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (value === null || typeof value === "number" || typeof value === "boolean") {
      result[key] = value;
      continue;
    }
    if (typeof value === "string") {
      result[key] = value.length > 300 ? `${value.slice(0, 300)}...` : value;
      continue;
    }
    if (Array.isArray(value)) {
      result[key] = value.slice(0, 20).map((item) => {
        if (item === null || ["string", "number", "boolean"].includes(typeof item)) return item;
        return "[complex-item]";
      });
      continue;
    }
    result[key] = "[complex]";
  }
  return result;
}

function normalizeValidation(validationResult) {
  if (typeof validationResult === "boolean") return { ok: validationResult };
  if (!validationResult || typeof validationResult !== "object") return { ok: true };
  return {
    ok: validationResult.ok !== false,
    reason: validationResult.reason || null,
    details: sanitizeMeta(validationResult.details || {})
  };
}

function normalizeConfirm(confirmResult) {
  if (typeof confirmResult === "boolean") return { ok: confirmResult };
  if (!confirmResult || typeof confirmResult !== "object") return { ok: true };
  return {
    ok: confirmResult.ok !== false,
    reason: confirmResult.reason || null,
    details: sanitizeMeta(confirmResult.details || {})
  };
}

function writeWithLevel(logger, level, message, payload) {
  const normalizedLevel = String(level || "warn").toLowerCase();
  if (typeof logger?.[normalizedLevel] === "function") {
    logger[normalizedLevel](message, payload);
    return;
  }
  logger.warn(message, payload);
}

export function createCronActionRunner({ logger, cronName }) {
  const inFlight = new Set();

  return async function runAction({
    action,
    prepare,
    validate,
    sanitize,
    execute,
    confirm,
    meta,
    allowConcurrent = false,
    logStart = true,
    logSuccess = true,
    skippedLogLevel = "warn",
    validateFailureLogLevel = "warn"
  }) {
    const actionName = String(action || "unnamed_action");
    const lockKey = `${cronName}:${actionName}`;
    const startedAt = Date.now();
    const baseMeta = sanitizeMeta(meta || {});

    if (!allowConcurrent && inFlight.has(lockKey)) {
      writeWithLevel(logger, skippedLogLevel, "Cron action skipped", {
        cron: cronName,
        action: actionName,
        reason: "already_running",
        ...baseMeta
      });
      return { ok: false, reason: "already_running" };
    }

    inFlight.add(lockKey);
    try {
      if (logStart) {
        logger.info("Cron action started", {
          cron: cronName,
          action: actionName,
          ...baseMeta
        });
      }

      let prepared;
      let sanitized;
      let executionResult;

      try {
        if (typeof prepare === "function") {
          prepared = await prepare();
        }
      } catch (error) {
        logger.error("Cron action failed", {
          cron: cronName,
          action: actionName,
          stage: "prepare",
          reason: formatError(error),
          ...baseMeta
        });
        return { ok: false, stage: "prepare", reason: formatError(error) };
      }

      try {
        const validation = normalizeValidation(
          typeof validate === "function" ? await validate(prepared) : { ok: true }
        );

        if (!validation.ok) {
          writeWithLevel(logger, validateFailureLogLevel, "Cron action not executed", {
            cron: cronName,
            action: actionName,
            stage: "validate",
            reason: validation.reason || "validation_failed",
            ...validation.details,
            ...baseMeta
          });
          return { ok: false, stage: "validate", reason: validation.reason || "validation_failed" };
        }
      } catch (error) {
        logger.error("Cron action failed", {
          cron: cronName,
          action: actionName,
          stage: "validate",
          reason: formatError(error),
          ...baseMeta
        });
        return { ok: false, stage: "validate", reason: formatError(error) };
      }

      try {
        sanitized = typeof sanitize === "function" ? await sanitize(prepared) : prepared;
      } catch (error) {
        logger.error("Cron action failed", {
          cron: cronName,
          action: actionName,
          stage: "sanitize",
          reason: formatError(error),
          ...baseMeta
        });
        return { ok: false, stage: "sanitize", reason: formatError(error) };
      }

      try {
        executionResult = typeof execute === "function" ? await execute(sanitized, prepared) : undefined;
      } catch (error) {
        logger.error("Cron action failed", {
          cron: cronName,
          action: actionName,
          stage: "execute",
          reason: formatError(error),
          ...baseMeta
        });
        return { ok: false, stage: "execute", reason: formatError(error) };
      }

      try {
        const confirmation = normalizeConfirm(
          typeof confirm === "function"
            ? await confirm({ prepared, sanitized, executionResult })
            : { ok: true }
        );

        if (!confirmation.ok) {
          logger.warn("Cron action executed but not confirmed", {
            cron: cronName,
            action: actionName,
            stage: "confirm",
            reason: confirmation.reason || "not_confirmed",
            durationMs: Date.now() - startedAt,
            ...confirmation.details,
            ...baseMeta
          });
          return { ok: false, stage: "confirm", reason: confirmation.reason || "not_confirmed" };
        }

        if (logSuccess) {
          logger.info("Cron action completed", {
            cron: cronName,
            action: actionName,
            durationMs: Date.now() - startedAt,
            ...confirmation.details,
            ...baseMeta
          });
        }

        return { ok: true, durationMs: Date.now() - startedAt, result: executionResult };
      } catch (error) {
        logger.error("Cron action failed", {
          cron: cronName,
          action: actionName,
          stage: "confirm",
          reason: formatError(error),
          ...baseMeta
        });
        return { ok: false, stage: "confirm", reason: formatError(error) };
      }
    } finally {
      inFlight.delete(lockKey);
    }
  };
}

export { formatError };
