import type { Period } from '../types';

const MONTHS = [
  'januari', 'februari', 'mars', 'april', 'maj', 'juni',
  'juli', 'augusti', 'september', 'oktober', 'november', 'december',
];
const SHORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

export function clampStartDay(day: number): number {
  return Math.min(28, Math.max(1, Math.round(day) || 1));
}

export function makePeriod(year: number, month1: number): Period {
  const d = new Date(Date.UTC(year, month1 - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function splitPeriod(period: Period): { year: number; month: number } {
  const [y, m] = period.split('-').map(Number);
  return { year: y, month: m };
}

export function addMonths(period: Period, n: number): Period {
  const { year, month } = splitPeriod(period);
  return makePeriod(year, month + n);
}

/**
 * Vilken budgetmånad ett datum hör till. Med startdag 25 hör 25 okt till novemberbudgeten,
 * dvs perioden namnges efter månaden den slutar i.
 */
export function periodOf(dateISO: string, startDay: number): Period {
  const [y, m, d] = dateISO.split('-').map(Number);
  const start = clampStartDay(startDay);
  if (start > 1 && d >= start) return makePeriod(y, m + 1);
  return makePeriod(y, m);
}

function iso(y: number, m0: number, d: number): string {
  const date = new Date(Date.UTC(y, m0, d));
  return date.toISOString().slice(0, 10);
}

export function periodRange(period: Period, startDay: number): { start: string; end: string } {
  const { year, month } = splitPeriod(period);
  const start = clampStartDay(startDay);
  if (start === 1) {
    return { start: iso(year, month - 1, 1), end: iso(year, month, 0) };
  }
  return { start: iso(year, month - 2, start), end: iso(year, month - 1, start - 1) };
}

export function todayISO(): string {
  const now = new Date();
  return iso(now.getFullYear(), now.getMonth(), now.getDate());
}

export function currentPeriod(startDay: number): Period {
  return periodOf(todayISO(), startDay);
}

/** "november 2026" */
export function periodLabel(period: Period): string {
  const { year, month } = splitPeriod(period);
  return `${MONTHS[month - 1]} ${year}`;
}

/** "nov" eller "nov -26" om året skiljer sig från referensåret. */
export function shortLabel(period: Period, withYear = false): string {
  const { year, month } = splitPeriod(period);
  return withYear ? `${SHORT[month - 1]} -${String(year).slice(2)}` : SHORT[month - 1];
}

export function monthName(month1: number): string {
  return MONTHS[month1 - 1];
}

function dayLabel(dateISO: string): string {
  const [, m, d] = dateISO.split('-').map(Number);
  return `${d} ${SHORT[m - 1]}`;
}

/** "25 okt – 24 nov" */
export function rangeLabel(period: Period, startDay: number): string {
  const { start, end } = periodRange(period, startDay);
  return `${dayLabel(start)} – ${dayLabel(end)}`;
}

export type PeriodStatus = 'past' | 'current' | 'future';

export function periodStatus(period: Period, startDay: number): PeriodStatus {
  const now = currentPeriod(startDay);
  if (period === now) return 'current';
  return period < now ? 'past' : 'future';
}

/** Alla perioder från och med `from` till och med `to`. */
export function periodsBetween(from: Period, to: Period): Period[] {
  const out: Period[] = [];
  for (let p = from; p <= to; p = addMonths(p, 1)) out.push(p);
  return out;
}

/** Tolkar svenska månadsnamn/förkortningar, t.ex. "sept", "okt". Returnerar 1–12 eller null. */
export function parseMonthWord(word: string): number | null {
  const w = word.toLowerCase().replace(/\.$/, '');
  if (w.length < 3) return null;
  const idx = MONTHS.findIndex((name) => name.startsWith(w));
  return idx === -1 ? null : idx + 1;
}
