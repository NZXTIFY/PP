import type { InboxEntry } from '../lib/inbox';
import { HOUSEHOLD } from '../types';
import { useInbox } from '../cloud/context';
import { useStore } from '../store/store';
import { useUi } from '../store/ui';
import { useToast } from './Toast';
import { kr, num } from '../lib/format';

/** Köp från Apple Pay som väntar på en kategori. Visas överst på sidan Köp. */
export function InboxCard() {
  const inbox = useInbox();
  if (!inbox || inbox.entries.length === 0) return null;
  const total = inbox.entries.reduce((s, e) => s + (e.amount ?? 0), 0);

  return (
    <section className="card inbox">
      <div className="section-head">
        <div>
          <h2>Att kategorisera</h2>
          <span className="section-totals">
            {inbox.entries.length} köp från Apple Pay · {kr(total)}
          </span>
        </div>
      </div>
      <ul className="tx-list">
        {inbox.entries.map((e) => (
          <InboxRow key={e.id} entry={e} />
        ))}
      </ul>
    </section>
  );
}

function formatDay(iso: string | null): string {
  if (!iso) return 'Datum saknas';
  return new Date(`${iso}T12:00:00`).toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' });
}

function InboxRow({ entry }: { entry: InboxEntry }) {
  const inbox = useInbox()!;
  const { data } = useStore();
  const { openQuickAdd } = useUi();
  const toast = useToast();
  const match = inbox.suggest(entry);
  // Ett tryck räcker när kategorin är känd och köpet var i kronor
  const quick = inbox.quickChoice(entry);
  const person =
    entry.personId === HOUSEHOLD
      ? 'Gemensamt kort'
      : (data.persons.find((p) => p.id === entry.personId)?.name ?? 'Okänd person');

  function book() {
    if (!quick) return;
    const booked = inbox.book(entry, quick);
    toast(`${num(quick.amount)} kr på ${quick.line.name}`, { undo: () => inbox.undo([entry], booked.txIds) });
  }

  function discard() {
    inbox.discard(entry);
    toast('Köpet togs bort ur inkorgen', { undo: () => inbox.undo([entry], []) });
  }

  return (
    <li className="inbox-row">
      <button className="tx-main" onClick={() => openQuickAdd({ inbox: entry })}>
        <span className="tx-cat">{entry.merchant || 'Okänd handlare'}</span>
        <span className="tx-note">
          {[formatDay(entry.date), person, entry.currency && `i ${entry.currency}`].filter(Boolean).join(' · ')}
        </span>
      </button>
      <span className="tx-amount">{entry.amount !== null ? num(entry.amount) : '?'}</span>
      <div className="inbox-actions">
        {quick ? (
          <>
            <button className="btn btn-small btn-primary" onClick={book} title={match?.exact ? undefined : 'Gissning utifrån liknande butiker'}>
              {quick.line.name}
              {quick.target === HOUSEHOLD && ` · ${quick.percents?.join('/')}`}
            </button>
            <button className="btn btn-small" onClick={() => openQuickAdd({ inbox: entry })}>
              Ändra
            </button>
          </>
        ) : (
          <button className="btn btn-small btn-primary" onClick={() => openQuickAdd({ inbox: entry })}>
            Välj kategori
          </button>
        )}
        <button className="icon-btn" aria-label="Ta bort ur inkorgen" onClick={discard}>
          ×
        </button>
      </div>
    </li>
  );
}
