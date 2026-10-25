import { useSyncExternalStore } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'budgetapp:theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<() => void>();

function readPref(): ThemePref {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

let pref = readPref();

/** Sätter data-theme på <html>; "system" tar bort det så att OS-inställningen gäller. */
function apply() {
  const root = document.documentElement;
  if (pref === 'system') delete root.dataset.theme;
  else root.dataset.theme = pref;
  const dark = pref === 'dark' || (pref === 'system' && media.matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0d0d0d' : '#f6f6f3');
}

apply();
media.addEventListener('change', () => {
  apply();
  listeners.forEach((l) => l());
});

export function setThemePref(next: ThemePref) {
  pref = next;
  try {
    if (next === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    /* privat läge e.d. */
  }
  apply();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Valt tema och vilket som faktiskt visas just nu. */
export function useTheme(): { pref: ThemePref; dark: boolean } {
  const current = useSyncExternalStore(subscribe, () => pref);
  const systemDark = useSyncExternalStore(subscribe, () => media.matches);
  return { pref: current, dark: current === 'dark' || (current === 'system' && systemDark) };
}
