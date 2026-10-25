import { strFromU8, unzipSync } from 'fflate';
import type { Line, Period, SectionId } from '../types';
import { lineKey } from '../lib/defaults';
import { newId } from '../lib/id';
import { makePeriod, parseMonthWord } from '../lib/period';

/** Ett budgetblad från Excel-mallen, tolkat. */
export interface ImportedSheet {
  sheetName: string;
  personName: string;
  period: Period | null;
  lines: Line[];
}

const SECTION_HEADERS: Record<string, SectionId> = {
  INKOMSTER: 'income',
  'FASTA UTGIFTER': 'fixed',
  'RÖRLIGA UTGIFTER': 'variable',
  SPARANDE: 'savings',
};

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

interface Cell {
  value: string | null;
  formula: string | null;
}

function parseXml(files: Record<string, Uint8Array>, path: string): Document | null {
  const file = files[path];
  return file ? new DOMParser().parseFromString(strFromU8(file), 'application/xml') : null;
}

function readSharedStrings(files: Record<string, Uint8Array>): string[] {
  const doc = parseXml(files, 'xl/sharedStrings.xml');
  if (!doc) return [];
  return [...doc.getElementsByTagNameNS(NS, 'si')].map((si) =>
    [...si.getElementsByTagNameNS(NS, 't')].map((t) => t.textContent ?? '').join(''),
  );
}

function readCells(doc: Document, shared: string[]): Map<string, Cell> {
  const cells = new Map<string, Cell>();
  for (const c of doc.getElementsByTagNameNS(NS, 'c')) {
    const ref = c.getAttribute('r');
    if (!ref) continue;
    const type = c.getAttribute('t');
    const v = c.getElementsByTagNameNS(NS, 'v')[0]?.textContent ?? null;
    const f = c.getElementsByTagNameNS(NS, 'f')[0]?.textContent || null;
    let value = v;
    if (type === 's' && v !== null) value = shared[Number(v)] ?? null;
    else if (type === 'inlineStr') {
      value = [...c.getElementsByTagNameNS(NS, 't')].map((t) => t.textContent ?? '').join('');
    }
    cells.set(ref, { value, formula: f });
  }
  return cells;
}

/** Excel-serienummer -> { år, månad } */
function excelDate(serial: number): { year: number; month: number } {
  const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

/**
 * Behåll uttryck som "6170+1005+2286" så att uppdelningen syns i appen.
 * Formler med cellreferenser (SUM m.m.) ersätts med sitt uträknade värde.
 */
function amountOf(cell: Cell | undefined): string {
  if (!cell) return '';
  if (cell.formula && /^[\d\s+\-*/().,]+$/.test(cell.formula)) return cell.formula.replace(/\s+/g, '');
  if (cell.value === null || cell.value === '') return '';
  const n = Number(cell.value);
  if (!Number.isFinite(n)) return '';
  return n === 0 ? '' : String(Math.round(n * 100) / 100);
}

function guessPersonAndMonth(sheetName: string): { person: string; month: number | null } {
  const words = sheetName.replace(/^budget\s*/i, '').trim().split(/\s+/).filter(Boolean);
  let month: number | null = null;
  if (words.length > 1) {
    month = parseMonthWord(words[words.length - 1]);
    if (month) words.pop();
  }
  return { person: words.join(' ') || 'Jag', month };
}

function parseSheet(sheetName: string, cells: Map<string, Cell>): ImportedSheet | null {
  // Ett budgetblad har rubrikraden "Kategori | Budgeterat | Faktiskt" (inte t.ex. Årsöversikt)
  const isBudgetSheet = [...cells.entries()].some(
    ([ref, c]) => /^A\d+$/.test(ref) && /^kategori$/i.test(c.value?.trim() ?? '') && /^budget/i.test(cells.get(`B${ref.slice(1)}`)?.value ?? ''),
  );
  if (!isBudgetSheet) return null;

  let section: SectionId | null = null;
  const lines: Line[] = [];
  let maxRow = 0;
  for (const ref of cells.keys()) maxRow = Math.max(maxRow, Number(ref.replace(/^[A-Z]+/, '')));

  for (let r = 1; r <= maxRow; r++) {
    const label = cells.get(`A${r}`)?.value?.trim();
    if (!label) continue;
    const header = SECTION_HEADERS[label.toUpperCase()];
    if (header) {
      section = header;
      continue;
    }
    if (!section) continue;
    if (/^kategori$/i.test(label)) continue;
    if (/^summa/i.test(label)) {
      section = null;
      continue;
    }
    lines.push({
      id: newId(),
      key: lineKey(section, label),
      section,
      name: label,
      budget: amountOf(cells.get(`B${r}`)),
      actual: amountOf(cells.get(`C${r}`)),
      comment: cells.get(`E${r}`)?.value?.trim() ?? '',
    });
  }
  if (lines.length === 0) return null;

  // I en uppföljd sektion betyder 0 under Faktiskt "inget spenderat", inte "ej ifyllt".
  for (const s of Object.values(SECTION_HEADERS)) {
    const inSection = lines.filter((l) => l.section === s);
    if (!inSection.some((l) => l.actual !== '')) continue;
    for (const l of inSection) if (l.actual === '' && l.budget !== '') l.actual = '0';
  }

  const { person, month: nameMonth } = guessPersonAndMonth(sheetName);
  const dateCell = Number(cells.get('B3')?.value);
  const fromDate = Number.isFinite(dateCell) && dateCell > 30000 ? excelDate(dateCell) : null;
  let period: Period | null = null;
  if (nameMonth) period = makePeriod(fromDate?.year ?? new Date().getFullYear(), nameMonth);
  else if (fromDate) period = makePeriod(fromDate.year, fromDate.month);

  return { sheetName, personName: person, period, lines };
}

export async function parseBudgetWorkbook(file: File): Promise<ImportedSheet[]> {
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const shared = readSharedStrings(files);
  const workbook = parseXml(files, 'xl/workbook.xml');
  const rels = parseXml(files, 'xl/_rels/workbook.xml.rels');
  if (!workbook || !rels) throw new Error('Det här ser inte ut som en Excel-fil (.xlsx).');

  const targets = new Map<string, string>();
  for (const rel of rels.getElementsByTagName('Relationship')) {
    targets.set(rel.getAttribute('Id') ?? '', rel.getAttribute('Target') ?? '');
  }

  const out: ImportedSheet[] = [];
  for (const sheet of workbook.getElementsByTagNameNS(NS, 'sheet')) {
    const name = sheet.getAttribute('name') ?? '';
    const target = targets.get(sheet.getAttributeNS(REL_NS, 'id') ?? '') ?? '';
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    const doc = parseXml(files, path);
    if (!doc) continue;
    const parsed = parseSheet(name, readCells(doc, shared));
    if (parsed) out.push(parsed);
  }
  return out;
}
