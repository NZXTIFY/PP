import { describe, expect, it } from 'vitest';
import { evaluate, isFormula } from './expr';
import { addMonths, parseMonthWord, periodOf, periodRange, rangeLabel } from './period';
import { computeLines, deviation, mergeLines, summarize } from './calc';
import { evenPercents, incomePercents, splitAmount } from './split';
import type { MonthBudget } from '../types';

describe('evaluate', () => {
  it('räknar ut summor som i Excel-cellerna', () => {
    expect(evaluate('6170+1005+2286')).toBe(9461);
    expect(evaluate('=450+74')).toBe(524);
    expect(evaluate('1 817 + 244')).toBe(2061);
    expect(evaluate('40222-3594')).toBe(36628);
  });
  it('hanterar decimalkomma, parenteser och multiplikation', () => {
    expect(evaluate('12,50')).toBe(12.5);
    expect(evaluate('(100+50)*2')).toBe(300);
    expect(evaluate('4x129')).toBe(516);
    expect(evaluate('-200')).toBe(-200);
  });
  it('tomt är 0, skräp är null', () => {
    expect(evaluate('')).toBe(0);
    expect(evaluate('abc')).toBeNull();
    expect(evaluate('5+')).toBeNull();
    expect(evaluate('(1+2')).toBeNull();
  });
  it('känner igen uttryck', () => {
    expect(isFormula('1700+2266')).toBe(true);
    expect(isFormula('2500')).toBe(false);
    expect(isFormula('-200')).toBe(false);
  });
});

describe('period', () => {
  it('lön till lön: 25:e och framåt hör till nästa månads budget', () => {
    expect(periodOf('2026-10-24', 25)).toBe('2026-10');
    expect(periodOf('2026-10-25', 25)).toBe('2026-11');
    expect(periodOf('2026-12-28', 25)).toBe('2027-01');
  });
  it('kalendermånad med startdag 1', () => {
    expect(periodOf('2026-10-31', 1)).toBe('2026-10');
    expect(periodRange('2026-02', 1)).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });
  it('periodens datumintervall', () => {
    expect(periodRange('2026-11', 25)).toEqual({ start: '2026-10-25', end: '2026-11-24' });
    expect(periodRange('2027-01', 25)).toEqual({ start: '2026-12-25', end: '2027-01-24' });
    expect(rangeLabel('2026-11', 25)).toBe('25 okt – 24 nov');
  });
  it('addMonths över årsskifte', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });
  it('tolkar månadsord från bladnamn', () => {
    expect(parseMonthWord('sept')).toBe(9);
    expect(parseMonthWord('okt')).toBe(10);
    expect(parseMonthWord('Pelle')).toBeNull();
  });
});

describe('split', () => {
  it('delar exakt, även när det inte går jämnt ut', () => {
    expect(splitAmount(1000, [0.4, 0.6])).toEqual([400, 600]);
    expect(splitAmount(99.99, [0.5, 0.5])).toEqual([50, 49.99]);
    const three = splitAmount(100, [1 / 3, 1 / 3, 1 / 3]);
    expect(three.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10);
  });
  it('procentsatser summerar alltid till 100', () => {
    expect(evenPercents(2)).toEqual([50, 50]);
    expect(evenPercents(3)).toEqual([33, 33, 34]);
    expect(incomePercents([31266, 36628])).toEqual([46, 54]);
    expect(incomePercents([0, 1000])).toBeNull();
  });
});

describe('calc', () => {
  const month: MonthBudget = {
    id: 'p:2026-10',
    personId: 'p',
    period: '2026-10',
    createdAt: '',
    updatedAt: '',
    lines: [
      { id: '1', key: 'income:lon', section: 'income', name: 'Lön', budget: '29148', actual: '30448', comment: '' },
      { id: '2', key: 'fixed:hyra', section: 'fixed', name: 'Hyra', budget: '6170+1005+2286', actual: '9461', comment: '' },
      { id: '3', key: 'variable:noje', section: 'variable', name: 'Nöje', budget: '2500', actual: '1817', comment: '' },
      { id: '4', key: 'savings:buffert', section: 'savings', name: 'Buffert', budget: '2600', actual: '2600', comment: '' },
    ],
  };

  it('loggade köp läggs ovanpå manuellt utfall', () => {
    const lines = computeLines(month, [
      { id: 't', personId: 'p', period: '2026-10', lineKey: 'variable:noje', amount: 244, date: '2026-10-10', note: '', createdAt: '' },
    ]);
    const noje = lines.find((l) => l.key === 'variable:noje')!;
    expect(noje.actual).toBe(2061);
    expect(noje.logged).toBe(244);
    expect(noje.txCount).toBe(1);
  });

  it('summerar som Excel-mallen', () => {
    const s = summarize(computeLines(month, []));
    expect(s.sections.fixed.budget).toBe(9461);
    expect(s.outflow.budget).toBe(9461 + 2500 + 2600);
    expect(s.result.budget).toBe(29148 - (9461 + 2500 + 2600));
    expect(s.result.actual).toBe(30448 - (9461 + 1817 + 2600));
    expect(s.withinBudget).toBe(2);
    expect(s.expenseLines).toBe(2);
  });

  it('hushållsprognosen räknas per person innan raderna slås ihop', () => {
    const other: MonthBudget = {
      ...month,
      id: 'q:2026-10',
      personId: 'q',
      lines: month.lines.map((l) => ({ ...l, budget: '100', actual: '' })),
    };
    const merged = summarize(mergeLines([computeLines(month, []), computeLines(other, [])]));
    const own = summarize(computeLines(month, []));
    // Den andra personen har inget utfall: inkomst 100 − (100+100+100) = −200 enligt budget
    expect(merged.forecast.result).toBe(own.result.actual - 200);
    expect(merged.unfilled).toBe(4);
  });

  it('avvikelse är positiv när det går bättre än budget', () => {
    expect(deviation('variable', 2500, 1817)).toBe(683);
    expect(deviation('income', 29148, 30448)).toBe(1300);
    expect(deviation('savings', 2600, 0)).toBe(-2600);
  });
});
