import { useEffect, useRef, useState } from 'react';
import type { Line, SectionId } from '../types';
import { HOUSEHOLD } from '../types';
import { useStore } from '../store/store';
import { useUi, type QuickAddState } from '../store/ui';
import { bookPurchase } from '../store/book';
import { useInbox } from '../cloud/context';
import { useToast } from './Toast';
import { householdPercents, personMonth, previousMonth } from '../lib/calc';
import { templateLines } from '../lib/defaults';
import { evalOr0, evaluate } from '../lib/expr';
import { num } from '../lib/format';
import { periodLabel, periodOf, rangeLabel, todayISO } from '../lib/period';
import { evenPercents, groupPercents, incomePercents, percentsFor, splitAmount, splitGroup } from '../lib/split';
import { setPrefs, usePrefs } from '../lib/prefs';
import { SplitSlider } from './SplitSlider';

const ORDER: { id: SectionId; title: string }[] = [
  { id: 'variable', title: 'Rörliga' },
  { id: 'fixed', title: 'Fasta' },
  { id: 'savings', title: 'Sparande' },
  { id: 'income', title: 'Inkomster' },
];

export function QuickAdd() {
  const { quickAdd, closeQuickAdd } = useUi();
  if (!quickAdd) return null;
  return <QuickAddSheet key={quickAdd.edit ?? quickAdd.inbox?.id ?? 'ny'} initial={quickAdd} onClose={closeQuickAdd} />;
}

function QuickAddSheet({ initial, onClose }: { initial: QuickAddState; onClose(): void }) {
  const { data, dispatch } = useStore();
  const { scope } = useUi();
  const prefs = usePrefs();
  const toast = useToast();
  const startDay = data.settings.periodStartDay;
  const persons = data.persons;
  const multi = persons.length > 1;
  const personIds = persons.map((p) => p.id);
  const fallbackPerson = scope === HOUSEHOLD ? (persons[0]?.id ?? '') : scope;

  // Ett köp från Apple Pay-inkorgen: förifyllt, och kategorin från det appen minns om handlaren
  const inbox = useInbox();
  const entry = initial.inbox;
  const [match] = useState(() => (entry && inbox ? inbox.suggest(entry) : null));

  // Ett loggat köp som ändras – hela köpet, alla delar om det är delat
  const [original] = useState(() => {
    const tx = initial.edit ? data.transactions.find((t) => t.id === initial.edit) : undefined;
    return tx ? splitGroup(data.transactions, tx) : null;
  });
  const first = original?.[0];
  const editing = !!initial.edit;

  // Vem köpet gäller: en person eller hela hushållet (delas mellan alla). Från Apple Pay avgör kortet.
  const [target, setTarget] = useState(() => {
    if (first) return first.splitId && multi ? HOUSEHOLD : first.personId;
    if (entry) return entry.personId ?? fallbackPerson;
    return scope === HOUSEHOLD ? (multi ? HOUSEHOLD : (persons[0]?.id ?? '')) : scope;
  });
  const [percents, setPercents] = useState<number[]>(() => {
    if (original && first?.splitId) return groupPercents(original, personIds);
    // Gemensamma kortet delas enligt hushållets inställning
    if (entry) return householdPercents(data, periodOf(entry.date ?? todayISO(), startDay));
    return percentsFor(prefs.split, personIds) ?? evenPercents(persons.length || 1);
  });
  const total = original ? original.reduce((s, t) => s + t.amount, 0) : (entry?.amount ?? null);
  const [amount, setAmount] = useState(total !== null ? String(Math.round(total * 100) / 100).replace('.', ',') : '');
  const [lineKey, setLineKey] = useState(initial.lineKey ?? first?.lineKey ?? match?.rule.lineKey ?? '');
  const [note, setNote] = useState(first?.note ?? entry?.merchant ?? '');
  const [date, setDate] = useState(first?.date ?? entry?.date ?? todayISO());
  const [showAllSections, setShowAllSections] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Köpet har tagits bort (t.ex. på en annan enhet) innan menyn öppnades
  useEffect(() => {
    if (editing && !original) onClose();
  }, [editing, original, onClose]);

  const shared = target === HOUSEHOLD;
  const period = periodOf(date || todayISO(), startDay);

  // Budgetmånad (eller den som ska kopieras fram) för varje berörd person
  const targets = (shared ? persons.map((p) => p.id) : [target]).map((pid) => {
    const month = personMonth(data, pid, period);
    const prev = month ? undefined : previousMonth(data, pid, period);
    return { pid, month, prev, lines: month?.lines ?? prev?.lines ?? templateLines() };
  });

  // Kategorier: alla rader som finns hos någon av de berörda
  const lines: Line[] = [];
  for (const t of targets) for (const l of t.lines) if (!lines.some((x) => x.key === l.key)) lines.push(l);

  const value = evaluate(amount);
  const selected = lines.find((l) => l.key === lineKey);
  const percentSum = percents.reduce((a, b) => a + b, 0);
  const canSave = value !== null && value !== 0 && !!selected && !!target && (!shared || percentSum === 100);
  const parts = shared && value ? splitAmount(value, percents.map((p) => p / 100)) : [];

  const incomes = targets.map((t) =>
    t.lines.filter((l) => l.section === 'income').reduce((s, l) => s + evalOr0(l.budget), 0),
  );
  const byIncome = shared ? incomePercents(incomes) : null;
  const custom = shared && data.settings.householdSplit?.mode === 'custom' ? householdPercents(data, period) : null;

  const preselectedSection = selected?.section;
  const sections = ORDER.filter((s) => s.id === 'variable' || showAllSections || s.id === preselectedSection);

  function save(again: boolean) {
    if (!canSave || !selected) return;
    const line = { key: selected.key, section: selected.section, name: selected.name };
    const split = shared ? percents : undefined;
    const splitText = shared ? ` – delat ${percents.join('/')}` : '';
    if (original && first) return saveEdit(line, split, splitText);

    const booked =
      entry && inbox
        ? inbox.book(entry, { line, target, percents: split, amount: value!, date, note })
        : bookPurchase(data, dispatch, { personIds: targets.map((t) => t.pid), percents: split, line, amount: value!, date, note });

    if (shared && !entry) setPrefs({ split: Object.fromEntries(persons.map((p, i) => [p.id, percents[i]])) });
    const createdText = booked.createdMonths.length ? ` – ${periodLabel(booked.period)} skapad` : '';
    toast(`${num(value!)} kr på ${selected.name}${splitText}${createdText}`);
    if (again) {
      setAmount('');
      setNote('');
      setLineKey('');
      amountRef.current?.focus();
    } else {
      onClose();
    }
  }

  /** Ett ändrat köp bokförs om, med samma id:n så långt det går, och kan ångras. */
  function saveEdit(line: { key: string; section: SectionId; name: string }, split: number[] | undefined, splitText: string) {
    if (!original || !first) return;
    for (const t of original) dispatch({ type: 'removeTransaction', id: t.id });
    const booked = bookPurchase(data, dispatch, {
      personIds: targets.map((t) => t.pid),
      percents: split,
      line,
      amount: value!,
      date,
      note,
      idBase: first.splitId ?? first.id,
      source: first.source,
      createdAt: first.createdAt,
    });
    // Byter man kategori på ett Apple Pay-köp ska nästa köp hos samma handlare hamna där
    if (first.source === 'wallet' && first.note && line.key !== first.lineKey) {
      dispatch({ type: 'rememberMerchant', rule: { name: first.note, lineKey: line.key, section: line.section, lineName: line.name } });
    }
    toast(`Ändrat: ${num(value!)} kr på ${line.name}${splitText}`, {
      undo: () => {
        for (const id of booked.txIds) dispatch({ type: 'removeTransaction', id });
        for (const tx of original) dispatch({ type: 'addTransaction', tx });
      },
    });
    onClose();
  }

  function remove() {
    if (!original) return;
    for (const t of original) dispatch({ type: 'removeTransaction', id: t.id });
    toast(original.length > 1 ? 'Delat köp borttaget för alla' : 'Köp borttaget', {
      undo: () => original.forEach((tx) => dispatch({ type: 'addTransaction', tx })),
    });
    onClose();
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quickadd-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sheet-head">
          <h2 id="quickadd-title">{editing ? 'Ändra köp' : entry ? 'Bokför köp' : 'Logga köp'}</h2>
          <button className="icon-btn" aria-label="Stäng" onClick={onClose}>
            ×
          </button>
        </header>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            save(false);
          }}
        >
          <label className="big-amount">
            <span className="sr-only">Belopp</span>
            <input
              ref={amountRef}
              autoFocus={!editing && entry?.amount == null}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <span className="big-amount-unit">kr</span>
          </label>
          {amount && value === null && <p className="form-error">Kunde inte tolka beloppet.</p>}
          {amount && value !== null && /[+\-*/]/.test(amount.slice(1)) && (
            <p className="form-hint">= {num(value)} kr</p>
          )}
          {entry && (
            <p className="form-hint">
              Från Apple Pay
              {entry.amount === null && <> – kunde inte läsa beloppet ur ”{entry.raw}”</>}
              {entry.currency && <> – köpet var i {entry.currency}, skriv in vad det blev i kronor</>}
              {match && !match.exact && <> – kategorin är en gissning utifrån liknande butiker</>}
            </p>
          )}
          {first?.source === 'wallet' && (
            <p className="form-hint">
              Från Apple Pay
              {first.note && <> – byter du kategori hamnar nästa köp hos {first.note} där också</>}
            </p>
          )}

          {multi && (
            <div className="segmented segmented-small who" role="radiogroup" aria-label="Vems köp">
              {persons.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  role="radio"
                  aria-checked={target === p.id}
                  className={target === p.id ? 'is-active' : ''}
                  onClick={() => setTarget(p.id)}
                >
                  {p.name}
                </button>
              ))}
              <button
                type="button"
                role="radio"
                aria-checked={shared}
                className={shared ? 'is-active' : ''}
                onClick={() => setTarget(HOUSEHOLD)}
              >
                Hushåll
              </button>
            </div>
          )}

          {shared && (
            <div className="split">
              <div className="split-parts">
                {persons.map((p, i) => (
                  <div key={p.id} className="split-part">
                    <span className="split-name">{p.name}</span>
                    <strong>{percents[i]} %</strong>
                    <span className="muted">{value ? `${num(parts[i] ?? 0)} kr` : '–'}</span>
                  </div>
                ))}
              </div>

              <SplitSlider persons={persons} percents={percents} onChange={setPercents} />
              {percentSum !== 100 && <p className="form-error">Andelarna blir {percentSum} %, de måste bli 100 %.</p>}

              <div className="split-presets">
                <button type="button" className="chip" onClick={() => setPercents(evenPercents(persons.length))}>
                  Lika ({evenPercents(persons.length).join('/')})
                </button>
                {byIncome && (
                  <button type="button" className="chip" onClick={() => setPercents(byIncome)}>
                    Efter inkomst ({byIncome.join('/')})
                  </button>
                )}
                {custom && (
                  <button type="button" className="chip" onClick={() => setPercents(custom)}>
                    Hushållets ({custom.join('/')})
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="chip-groups">
            {sections.map((s) => (
              <div key={s.id} className="chip-group">
                <span className="details-label">{s.title}</span>
                <div className="chips">
                  {lines
                    .filter((l) => l.section === s.id)
                    .map((l) => (
                      <button
                        type="button"
                        key={l.key}
                        className={`chip ${lineKey === l.key ? 'is-active' : ''}`}
                        aria-pressed={lineKey === l.key}
                        onClick={() => setLineKey(l.key)}
                      >
                        {l.name}
                      </button>
                    ))}
                </div>
              </div>
            ))}
            {!showAllSections && (
              <button type="button" className="link" onClick={() => setShowAllSections(true)}>
                Visa fasta, sparande och inkomster
              </button>
            )}
          </div>

          <div className="details-grid">
            <label>
              Anteckning
              <input value={note} placeholder="T.ex. ICA, bio" onChange={(e) => setNote(e.target.value)} />
            </label>
            <label>
              Datum
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>
          <p className="form-hint">
            Räknas till <strong>{periodLabel(period)}</strong> ({rangeLabel(period, startDay)})
            {targets.some((t) => !t.month) && ' – budgeten skapas automatiskt från föregående månad'}
          </p>

          <div className="sheet-actions">
            {editing && (
              <button type="button" className="btn btn-ghost btn-danger sheet-delete" onClick={remove}>
                Ta bort
              </button>
            )}
            {!entry && !editing && (
              <button type="button" className="btn" disabled={!canSave} onClick={() => save(true)}>
                Spara & nästa
              </button>
            )}
            <button type="submit" className="btn btn-primary" disabled={!canSave}>
              Spara
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
