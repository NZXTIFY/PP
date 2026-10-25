import { createContext, useContext, useEffect, useReducer, useRef, useState, type Dispatch, type ReactNode } from 'react';
import type { AppData, Line, MonthBudget, Person, Period, SectionId, Settings, Transaction } from '../types';
import { lineKey, makeLine, templateLines } from '../lib/defaults';
import { monthId, newId } from '../lib/id';
import { clampStartDay } from '../lib/period';
import { emptyData, type StorageAdapter } from './storage';

type LinePatch = Partial<Pick<Line, 'name' | 'budget' | 'actual' | 'comment'>>;

export type Action =
  | { type: 'replace'; data: AppData }
  | { type: 'addPerson'; person: Person }
  | { type: 'renamePerson'; id: string; name: string }
  | { type: 'removePerson'; id: string }
  | { type: 'createMonth'; personId: string; period: Period; from?: MonthBudget }
  | { type: 'deleteMonth'; personId: string; period: Period }
  | { type: 'updateLine'; monthId: string; lineId: string; patch: LinePatch }
  | { type: 'addLine'; monthId: string; section: SectionId; name: string }
  | { type: 'removeLine'; monthId: string; lineId: string }
  | { type: 'moveLine'; monthId: string; lineId: string; dir: -1 | 1 }
  | { type: 'fillActuals'; monthId: string; lineIds: string[] }
  | { type: 'addTransaction'; tx: Transaction }
  | { type: 'updateTransaction'; id: string; patch: Partial<Omit<Transaction, 'id'>> }
  | { type: 'removeTransaction'; id: string }
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'importMonths'; persons: Person[]; months: MonthBudget[] };

const now = () => new Date().toISOString();

export function copyMonth(personId: string, period: Period, from?: MonthBudget): MonthBudget {
  const lines = from
    ? from.lines.map((l) => ({ ...l, id: newId(), actual: '', comment: '' }))
    : templateLines();
  return { id: monthId(personId, period), personId, period, lines, createdAt: now(), updatedAt: now() };
}

function withMonth(state: AppData, id: string, fn: (m: MonthBudget) => MonthBudget): AppData {
  const month = state.months[id];
  if (!month) return state;
  return { ...state, months: { ...state.months, [id]: { ...fn(month), updatedAt: now() } } };
}

function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case 'replace':
      return action.data;

    case 'addPerson':
      return { ...state, persons: [...state.persons, action.person] };

    case 'renamePerson':
      return {
        ...state,
        persons: state.persons.map((p) => (p.id === action.id ? { ...p, name: action.name } : p)),
      };

    case 'removePerson': {
      const months = Object.fromEntries(Object.entries(state.months).filter(([, m]) => m.personId !== action.id));
      return {
        ...state,
        persons: state.persons.filter((p) => p.id !== action.id),
        months,
        transactions: state.transactions.filter((t) => t.personId !== action.id),
      };
    }

    case 'createMonth': {
      const month = copyMonth(action.personId, action.period, action.from);
      return { ...state, months: { ...state.months, [month.id]: month } };
    }

    case 'deleteMonth': {
      const id = monthId(action.personId, action.period);
      const { [id]: _removed, ...months } = state.months;
      return {
        ...state,
        months,
        transactions: state.transactions.filter(
          (t) => !(t.personId === action.personId && t.period === action.period),
        ),
      };
    }

    case 'updateLine':
      return withMonth(state, action.monthId, (m) => ({
        ...m,
        lines: m.lines.map((l) => (l.id === action.lineId ? { ...l, ...action.patch } : l)),
      }));

    case 'addLine':
      return withMonth(state, action.monthId, (m) => {
        const base = lineKey(action.section, action.name);
        let key = base;
        for (let i = 2; m.lines.some((l) => l.key === key); i++) key = `${base}-${i}`;
        const line = { ...makeLine(action.section, action.name), key };
        // Lägg nya rader sist i sin sektion
        const lastIdx = m.lines.map((l) => l.section).lastIndexOf(action.section);
        const lines = [...m.lines];
        lines.splice(lastIdx === -1 ? lines.length : lastIdx + 1, 0, line);
        return { ...m, lines };
      });

    case 'removeLine': {
      const month = state.months[action.monthId];
      const line = month?.lines.find((l) => l.id === action.lineId);
      if (!month || !line) return state;
      const next = withMonth(state, action.monthId, (m) => ({
        ...m,
        lines: m.lines.filter((l) => l.id !== action.lineId),
      }));
      return {
        ...next,
        transactions: next.transactions.filter(
          (t) => !(t.personId === month.personId && t.period === month.period && t.lineKey === line.key),
        ),
      };
    }

    case 'moveLine':
      return withMonth(state, action.monthId, (m) => {
        const idx = m.lines.findIndex((l) => l.id === action.lineId);
        const line = m.lines[idx];
        // Hoppa till närmaste rad i samma sektion
        let target = idx + action.dir;
        while (target >= 0 && target < m.lines.length && m.lines[target].section !== line.section) {
          target += action.dir;
        }
        if (target < 0 || target >= m.lines.length) return m;
        const lines = [...m.lines];
        [lines[idx], lines[target]] = [lines[target], lines[idx]];
        return { ...m, lines };
      });

    case 'fillActuals':
      return withMonth(state, action.monthId, (m) => ({
        ...m,
        lines: m.lines.map((l) => (action.lineIds.includes(l.id) ? { ...l, actual: l.budget } : l)),
      }));

    case 'addTransaction':
      return { ...state, transactions: [...state.transactions, action.tx] };

    case 'updateTransaction':
      return {
        ...state,
        transactions: state.transactions.map((t) => (t.id === action.id ? { ...t, ...action.patch } : t)),
      };

    case 'removeTransaction':
      return { ...state, transactions: state.transactions.filter((t) => t.id !== action.id) };

    case 'settings': {
      const settings = { ...state.settings, ...action.patch };
      settings.periodStartDay = clampStartDay(settings.periodStartDay);
      return { ...state, settings };
    }

    case 'importMonths': {
      const known = new Set(state.persons.map((p) => p.id));
      const persons = [...state.persons, ...action.persons.filter((p) => !known.has(p.id))];
      const months = { ...state.months };
      for (const m of action.months) months[m.id] = m;
      return { ...state, persons, months };
    }
  }
}

interface StoreValue {
  data: AppData;
  dispatch: Dispatch<Action>;
  loaded: boolean;
  saveError: string | null;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ adapter, children }: { adapter: StorageAdapter; children: ReactNode }) {
  const [data, dispatch] = useReducer(reducer, undefined, emptyData);
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const skipNextSave = useRef(true);

  useEffect(() => {
    let cancelled = false;
    adapter.load().then((stored) => {
      if (cancelled) return;
      if (stored) dispatch({ type: 'replace', data: stored });
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [adapter]);

  useEffect(() => {
    if (!loaded) return;
    // Första körningen efter laddning är bara den inlästa datan – inget att spara.
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    adapter
      .save(data)
      .then(() => setSaveError(null))
      .catch((err: unknown) => setSaveError(err instanceof Error ? err.message : String(err)));
  }, [adapter, data, loaded]);

  return <StoreContext.Provider value={{ data, dispatch, loaded, saveError }}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore måste användas inuti StoreProvider');
  return ctx;
}
