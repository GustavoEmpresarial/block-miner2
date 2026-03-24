export function getBrazilCheckinDateKey(date = new Date()) {
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  const brDate = new Date(utc + 3600000 * -3);
  const yyyy = brDate.getFullYear();
  const mm = String(brDate.getMonth() + 1).padStart(2, "0");
  const dd = String(brDate.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Dia civil anterior a `YYYY-MM-DD` (UTC calendar math; alinhado a chaves guardadas na BD). */
export function previousCalendarDateKey(yyyyMmDd) {
  const raw = String(yyyyMmDd || "").split("T")[0].slice(0, 10);
  const parts = raw.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [y, m, d] = parts;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(dt.getTime())) return null;
  dt.setUTCDate(dt.getUTCDate() - 1);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Sequência de dias consecutivos com check-in confirmado, usando o mesmo calendário que `checkinDate` (Brasil).
 * Evita usar `Date` no fuso do servidor (Docker UTC), que inflava a sequência em relação às chaves gravadas.
 */
export function computeBrazilStreak(confirmedDateStrings, todayKey = getBrazilCheckinDateKey()) {
  const set = new Set(confirmedDateStrings.map((s) => String(s).split("T")[0].slice(0, 10)));
  let streak = 0;
  let key = todayKey;
  for (let i = 0; i < 400 && key; i++) {
    if (!set.has(key)) break;
    streak += 1;
    key = previousCalendarDateKey(key);
  }
  return streak;
}
