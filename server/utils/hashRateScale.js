const BILLION = 1_000_000_000;
const MAX_STRIP_ITERATIONS = 16;

/**
 * Remove fatores acidentais de 10^9 em valores armazenados como H/s.
 * Cenários típicos: migração GH→H/s aplicada duas vezes; ou "5" (5 H/s) confundido com 5 GH/s (5e9).
 * Este projeto trata o hashrate de sala/bónus na ordem de centenas–milhões de H/s, não GH/s inteiros.
 *
 * @param {unknown} raw
 * @returns {number}
 */
export function stripAccidentalBillionScaleHs(raw) {
  let v = Number(raw);
  if (!Number.isFinite(v) || v === 0) return 0;
  const sign = v < 0 ? -1 : 1;
  v = Math.abs(v);
  let i = 0;
  while (v >= BILLION && i < MAX_STRIP_ITERATIONS) {
    v /= BILLION;
    i++;
  }
  return sign * v;
}
