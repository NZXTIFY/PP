export type SectionId = 'income' | 'fixed' | 'variable' | 'savings';

/** En rad i en månadsbudget, t.ex. "Mat/hushåll". */
export interface Line {
  id: string;
  /** Stabil nyckel som följer med när en månad kopieras – används för trender och hushållsvyn. */
  key: string;
  section: SectionId;
  name: string;
  /** Uttryck som det skrevs, t.ex. "6170+1005+2286". */
  budget: string;
  /** Manuellt inmatat utfall (uttryck). Loggade köp läggs ovanpå detta. */
  actual: string;
  comment: string;
}

/** "YYYY-MM" – budgetmånaden. Med lön-till-lön (25:e) gäller t.ex. "2026-11" 25 okt – 24 nov. */
export type Period = string;

export interface MonthBudget {
  id: string;
  personId: string;
  period: Period;
  lines: Line[];
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  personId: string;
  period: Period;
  lineKey: string;
  amount: number;
  /** "YYYY-MM-DD" */
  date: string;
  note: string;
  createdAt: string;
  /** Delat hushållsköp: alla delar har samma splitId, en transaktion per person. */
  splitId?: string;
  /** Personens andel av det delade köpet, 0–1. */
  share?: number;
  /** 'wallet' = kom från Apple Pay via inkorgen */
  source?: 'wallet';
}

/** Vad appen minns om en handlare, så att nästa köp där hamnar rätt direkt. */
export interface MerchantRule {
  /** Handlarens namn som det kom från telefonen */
  name: string;
  lineKey: string;
  section: SectionId;
  lineName: string;
  /** Delas mellan alla i hushållet, annars bokförs det på den som betalade */
  shared: boolean;
  /** Procent per person-id för delade köp */
  split?: Record<string, number>;
}

export interface Person {
  id: string;
  name: string;
}

export interface Settings {
  /** Dag i månaden då budgetperioden börjar. 1 = kalendermånad, 25 = lön till lön. */
  periodStartDay: number;
  /** Bokför köp från inkorgen direkt när handlaren är känd. Standard: på. */
  inboxAutoBook?: boolean;
}

export interface AppData {
  version: 1;
  persons: Person[];
  months: Record<string, MonthBudget>;
  transactions: Transaction[];
  settings: Settings;
  /** Kända handlare, nyckel = merchantKey(namn) */
  merchants: Record<string, MerchantRule>;
}

/** Person-id eller hela hushållet. */
export type Scope = string;
export const HOUSEHOLD: Scope = '__household__';
