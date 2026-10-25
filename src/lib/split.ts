import type { Transaction } from '../types';

/**
 * Delar ett belopp enligt andelar (som summerar till 1). Avrundas till hela ören och
 * sista personen får resten, så att delarna alltid blir exakt totalen.
 */
export function splitAmount(total: number, shares: number[]): number[] {
  const parts = shares.map((s) => Math.round(total * s * 100) / 100);
  const rest = Math.round((total - parts.slice(0, -1).reduce((a, b) => a + b, 0)) * 100) / 100;
  parts[parts.length - 1] = rest;
  return parts;
}

/** Procent per person som summerar till exakt 100. */
export function evenPercents(count: number): number[] {
  const base = Math.floor(100 / count);
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? 100 - base * (count - 1) : base));
}

/** Procent i proportion till respektive inkomst, t.ex. 46/54. */
export function incomePercents(incomes: number[]): number[] | null {
  const total = incomes.reduce((a, b) => a + b, 0);
  if (total <= 0 || incomes.some((i) => i <= 0)) return null;
  const pct = incomes.map((i) => Math.round((i / total) * 100));
  pct[pct.length - 1] = 100 - pct.slice(0, -1).reduce((a, b) => a + b, 0);
  return pct;
}

/** Alla delar av samma köp (eller bara köpet självt om det inte är delat). */
export function splitGroup(all: Transaction[], tx: Transaction): Transaction[] {
  return tx.splitId ? all.filter((t) => t.splitId === tx.splitId) : [tx];
}
