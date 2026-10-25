import { useState } from 'react';
import type { MonthBudget, Person } from '../types';
import { useStore } from '../store/store';
import { useUi } from '../store/ui';
import { useToast } from '../components/Toast';
import { emptyData, normalizeData } from '../store/storage';
import { evalOr0 } from '../lib/expr';
import { monthId, newId } from '../lib/id';
import { num } from '../lib/format';
import { periodLabel, rangeLabel, currentPeriod } from '../lib/period';
import type { ImportedSheet } from '../import/excel';

export function SettingsView() {
  return (
    <>
      <PersonsCard />
      <PeriodCard />
      <ExcelImportCard />
      <BackupCard />
    </>
  );
}

export function PersonsCard({ intro }: { intro?: boolean }) {
  const { data, dispatch } = useStore();
  const { setScope } = useUi();
  const toast = useToast();
  const [name, setName] = useState('');

  function add() {
    const n = name.trim();
    if (!n) return;
    const person: Person = { id: newId(), name: n };
    dispatch({ type: 'addPerson', person });
    setScope(person.id);
    setName('');
  }

  function remove(p: Person) {
    if (!confirm(`Ta bort ${p.name} och alla ${p.name}s budgetar och köp?`)) return;
    const before = data;
    dispatch({ type: 'removePerson', id: p.id });
    toast(`${p.name} borttagen`, { undo: () => dispatch({ type: 'replace', data: before }) });
  }

  return (
    <section className="card">
      <h2>{intro ? 'Vem ska ha en budget?' : 'Personer'}</h2>
      {intro && (
        <p className="muted">
          Lägg till en eller flera personer. Med två eller fler får ni även en hushållsvy som summerar allt.
        </p>
      )}
      <ul className="person-list">
        {data.persons.map((p) => (
          <li key={p.id}>
            <input
              defaultValue={p.name}
              aria-label="Namn"
              onBlur={(e) => e.target.value.trim() && dispatch({ type: 'renamePerson', id: p.id, name: e.target.value.trim() })}
            />
            <button className="btn btn-ghost btn-danger" onClick={() => remove(p)}>
              Ta bort
            </button>
          </li>
        ))}
      </ul>
      <form
        className="add-line"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input value={name} placeholder="Namn, t.ex. Pella" onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-primary" type="submit" disabled={!name.trim()}>
          Lägg till
        </button>
      </form>
    </section>
  );
}

function PeriodCard() {
  const { data, dispatch } = useStore();
  const day = data.settings.periodStartDay;
  const example = currentPeriod(day);

  return (
    <section className="card">
      <h2>Budgetperiod</h2>
      <label className="inline-select">
        Månaden börjar den
        <input
          type="number"
          min={1}
          max={28}
          value={day}
          onChange={(e) => dispatch({ type: 'settings', patch: { periodStartDay: Number(e.target.value) } })}
          style={{ width: '5em' }}
        />
      </label>
      <p className="muted">
        {day === 1
          ? 'Kalendermånad.'
          : `Lön till lön: ${periodLabel(example)}budgeten gäller ${rangeLabel(example, day)}. Köp loggas till rätt månad efter datum.`}
      </p>
    </section>
  );
}

interface Draft {
  sheet: ImportedSheet;
  include: boolean;
  personName: string;
  period: string;
}

export function ExcelImportCard() {
  const { data, dispatch } = useStore();
  const { setScope, setPeriod } = useUi();
  const toast = useToast();
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const { parseBudgetWorkbook } = await import('../import/excel');
      const sheets = await parseBudgetWorkbook(file);
      if (sheets.length === 0) throw new Error('Hittade inga budgetblad i filen.');
      setDrafts(
        sheets.map((sheet) => ({
          sheet,
          include: !!sheet.period,
          personName: sheet.personName,
          period: sheet.period ?? '',
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function findPerson(name: string, extra: Person[]): Person | undefined {
    const n = name.trim().toLowerCase();
    return [...data.persons, ...extra].find((p) => p.name.trim().toLowerCase() === n);
  }

  function runImport() {
    if (!drafts) return;
    const newPersons: Person[] = [];
    const months: MonthBudget[] = [];
    for (const d of drafts) {
      if (!d.include || !d.period || !d.personName.trim()) continue;
      let person = findPerson(d.personName, newPersons);
      if (!person) {
        person = { id: newId(), name: d.personName.trim() };
        newPersons.push(person);
      }
      const now = new Date().toISOString();
      months.push({
        id: monthId(person.id, d.period),
        personId: person.id,
        period: d.period,
        lines: d.sheet.lines,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (months.length === 0) return;
    dispatch({ type: 'importMonths', persons: newPersons, months });
    toast(`${months.length} månader importerade`);
    setDrafts(null);
    const last = [...months].sort((a, b) => (a.period < b.period ? 1 : -1))[0];
    setScope(last.personId);
    setPeriod(last.period);
  }

  const update = (i: number, patch: Partial<Draft>) =>
    setDrafts((ds) => ds!.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  return (
    <section className="card">
      <h2>Importera från Excel</h2>
      <p className="muted">
        Läs in Budgetkalkyl-mallen (.xlsx). Varje budgetblad blir en månad. Filen läses bara i din webbläsare och laddas
        aldrig upp någonstans.
      </p>
      <label className="btn file-btn">
        {busy ? 'Läser…' : 'Välj Excel-fil'}
        <input
          type="file"
          accept=".xlsx"
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
          hidden
        />
      </label>
      {error && <p className="form-error">{error}</p>}

      {drafts && (
        <div className="import-preview">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th />
                  <th>Blad</th>
                  <th>Person</th>
                  <th>Månad</th>
                  <th>Inkomster</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {drafts.map((d, i) => {
                  const person = findPerson(d.personName, []);
                  const exists = person && d.period && data.months[monthId(person.id, d.period)];
                  const income = d.sheet.lines
                    .filter((l) => l.section === 'income')
                    .reduce((s, l) => s + evalOr0(l.budget), 0);
                  return (
                    <tr key={d.sheet.sheetName}>
                      <td>
                        <input
                          type="checkbox"
                          checked={d.include}
                          onChange={(e) => update(i, { include: e.target.checked })}
                          aria-label={`Importera ${d.sheet.sheetName}`}
                        />
                      </td>
                      <th>{d.sheet.sheetName}</th>
                      <td>
                        <input value={d.personName} onChange={(e) => update(i, { personName: e.target.value })} aria-label="Person" />
                      </td>
                      <td>
                        <input type="month" value={d.period} onChange={(e) => update(i, { period: e.target.value })} aria-label="Månad" />
                      </td>
                      <td>{num(income)}</td>
                      <td className="muted">{exists ? 'ersätter befintlig' : person ? '' : 'ny person'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="details-actions">
            <button className="btn btn-primary" onClick={runImport} disabled={!drafts.some((d) => d.include && d.period)}>
              Importera {drafts.filter((d) => d.include && d.period).length} månader
            </button>
            <button className="btn btn-ghost" onClick={() => setDrafts(null)}>
              Avbryt
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function BackupCard() {
  const { data, dispatch } = useStore();
  const toast = useToast();

  function exportJson() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `budget-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importJson(file: File | undefined) {
    if (!file) return;
    try {
      const restored = normalizeData(JSON.parse(await file.text()));
      if (!confirm('Ersätta all nuvarande data med backupen?')) return;
      const before = data;
      dispatch({ type: 'replace', data: restored });
      toast('Backup återställd', { undo: () => dispatch({ type: 'replace', data: before }) });
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  function wipe() {
    if (!confirm('Radera ALL budgetdata i den här webbläsaren?')) return;
    const before = data;
    dispatch({ type: 'replace', data: emptyData() });
    toast('All data raderad', { undo: () => dispatch({ type: 'replace', data: before }) });
  }

  const months = Object.keys(data.months).length;

  return (
    <section className="card">
      <h2>Lagring & backup</h2>
      <p className="muted">
        Allt sparas just nu bara i den här webbläsaren ({months} månader, {data.transactions.length} köp). Exportera en
        backup då och då, eller för att flytta datan till en annan enhet.
      </p>
      <div className="details-actions">
        <button className="btn" onClick={exportJson}>
          Exportera backup
        </button>
        <label className="btn file-btn">
          Återställ backup
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              importJson(e.target.files?.[0]);
              e.target.value = '';
            }}
            hidden
          />
        </label>
        <button className="btn btn-ghost btn-danger" onClick={wipe}>
          Radera all data
        </button>
      </div>
    </section>
  );
}
