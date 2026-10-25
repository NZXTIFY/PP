import { useSyncExternalStore } from 'react';

/** Visningsval som sparas per enhet (inte i hushållets data). */
export interface Prefs {
  /** Visa Faktiskt-kolumnen på budgetsidan */
  showActual: boolean;
  /** Id:n på summeringsrutor som användaren dolt */
  hiddenTiles: string[];
  /** Senaste fördelningen av hushållsköp, procent per person-id */
  split: Record<string, number>;
}

const KEY = 'budgetapp:prefs';
const DEFAULTS: Prefs = { showActual: true, hiddenTiles: [], split: {} };
const listeners = new Set<() => void>();

function read(): Prefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

let prefs = read();

export function setPrefs(patch: Partial<Prefs>) {
  prefs = { ...prefs, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* privat läge e.d. */
  }
  listeners.forEach((l) => l());
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => prefs,
  );
}
