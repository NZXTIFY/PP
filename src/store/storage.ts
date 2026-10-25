import type { AppData } from '../types';

/**
 * Allt som läser/skriver data går genom ett StorageAdapter. I dag sparas allt lokalt i
 * webbläsaren; för att flytta till Firebase räcker det att skriva en FirestoreAdapter med
 * samma två metoder och byta ut den i main.tsx.
 */
export interface StorageAdapter {
  load(): Promise<AppData | null>;
  save(data: AppData): Promise<void>;
}

export function emptyData(): AppData {
  return { version: 1, persons: [], months: {}, transactions: [], settings: { periodStartDay: 25 } };
}

/** Säkerställer att data (från lagring eller en backupfil) har rätt form. */
export function normalizeData(raw: unknown): AppData {
  if (!raw || typeof raw !== 'object') throw new Error('Filen innehåller ingen budgetdata.');
  const d = raw as Partial<AppData>;
  if (d.version !== 1 || !Array.isArray(d.persons) || typeof d.months !== 'object') {
    throw new Error('Okänt format – är det en backup från den här appen?');
  }
  return {
    version: 1,
    persons: d.persons,
    months: d.months ?? {},
    transactions: Array.isArray(d.transactions) ? d.transactions : [],
    settings: { periodStartDay: 25, ...d.settings },
  };
}

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly key = 'budgetapp:data:v1') {}

  async load(): Promise<AppData | null> {
    const raw = localStorage.getItem(this.key);
    if (!raw) return null;
    try {
      return normalizeData(JSON.parse(raw));
    } catch (err) {
      // Spara undan det trasiga innehållet så att det inte skrivs över av en tom budget.
      localStorage.setItem(`${this.key}:trasig:${Date.now()}`, raw);
      console.error('Kunde inte läsa sparad budget', err);
      return null;
    }
  }

  async save(data: AppData): Promise<void> {
    localStorage.setItem(this.key, JSON.stringify(data));
  }
}
