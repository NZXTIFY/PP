import type { AppData, Transaction } from '../types';
import { HOUSEHOLD } from '../types';
import { useStore } from '../store/store';
import { useUi } from '../store/ui';
import { useToast } from '../components/Toast';
import { InboxCard } from '../components/InboxCard';
import { personMonth, previousMonth } from '../lib/calc';
import { kr, num } from '../lib/format';
import { periodLabel } from '../lib/period';
import { splitGroup } from '../lib/split';

/** En rad i listan: ett vanligt köp, eller i hushållsvyn alla delar av ett delat köp. */
interface Entry {
  key: string;
  first: Transaction;
  /** Delarna som visas (en person) eller hela gruppen (hushållet) */
  shown: Transaction[];
  /** Hela det delade köpet, för borttagning */
  group: Transaction[];
}

export function TransactionsView() {
  const { data } = useStore();
  const { scope, period, openQuickAdd } = useUi();

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
      <InboxCard />
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
            {list.map((e) => (
              <TxRow key={e.key} entry={e} onEdit={() => openQuickAdd({ edit: e.first.id })} />
            ))}
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
          {first.source === 'wallet' && <span className="badge badge-muted tx-badge">Apple Pay</span>}
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
