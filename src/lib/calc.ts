import type { AppData, Line, MonthBudget, Period, Scope, SectionId, Transaction } from '../types';
import { HOUSEHOLD } from '../types';
import { evalOr0 } from './expr';
import { monthId } from './id';
import { evenPercents, incomePercents, percentsFor } from './split';

/** En rad med uträknade belopp. */
export interface CLine {
  key: string;
  section: SectionId;
  name: string;
  budget: number;
  /** manual + logged */
  actual: number;
  manual: number;
  logged: number;
  txCount: number;
  /** Om någon har fyllt i faktiskt (manuellt eller via köp). */
  hasActual: boolean;
  /** Utfall om ifyllt, annars budget – räknas per person innan rader slås ihop. */
  forecast: number;
  /**
   * Budget för de delar som har utfall. Avvikelser jämförs mot denna, så att en person
   * som inte fyllt i än inte ser ut att ligga under budget i hushållsvyn.
   */
  filledBudget: number;
  /** Antal (person)rader med budget men utan utfall. */
  unfilled: number;
  line?: Line;
}

export interface Totals {
  budget: number;
  actual: number;
}

export interface Summary {
  sections: Record<SectionId, Totals>;
  /** fasta + rörliga + sparande */
  outflow: Totals;
  /** fasta + rörliga */
  spending: Totals;
  /** inkomster − (fasta + rörliga + sparande) */
  result: Totals;
  savingsRate: Totals;
  /**
   * Prognos: utfall där det finns, annars budget. Mitt i en månad svarar den på
   * "hur slutar månaden om resten går enligt plan?". För en helt ifylld månad = faktiskt.
   */
  forecast: {
    income: number;
    savings: number;
    result: number;
    savingsRate: number;
    sections: Record<SectionId, number>;
  };
  /** Utgiftsrader (fasta+rörliga) med ifyllt utfall */
  expenseLines: number;
  /** ... varav inom budget */
  withinBudget: number;
  /** Summan av alla överskridanden på utgiftsrader */
  overspend: number;
  /** Något utfall alls är ifyllt */
  hasActuals: boolean;
  /** Utfall finns på minst en utgiftsrad – månaden räknas som uppföljd i analysen */
  followedUp: boolean;
  /** Rader med budget som saknar utfall */
  unfilled: number;
}

const EXPENSE: SectionId[] = ['fixed', 'variable'];
const SECTION_IDS: SectionId[] = ['income', 'fixed', 'variable', 'savings'];

export function isExpense(section: SectionId): boolean {
  return EXPENSE.includes(section);
}

/**
 * Avvikelse där positivt alltid är bra: mindre utgifter än budget,
 * eller mer inkomst/sparande än budget.
 */
export function deviation(section: SectionId, budget: number, actual: number): number {
  return isExpense(section) ? budget - actual : actual - budget;
}

export function transactionsFor(data: AppData, personId: string, period: Period): Transaction[] {
  return data.transactions.filter((t) => t.personId === personId && t.period === period);
}

export function computeLines(month: MonthBudget, txs: Transaction[]): CLine[] {
  return month.lines.map((line) => {
    const mine = txs.filter((t) => t.lineKey === line.key);
    const logged = mine.reduce((sum, t) => sum + t.amount, 0);
    const manual = evalOr0(line.actual);
    const budget = evalOr0(line.budget);
    const hasActual = line.actual.trim() !== '' || mine.length > 0;
    return {
      key: line.key,
      section: line.section,
      name: line.name,
      budget,
      manual,
      logged,
      actual: manual + logged,
      txCount: mine.length,
      hasActual,
      forecast: hasActual ? manual + logged : budget,
      filledBudget: hasActual ? budget : 0,
      unfilled: !hasActual && budget !== 0 ? 1 : 0,
      line,
    };
  });
}

/** Slår ihop rader från flera personer på nyckel (hushållsvyn). */
export function mergeLines(lists: CLine[][]): CLine[] {
  const byKey = new Map<string, CLine>();
  for (const list of lists) {
    for (const l of list) {
      const prev = byKey.get(l.key);
      if (!prev) {
        byKey.set(l.key, { ...l, line: undefined });
      } else {
        prev.budget += l.budget;
        prev.actual += l.actual;
        prev.manual += l.manual;
        prev.logged += l.logged;
        prev.txCount += l.txCount;
        prev.forecast += l.forecast;
        prev.filledBudget += l.filledBudget;
        prev.unfilled += l.unfilled;
        prev.hasActual ||= l.hasActual;
      }
    }
  }
  return [...byKey.values()];
}

export function personMonth(data: AppData, personId: string, period: Period): MonthBudget | undefined {
  return data.months[monthId(personId, period)];
}

/** Rader för en person eller hela hushållet; null om ingen budget finns för perioden. */
export function linesFor(data: AppData, scope: Scope, period: Period): CLine[] | null {
  if (scope !== HOUSEHOLD) {
    const month = personMonth(data, scope, period);
    return month ? computeLines(month, transactionsFor(data, scope, period)) : null;
  }
  const lists = data.persons
    .map((p) => {
      const month = personMonth(data, p.id, period);
      return month ? computeLines(month, transactionsFor(data, p.id, period)) : null;
    })
    .filter((l): l is CLine[] => l !== null);
  return lists.length ? mergeLines(lists) : null;
}

function sum(lines: CLine[], pick: (l: CLine) => number): number {
  return lines.reduce((s, l) => s + pick(l), 0);
}

export function summarize(lines: CLine[]): Summary {
  const sections = {} as Record<SectionId, Totals>;
  for (const id of SECTION_IDS) {
    const ls = lines.filter((l) => l.section === id);
    sections[id] = { budget: sum(ls, (l) => l.budget), actual: sum(ls, (l) => l.actual) };
  }
  const spending = {
    budget: sections.fixed.budget + sections.variable.budget,
    actual: sections.fixed.actual + sections.variable.actual,
  };
  const outflow = {
    budget: spending.budget + sections.savings.budget,
    actual: spending.actual + sections.savings.actual,
  };
  const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

  const expenseLines = lines.filter((l) => isExpense(l.section) && l.hasActual && (l.budget !== 0 || l.actual !== 0));
  const within = expenseLines.filter((l) => l.actual <= l.filledBudget);
  const overspend = sum(expenseLines, (l) => Math.max(0, l.actual - l.filledBudget));

  const fSections = {} as Record<SectionId, number>;
  for (const id of SECTION_IDS) fSections[id] = sum(lines.filter((l) => l.section === id), (l) => l.forecast);
  const fOutflow = fSections.fixed + fSections.variable + fSections.savings;

  return {
    forecast: {
      income: fSections.income,
      savings: fSections.savings,
      result: fSections.income - fOutflow,
      savingsRate: ratio(fSections.savings, fSections.income),
      sections: fSections,
    },
    followedUp: lines.some((l) => isExpense(l.section) && l.hasActual),
    unfilled: sum(lines, (l) => l.unfilled),
    sections,
    spending,
    outflow,
    result: {
      budget: sections.income.budget - outflow.budget,
      actual: sections.income.actual - outflow.actual,
    },
    savingsRate: {
      budget: ratio(sections.savings.budget, sections.income.budget),
      actual: ratio(sections.savings.actual, sections.income.actual),
    },
    expenseLines: expenseLines.length,
    withinBudget: within.length,
    overspend,
    hasActuals: lines.some((l) => l.hasActual),
  };
}

/** Alla perioder där scope har en budget, sorterade. */
export function periodsWithData(data: AppData, scope: Scope): Period[] {
  const set = new Set<Period>();
  for (const m of Object.values(data.months)) {
    if (scope === HOUSEHOLD || m.personId === scope) set.add(m.period);
  }
  return [...set].sort();
}

/** Senaste månaden före `period` som personen har en budget för. */
export function previousMonth(data: AppData, personId: string, period: Period): MonthBudget | undefined {
  return Object.values(data.months)
    .filter((m) => m.personId === personId && m.period < period)
    .sort((a, b) => (a.period < b.period ? 1 : -1))[0];
}

/** Budgeterad inkomst per person för perioden (eller senaste månaden före, om den inte skapats än). */
export function budgetIncomes(data: AppData, personIds: string[], period: Period): number[] {
  return personIds.map((pid) => {
    const month = personMonth(data, pid, period) ?? previousMonth(data, pid, period);
    return (month?.lines ?? []).filter((l) => l.section === 'income').reduce((s, l) => s + evalOr0(l.budget), 0);
  });
}

/** Hur ett köp på hushållets gemensamma kort delas, i procent per person i hushållets ordning. */
export function householdPercents(data: AppData, period: Period): number[] {
  const ids = data.persons.map((p) => p.id);
  const setting = data.settings.householdSplit;
  const even = evenPercents(ids.length || 1);
  if (setting?.mode === 'even') return even;
  if (setting?.mode === 'custom') return percentsFor(setting.percents, ids) ?? even;
  return incomePercents(budgetIncomes(data, ids, period)) ?? even;
}

export interface HistoryPoint {
  period: Period;
  budget: number;
  actual: number;
  hasActual: boolean;
}

/** Budget och utfall för en rad (nyckel) över tid. */
export function lineHistory(data: AppData, scope: Scope, key: string, periods: Period[]): HistoryPoint[] {
  return periods.flatMap((period) => {
    const lines = linesFor(data, scope, period);
    const l = lines?.find((x) => x.key === key);
    return l ? [{ period, budget: l.budget, actual: l.actual, hasActual: l.hasActual }] : [];
  });
}
