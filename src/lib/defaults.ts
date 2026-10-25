import type { Line, SectionId } from '../types';
import { newId, slugify } from './id';

export const SECTIONS: { id: SectionId; title: string; short: string }[] = [
  { id: 'income', title: 'Inkomster', short: 'Inkomster' },
  { id: 'fixed', title: 'Fasta utgifter', short: 'Fasta' },
  { id: 'variable', title: 'Rörliga utgifter', short: 'Rörliga' },
  { id: 'savings', title: 'Sparande', short: 'Sparande' },
];

export function sectionTitle(id: SectionId): string {
  return SECTIONS.find((s) => s.id === id)!.title;
}

/** Samma kategorier som i Budgetkalkyl_mall.xlsx. */
const TEMPLATE: Record<SectionId, string[]> = {
  income: ['Lön (netto)', 'Bidrag/ersättningar', 'Extrainkomst', 'Övrigt'],
  fixed: [
    'Hyra/bolån',
    'El',
    'Försäkringar',
    'Internet/TV/mobil',
    'Lån/avbetalningar',
    'Barnomsorg',
    'Abonnemang (streaming m.m.)',
    'Övrigt fast',
  ],
  variable: [
    'Mat/hushåll',
    'Transport/bensin',
    'Kläder',
    'Nöje/restaurang',
    'Hälsa/apotek',
    'Hobby/fritid',
    'Presenter',
    'Övrigt rörligt',
  ],
  savings: ['Buffertsparande', 'Långsiktigt sparande', 'Mål (t.ex. resa)'],
};

export function lineKey(section: SectionId, name: string): string {
  return `${section}:${slugify(name)}`;
}

export function makeLine(section: SectionId, name: string, budget = ''): Line {
  return { id: newId(), key: lineKey(section, name), section, name, budget, actual: '', comment: '' };
}

export function templateLines(): Line[] {
  return SECTIONS.flatMap((s) => TEMPLATE[s.id].map((name) => makeLine(s.id, name)));
}
