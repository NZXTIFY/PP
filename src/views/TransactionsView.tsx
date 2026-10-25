import { useState } from 'react';
import type { Transaction } from '../types';
import { HOUSEHOLD } from '../types';
import { useStore } from '../store/store';
import { useUi } from '../store/ui';
import { useToast } from '../components/Toast';
import { personMonth, previousMonth } from '../lib/calc';
import { evaluate } from '../lib/expr';
import { kr, num } from '../lib/format';
import { periodLabel, periodOf } from '../lib/period';

export function TransactionsView() {
  const { data } = useStore();
  const { scope, period, openQuickAdd } = useUi();
  const [editing, setEditing] = useState<string | null>(null);

  const txs = data.transactions
    .filter((t) => t.period === period && (scope === HOUSEHOLD || t.personId === scope))
    .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1));

  const total = txs.reduce((s, t) => s + t.amount, 0);
  const byDate = new Map<string, Transaction[]>();
  for (const t of txs) byDate.set(t.date, [...(byDate.get(t.date) ?? []), t]);

  return (
    <>
      <section className="card">
        <div className="section-head">
          <div>
            <h2>Loggade köp</h2>
            <span className="section-totals">
              {txs.length} st · {kr(total)} i {periodLabel(period)}
            </span>
          </div>
          <button className="btn btn-primary" onClick={() => openQuickAdd()}>
            + Logga köp
          </button>
        </div>
        {txs.length === 0 && (
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
            {list.map((t) =>
              editing === t.id ? (
                <TxEditor key={t.id} tx={t} onDone={() => setEditing(null)} />
              ) : (
                <TxRow key={t.id} tx={t} onEdit={() => setEditing(t.id)} />
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

function lineName(data: ReturnType<typeof useStore>['data'], tx: Transaction): string {
  const month = personMonth(data, tx.personId, tx.period) ?? previousMonth(data, tx.personId, tx.period);
  return month?.lines.find((l) => l.key === tx.lineKey)?.name ?? tx.lineKey;
}

function TxRow({ tx, onEdit }: { tx: Transaction; onEdit(): void }) {
  const { data, dispatch } = useStore();
  const { scope } = useUi();
  const toast = useToast();
  const person = data.persons.find((p) => p.id === tx.personId);

  return (
    <li className="tx-row">
      <button className="tx-main" onClick={onEdit}>
        <span className="tx-cat">{lineName(data, tx)}</span>
        <span className="tx-note">
          {tx.note || '–'}
          {scope === HOUSEHOLD && person ? ` · ${person.name}` : ''}
        </span>
      </button>
      <span className="tx-amount">{num(tx.amount)}</span>
      <button
        className="icon-btn"
        aria-label="Ta bort köp"
        onClick={() => {
          const before = data;
          dispatch({ type: 'removeTransaction', id: tx.id });
          toast('Köp borttaget', { undo: () => dispatch({ type: 'replace', data: before }) });
        }}
      >
        ×
      </button>
    </li>
  );
}

function TxEditor({ tx, onDone }: { tx: Transaction; onDone(): void }) {
  const { data, dispatch } = useStore();
  const [amount, setAmount] = useState(String(tx.amount));
  const [note, setNote] = useState(tx.note);
  const [date, setDate] = useState(tx.date);
  const [lineKey, setLineKey] = useState(tx.lineKey);
  const value = evaluate(amount);
  const month = personMonth(data, tx.personId, tx.period) ?? previousMonth(data, tx.personId, tx.period);

  function save() {
    if (value === null) return;
    const period = periodOf(date, data.settings.periodStartDay);
    if (!personMonth(data, tx.personId, period)) {
      dispatch({ type: 'createMonth', personId: tx.personId, period, from: previousMonth(data, tx.personId, period) });
    }
    dispatch({ type: 'updateTransaction', id: tx.id, patch: { amount: value, note: note.trim(), date, period, lineKey } });
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
          Belopp
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </label>
        <label>
          Kategori
          <select value={lineKey} onChange={(e) => setLineKey(e.target.value)}>
            {(month?.lines ?? []).map((l) => (
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
