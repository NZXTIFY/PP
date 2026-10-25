import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Period, Scope } from '../types';
import { HOUSEHOLD } from '../types';
import { currentPeriod } from '../lib/period';
import { useStore } from './store';

export type Tab = 'budget' | 'kop' | 'analys' | 'installningar';
const TABS: Tab[] = ['budget', 'kop', 'analys', 'installningar'];

interface UiValue {
  tab: Tab;
  setTab(tab: Tab): void;
  scope: Scope;
  setScope(scope: Scope): void;
  period: Period;
  setPeriod(period: Period): void;
  quickAdd: QuickAddState | null;
  openQuickAdd(opts?: QuickAddState): void;
  closeQuickAdd(): void;
}

export interface QuickAddState {
  lineKey?: string;
}

const UiContext = createContext<UiValue | null>(null);
const PREFS_KEY = 'budgetapp:ui';

function readPrefs(): { scope?: Scope } {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function tabFromHash(): Tab {
  const t = location.hash.replace(/^#\/?/, '') as Tab;
  return TABS.includes(t) ? t : 'budget';
}

export function UiProvider({ children }: { children: ReactNode }) {
  const { data } = useStore();
  const [tab, setTabState] = useState<Tab>(tabFromHash);
  const [scope, setScope] = useState<Scope>(() => readPrefs().scope ?? '');
  const [period, setPeriod] = useState<Period>(() => currentPeriod(data.settings.periodStartDay));
  const [quickAdd, setQuickAdd] = useState<QuickAddState | null>(null);
  const openQuickAdd = useCallback((opts: QuickAddState = {}) => setQuickAdd(opts), []);
  const closeQuickAdd = useCallback(() => setQuickAdd(null), []);

  useEffect(() => {
    const onHash = () => setTabState(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const setTab = useCallback((t: Tab) => {
    location.hash = `/${t}`;
    setTabState(t);
    window.scrollTo(0, 0);
  }, []);

  // Se till att scope alltid pekar på något som finns
  const validScope =
    data.persons.some((p) => p.id === scope) || (scope === HOUSEHOLD && data.persons.length > 1)
      ? scope
      : (data.persons[0]?.id ?? '');

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ scope: validScope }));
    } catch {
      /* privat läge e.d. */
    }
  }, [validScope]);

  // När data laddats in (eller periodens startdag ändras) – hoppa till aktuell period
  const startDay = data.settings.periodStartDay;
  useEffect(() => {
    setPeriod(currentPeriod(startDay));
  }, [startDay]);

  return (
    <UiContext.Provider
      value={{ tab, setTab, scope: validScope, setScope, period, setPeriod, quickAdd, openQuickAdd, closeQuickAdd }}
    >
      {children}
    </UiContext.Provider>
  );
}

export function useUi(): UiValue {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi måste användas inuti UiProvider');
  return ctx;
}
