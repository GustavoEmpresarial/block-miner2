import loggerLib from "../utils/logger.js";
import { createCronActionRunner } from "./cronActionRunner.js";

const logger = loggerLib.child("MiningCron");

const DEFAULT_TICK_MS = 1000;
const DEFAULT_PERSIST_MS = 15000;

export function startMiningLoop({ engine, io, persistMinerProfile, buildPublicState }, options = {}) {
  const tickMs = Number(options.tickMs || DEFAULT_TICK_MS);
  const persistMs = Number(options.persistMs || DEFAULT_PERSIST_MS);
  const startupProbeMs = Number(options.startupProbeMs || 10_000);
  const syncEngineMiners = typeof options.syncEngineMiners === "function" ? options.syncEngineMiners : null;
  const syncUserBaseHashRate = typeof options.syncUserBaseHashRate === "function" ? options.syncUserBaseHashRate : null;
  const runCronAction = createCronActionRunner({ logger, cronName: "MiningCron" });

  const startedAt = Date.now();
  const startupMetrics = {
    tickSuccess: 0,
    tickFailed: 0,
    persistSuccess: 0,
    persistFailed: 0,
    firstTickAt: null,
    firstPersistAt: null,
    lastTickReason: null,
    lastPersistReason: null
  };

  const tick = async () => {
    const result = await runCronAction({
      action: "mining_tick",
      logStart: false,
      logSuccess: false,
      skippedLogLevel: "debug",
      validateFailureLogLevel: "debug",
      validate: async () => {
        if (!engine || typeof engine.tick !== "function") {
          return { ok: false, reason: "invalid_engine" };
        }
        if (!io || typeof io.emit !== "function") {
          return { ok: false, reason: "invalid_socket_io" };
        }
        return { ok: true };
      },
      sanitize: async () => ({ hasPublicStateBuilder: typeof buildPublicState === "function" }),
      execute: async ({ hasPublicStateBuilder }) => {
        engine.tick();
        const globalState = hasPublicStateBuilder ? await buildPublicState() : engine.getPublicState();
        io.emit("state:update", globalState);

        // Broadcast personal state securely to individual rooms
        for (const miner of engine.miners.values()) {
          if (miner.connected) {
            const userState = hasPublicStateBuilder ? await buildPublicState(miner.id) : engine.getPublicState(miner.id);
            if (userState && userState.miner) {
              io.to(`user:${miner.userId}`).emit("miner:update", userState.miner);
            }
          }
        }

        return { emitted: true, source: hasPublicStateBuilder ? "publicStateService" : "engine" };
      },
      confirm: async ({ executionResult }) => ({
        ok: Boolean(executionResult?.emitted),
        reason: executionResult?.emitted ? null : "state_not_emitted"
      })
    });

    if (result.ok) {
      startupMetrics.tickSuccess += 1;
      if (!startupMetrics.firstTickAt) startupMetrics.firstTickAt = Date.now();
    } else {
      startupMetrics.tickFailed += 1;
      startupMetrics.lastTickReason = result.reason || result.stage || "tick_failed";
    }

    return result;
  };

  const tickTimer = setInterval(() => {
    tick().catch((error) => {
      logger.error("Mining tick unexpected error", { error: error.message });
    });
  }, tickMs);

  const persist = async () => {
    const result = await runCronAction({
      action: "persist_miners",
      logStart: false,
      logSuccess: false,
      skippedLogLevel: "debug",
      validateFailureLogLevel: "debug",
      validate: async () => {
        if (!engine || !engine.miners || typeof engine.miners.values !== "function") {
          return { ok: false, reason: "invalid_engine_miners" };
        }
        if (typeof persistMinerProfile !== "function") {
          return { ok: false, reason: "invalid_persist_function" };
        }
        return { ok: true };
      },
      sanitize: async () => ({
        miners: [...engine.miners.values()]
      }),
      execute: async ({ miners }) => {
        if (syncUserBaseHashRate) {
          const userIds = [...new Set(miners.map((m) => m.userId).filter(Boolean))];
          await Promise.all(userIds.map((userId) => syncUserBaseHashRate(userId)));
        }

        if (syncEngineMiners) {
          await syncEngineMiners();
        }

        const saves = miners.map((miner) => persistMinerProfile(miner));
        const settled = await Promise.allSettled(saves);
        const fulfilled = settled.filter((entry) => entry.status === "fulfilled").length;
        const rejected = settled.length - fulfilled;
        return { total: settled.length, fulfilled, rejected };
      },
      confirm: async ({ executionResult }) => ({
        ok: executionResult.rejected === 0,
        reason: executionResult.rejected === 0 ? null : "miner_persist_partial_failure",
        details: executionResult
      })
    });

    if (result.ok) {
      startupMetrics.persistSuccess += 1;
      if (!startupMetrics.firstPersistAt) startupMetrics.firstPersistAt = Date.now();
    } else {
      startupMetrics.persistFailed += 1;
      startupMetrics.lastPersistReason = result.reason || result.stage || "persist_failed";
    }

    return result;
  };

  const persistTimer = setInterval(persist, persistMs);

  const startupProbeTimer = setTimeout(() => {
    const uptimeMs = Date.now() - startedAt;
    const tickOk = startupMetrics.tickSuccess > 0 && startupMetrics.tickFailed === 0;

    const persistWindowReached = uptimeMs >= persistMs;
    const persistOk = persistWindowReached
      ? startupMetrics.persistSuccess > 0 && startupMetrics.persistFailed === 0
      : true;

    const payoutDone = Number(engine?.lastReward || 0) > 0;
    const payoutStatus = payoutDone ? "ok" : "waiting";

    const payload = {
      uptimeMs,
      tick: { ok: tickOk, success: startupMetrics.tickSuccess, failed: startupMetrics.tickFailed },
      persist: { ok: persistOk, checked: persistWindowReached, success: startupMetrics.persistSuccess, failed: startupMetrics.persistFailed },
      payout: { status: payoutStatus, lastReward: Number(engine?.lastReward || 0) }
    };

    if (tickOk && persistOk) {
      logger.info("Mining startup check (10s) - OK", payload);
    } else {
      logger.warn("Mining startup check (10s) - Issues detected", payload);
    }
  }, startupProbeMs);

  logger.info("Mining cron started", { tickMs, persistMs, startupProbeMs });

  return { tickTimer, persistTimer, startupProbeTimer };
}
