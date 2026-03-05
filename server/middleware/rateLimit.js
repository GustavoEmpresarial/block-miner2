export function createRateLimiter({
  windowMs = 60_000,
  max = 30,
  keyGenerator,
  skip,
  message = "Too many requests. Slow down.",
  statusCode = 429,
  cleanupIntervalMs = 5 * 60_000,
  staleAfterMs = windowMs * 2,
  maxKeys = 10_000
} = {}) {
  const hits = new Map();
  const resolveKey =
    typeof keyGenerator === "function"
      ? keyGenerator
      : (req) => {
          const userId = req.user?.id ? `user:${req.user.id}` : "anon";
          return `${req.ip}:${req.path}:${userId}`;
        };

  let lastCleanupAt = Date.now();

  function cleanup(now) {
    for (const [key, entry] of hits) {
      if (!entry || now - (entry.lastSeenAt || 0) > staleAfterMs) {
        hits.delete(key);
      }
    }
    if (maxKeys > 0 && hits.size > maxKeys) {
      const entries = Array.from(hits.entries()).map(([key, entry]) => [key, entry?.lastSeenAt || 0]);
      entries.sort((a, b) => a[1] - b[1]);
      const toRemove = hits.size - maxKeys;
      for (let i = 0; i < toRemove; i += 1) {
        hits.delete(entries[i][0]);
      }
    }
  }

  return (req, res, next) => {
    if (typeof skip === "function" && skip(req)) {
      next();
      return;
    }
    const now = Date.now();
    if (cleanupIntervalMs > 0 && now - lastCleanupAt >= cleanupIntervalMs) {
      cleanup(now);
      lastCleanupAt = now;
    }
    const key = resolveKey(req);
    const entry = hits.get(key) || { count: 0, resetAt: now + windowMs, lastSeenAt: now };
    if (now > entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + windowMs;
    }
    entry.lastSeenAt = now;
    entry.count += 1;
    hits.set(key, entry);
    const remaining = Math.max(max - entry.count, 0);
    const retryAfterSeconds = Math.max(Math.ceil((entry.resetAt - now) / 1000), 1);
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));
    if (entry.count > max) {
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(statusCode).json({ ok: false, message });
      return;
    }
    next();
  };
}
