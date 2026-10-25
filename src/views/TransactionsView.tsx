import { useState } from 'react';
import type { AppData, Transaction } from '../types';
import { HOUSEHOLD } from '../types';
import { useStore } from '../store/store';
import { useUi } from '../store/ui';
import { useToast } from '../components/Toast';
import { personMonth, previousMonth } from '../lib/calc';
import { evaluate } from '../lib/expr';
import { kr, num } from '../lib/format';
import { monthId } from '../lib/id';
import { periodLabel, periodOf } from '../lib/period';
import { splitAmount, splitGroup } from '../lib/split';

/** En rad i listan: ett vanligt köp, eller i hushållsvyn alla delar av ett delat köp. */
interface Entry {
  key: string;
  first: Transaction;
  /** Delarna som visas (en person) eller hela gruppen (hushållet) */
  shown: Transaction[];
  /** Hela det delade köpet, för redigering och borttagning */
  group: Transaction[];
}

export function TransactionsView() {
  const { data } = useStore();
  const { scope, period, openQuickAdd } = useUi();
  const [editing, setEditing] = useState<string | null>(null);

  const txs = data.transactions
    .filter((t) => t.period === period && (scope === HOUSEHOLD || t.personId === scope))
    .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1));

  const entries: Entry[] = [];
  const seen = new Set<string>();
  const order = (t: Transaction) => data.persons.findIndex((p) => p.id === t.personId);
  for (const t of txs) {
    const group = splitGroup(data.transactions, t).sort((a, b) => order(a) - order(b));
    if (scope === HOUSEHOLD && t.splitId) {
      if (seen.has(t.splitId)) continue;
      seen.add(t.splitId);
      entries.push({ key: t.splitId, first: t, shown: group.filter((g) => g.period === period), group });
    } else {
      entries.push({ key: t.id, first: t, shown: [t], group });
    }
  }

  const total = txs.reduce((s, t) => s + t.amount, 0);
  const byDate = new Map<string, Entry[]>();
  for (const e of entries) byDate.set(e.first.date, [...(byDate.get(e.first.date) ?? []), e]);

  return (
    <>
      <section className="card">
        <div className="section-head">
          <div>
            <h2>Loggade köp</h2>
            <span className="section-totals">
              {entries.length} st · {kr(total)} i {periodLabel(period)}
            </span>
          </div>
          <button className="btn btn-primary" onClick={() => openQuickAdd()}>
            + Logga köp
          </button>
        </div>
        {entries.length === 0 && (
          <p className="muted">
            Inga köp loggade för den här månaden. Tryck på <strong>+</strong> när du handlar så summeras det automatiskt i
            budgeten under Faktiskt.
          </p>
        )}
      </section>

      {[...byDate.entries()].map(([date, list]) => (
        <section key={date} className="card tx-day">
          <h3 className="tx-date">{formatDate(date)}</h3>
          <ul className="tx-list">
            {list.map((e) =>
              editing === e.key ? (
                <TxEditor key={e.key} group={e.group} onDone={() => setEditing(null)} />
              ) : (
                <TxRow key={e.key} entry={e} onEdit={() => setEditing(e.key)} />
              ),
            )}
          </ul>
        </section>
      ))}
    </>
  );
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' });
}

function lineName(data: AppData, tx: Transaction): string {
  const month = personMonth(data, tx.personId, tx.period) ?? previousMonth(data, tx.personId, tx.period);
  return month?.lines.find((l) => l.key === tx.lineKey)?.name ?? tx.lineKey;
}

function personName(data: AppData, id: string): string {
  return data.persons.find((p) => p.id === id)?.name ?? '?';
}

function shareOf(tx: Transaction, group: Transaction[]): number {
  if (tx.share !== undefined) return tx.share;
  const total = group.reduce((s, t) => s + t.amount, 0);
  return total ? tx.amount / total : 1 / group.length;
}

function TxRow({ entry, onEdit }: { entry: Entry; onEdit(): void }) {
  const { data, dispatch } = useStore();
  const { scope } = useUi();
  const toast = useToast();
  const { first, shown, group } = entry;
  const split = group.length > 1;
  const amount = shown.reduce((s, t) => s + t.amount, 0);
  const groupTotal = group.reduce((s, t) => s + t.amount, 0);

  let detail = '';
  if (split && scope === HOUSEHOLD) {
    detail = group.map((t) => `${personName(data, t.personId)} ${num(t.amount)}`).join(' / ');
  } else if (split) {
    detail = `${Math.round(shareOf(first, group) * 100)} % av ${num(groupTotal)} (delat)`;
  } else if (scope === HOUSEHOLD) {
    detail = personName(data, first.personId);
  }

  function remove() {
    const before = data;
    for (const t of group) dispatch({ type: 'removeTransaction', id: t.id });
    toast(split ? 'Delat köp borttaget för alla' : 'Köp borttaget', {
      undo: () => dispatch({ type: 'replace', data: before }),
    });
  }

  return (
    <li className="tx-row">
      <button className="tx-main" onClick={onEdit}>
        <span className="tx-cat">
          {lineName(data, first)}
          {split && <span className="badge badge-muted tx-badge">Hushåll</span>}
        </span>
        <span className="tx-note">{[first.note, detail].filter(Boolean).join(' · ') || '–'}</span>
      </button>
      <span className="tx-amount">{num(amount)}</span>
      <button className="icon-btn" aria-label={split ? 'Ta bort delat köp' : 'Ta bort köp'} onClick={remove}>
        ×
      </button>
    </li>
  );
}

function TxEditor({ group, onDone }: { group: Transaction[]; onDone(): void }) {
  const { data, dispatch } = useStore();
  const first = group[0];
  const split = group.length > 1;
  const total = group.reduce((s, t) => s + t.amount, 0);
  const [amount, setAmount] = useState(String(Math.round(total * 100) / 100));
  const [note, setNote] = useState(first.note);
  const [date, setDate] = useState(first.date);
  const [lineKey, setLineKey] = useState(first.lineKey);
  const value = evaluate(amount);
  const month = personMonth(data, first.personId, first.period) ?? previousMonth(data, first.personId, first.period);
  const options = month?.lines ?? [];

  function save() {
    if (value === null) return;
    const period = periodOf(date, data.settings.periodStartDay);
    const line = options.find((l) => l.key === lineKey);
    // Ett delat köp delas om med samma andelar
    const amounts = split ? splitAmount(value, group.map((t) => shareOf(t, group))) : [value];
    group.forEach((t, i) => {
      if (!personMonth(data, t.personId, period)) {
        dispatch({ type: 'createMonth', personId: t.personId, period, from: previousMonth(data, t.personId, period) });
      }
      if (line) {
        dispatch({ type: 'ensureLine', monthId: monthId(t.personId, period), key: line.key, section: line.section, name: line.name });
      }
      dispatch({
        type: 'updateTransaction',
        id: t.id,
        patch: { amount: amounts[i], note: note.trim(), date, period, lineKey },
      });
    });
    onDone();
  }

  return (
    <li className="tx-edit">
      <form
        className="details-grid"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label>
          {split ? 'Totalbelopp' : 'Belopp'}
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </label>
        <label>
          Kategori
          <select value={lineKey} onChange={(e) => setLineKey(e.target.value)}>
            {options.map((l) => (
              <option key={l.key} value={l.key}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Anteckning
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <label>
          Datum
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        {split && (
          <p className="muted">
            Delas som tidigare:{' '}
            {group.map((t) => `${personName(data, t.personId)} ${Math.round(shareOf(t, group) * 100)} %`).join(', ')}
          </p>
        )}
        <div className="details-actions">
          <button className="btn btn-primary" type="submit" disabled={value === null}>
            Spara
          </button>
          <button className="btn btn-ghost" type="button" onClick={onDone}>
            Avbryt
          </button>
        </div>
      </form>
    </li>
  );
}
