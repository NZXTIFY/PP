import type { Dispatch } from 'react';
import type { AppData, Line, Period, Transaction } from '../types';
import type { Action } from './store';
import { personMonth, previousMonth } from '../lib/calc';
import { monthId, newId } from '../lib/id';
import { periodOf } from '../lib/period';
import { splitAmount } from '../lib/split';

export interface Purchase {
  /** En person, eller alla i hushållet när köpet delas */
  personIds: string[];
  /** Andelar i procent, i samma ordning som personIds (bara för delade köp) */
  percents?: number[];
  line: Pick<Line, 'key' | 'section' | 'name'>;
  amount: number;
  /** "YYYY-MM-DD" */
  date: string;
  note: string;
  /** Fasta id:n gör att samma köp inte kan bokföras två gånger (t.ex. från två enheter) */
  idBase?: string;
  source?: Transaction['source'];
}

export interface Booked {
  period: Period;
  /** Personer som fick en ny budgetmånad kopierad från föregående */
  createdMonths: string[];
  txIds: string[];
}

/**
 * Bokför ett köp: skapar budgetmånaden från föregående om den saknas, ser till att raden finns
 * och lägger en transaktion per person. Ett delat köp fördelas efter andelarna.
 */
export function bookPurchase(data: AppData, dispatch: Dispatch<Action>, p: Purchase): Booked {
  const period = periodOf(p.date, data.settings.periodStartDay);
  const shared = p.personIds.length > 1;
  const percents = p.percents ?? p.personIds.map(() => 100 / p.personIds.length);
  const amounts = shared ? splitAmount(p.amount, percents.map((x) => x / 100)) : [p.amount];
  const splitId = shared ? (p.idBase ?? newId()) : undefined;
  const result: Booked = { period, createdMonths: [], txIds: [] };

  p.personIds.forEach((pid, i) => {
    if (shared && amounts[i] === 0) return;
    if (!personMonth(data, pid, period)) {
      dispatch({ type: 'createMonth', personId: pid, period, from: previousMonth(data, pid, period) });
      result.createdMonths.push(pid);
    }
    dispatch({ type: 'ensureLine', monthId: monthId(pid, period), key: p.line.key, section: p.line.section, name: p.line.name });
    const id = p.idBase ? (shared ? `${p.idBase}-${i}` : p.idBase) : newId();
    dispatch({
      type: 'addTransaction',
      tx: {
        id,
        personId: pid,
        period,
        lineKey: p.line.key,
        amount: amounts[i],
        date: p.date,
        note: p.note.trim(),
        createdAt: new Date().toISOString(),
        splitId,
        share: shared ? percents[i] / 100 : undefined,
        source: p.source,
      },
    });
    result.txIds.push(id);
  });
  return result;
}
