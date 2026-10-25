import type { MerchantRule } from '../types';
import { HOUSEHOLD } from '../types';
import { parseMonthWord } from './period';
import { evenPercents, percentsFor } from './split';

/**
 * Inkorgen för köp från Apple Pay. Genvägen på telefonen skickar en rad text,
 * "Belopp;Handlare;Datum", t.ex. "129,00 kr;ICA Nära Hjärtat;2026-10-25T14:03:00+02:00".
 */

/** En adress (nyckel) som genvägen skickar till. Nyckeln avgör vems köpet är. */
export interface InboxKey {
  key: string;
  personId: string;
  uid: string;
  createdAt?: { toMillis(): number } | null;
}

/** Ett köp i inkorgen som det ligger i Firestore. */
export interface InboxItem {
  id: string;
  key: string;
  kop: string;
}

/** Ett tolkat köp som väntar på att bokföras. */
export interface InboxEntry {
  id: string;
  key: string;
  raw: string;
  /** null om adressen tagits bort eller personen inte finns längre */
  personId: string | null;
  amount: number | null;
  /** Valuta om köpet inte var i kronor, t.ex. "EUR" */
  currency: string | null;
  merchant: string;
  /** "YYYY-MM-DD", eller null om datumet saknas */
  date: string | null;
}

const CURRENCIES: [RegExp, string][] = [
  [/€|\bEUR\b/i, 'EUR'],
  [/\$|\bUSD\b/i, 'USD'],
  [/£|\bGBP\b/i, 'GBP'],
  [/\bNOK\b/i, 'NOK'],
  [/\bDKK\b/i, 'DKK'],
  [/\bCHF\b/i, 'CHF'],
];

/** "1 299,00 kr", "SEK 129.50", "€12,50" -> belopp och ev. utländsk valuta. */
export function parseAmount(raw: string): { amount: number | null; currency: string | null } {
  const currency = CURRENCIES.find(([re]) => re.test(raw))?.[1] ?? null;
  const match = raw.match(/-?\s*\d[\d\s  .,']*/);
  if (!match) return { amount: null, currency };
  let s = match[0].replace(/[\s  ']/g, '').replace(/[.,]$/, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    // Båda förekommer: det sista är decimaltecknet
    const dec = lastComma > lastDot ? ',' : '.';
    s = s.split(dec === ',' ? '.' : ',').join('').replace(dec, '.');
  } else if (lastComma !== -1 || lastDot !== -1) {
    const sep = lastComma !== -1 ? ',' : '.';
    const parts = s.split(sep);
    // "12,50" är decimaler, "1.299" och "1,299,000" är tusentalsavgränsare
    s = parts.length === 2 && parts[1].length <= 2 ? parts.join('.') : parts.join('');
  }
  const n = Number(s);
  return { amount: Number.isFinite(n) ? Math.round(n * 100) / 100 : null, currency };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function validDate(y: number, m: number, d: number): string | null {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** ISO 8601 ("2026-10-25T14:03…") eller svenskt format ("25 okt. 2026 14:03"). */
export function parseDate(raw: string): string | null {
  const iso = raw.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const sv = raw.match(/(\d{1,2})\s+([a-zåäö]+)\.?\s+(\d{4})/i);
  if (sv) {
    const month = parseMonthWord(sv[2]);
    if (month) return validDate(Number(sv[3]), month, Number(sv[1]));
  }
  // Telefon på engelska: "Oct 25, 2026"
  const en = raw.match(/([a-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/i);
  if (en) {
    const month = EN_MONTHS.indexOf(en[1].slice(0, 3).toLowerCase()) + 1;
    if (month) return validDate(Number(en[3]), month, Number(en[2]));
  }
  return null;
}

const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "Belopp;Handlare;Datum" – handlaren får innehålla semikolon, beloppet och datumet inte. */
export function parseInboxText(raw: string): Pick<InboxEntry, 'amount' | 'currency' | 'merchant' | 'date'> {
  const parts = raw.split(';').map((p) => p.trim());
  const { amount, currency } = parseAmount(parts[0] ?? '');
  const date = parts.length >= 3 ? parseDate(parts[parts.length - 1]) : null;
  const merchant = (parts.length >= 3 ? parts.slice(1, -1) : parts.slice(1)).join(';').trim();
  return { amount, currency, merchant, date };
}

/** "ICA Nära Hjärtat 1234" -> "ica nara hjartat" – samma butik ska ge samma nyckel. */
export function merchantKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !/^\d+$/.test(w))
    .join(' ');
}

export interface MerchantMatch {
  rule: MerchantRule;
  /** Exakt samma handlare. Annars en gissning utifrån första ordet ("ICA Kvantum" ~ "ICA Nära"). */
  exact: boolean;
}

export function findMerchantRule(merchants: Record<string, MerchantRule>, name: string): MerchantMatch | null {
  const key = merchantKey(name);
  if (!key) return null;
  if (merchants[key]) return { rule: merchants[key], exact: true };
  const first = key.split(' ')[0];
  if (first.length < 3) return null;
  const candidates = Object.entries(merchants)
    .filter(([k]) => k.split(' ')[0] === first)
    .map(([, r]) => r);
  if (!candidates.length) return null;
  // Gissa bara om alla butiker med samma första ord hamnat på samma ställe
  const same = candidates.every((r) => r.lineKey === candidates[0].lineKey && r.shared === candidates[0].shared);
  return same ? { rule: candidates[0], exact: false } : null;
}

/** Ny slumpad nyckel, 32 tecken (base64url). */
export function newInboxKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Hur ett köp ur inkorgen ska bokföras. */
export interface InboxChoice {
  line: { key: string; section: MerchantRule['section']; name: string };
  /** Person-id, eller HOUSEHOLD för att dela mellan alla */
  target: string;
  /** Procent per person i hushållets ordning (bara när target är HOUSEHOLD) */
  percents?: number[];
  amount: number;
  date: string;
  note: string;
}

/** Bokföring enligt det appen minns om handlaren. null om köpet saknar något som behövs. */
export function ruleChoice(entry: InboxEntry, rule: MerchantRule, personIds: string[], today: string): InboxChoice | null {
  if (entry.amount === null || !entry.personId) return null;
  const shared = rule.shared && personIds.length > 1;
  return {
    line: { key: rule.lineKey, section: rule.section, name: rule.lineName },
    target: shared ? HOUSEHOLD : entry.personId,
    percents: shared ? (percentsFor(rule.split, personIds) ?? evenPercents(personIds.length)) : undefined,
    amount: entry.amount,
    date: entry.date ?? today,
    note: entry.merchant,
  };
}
