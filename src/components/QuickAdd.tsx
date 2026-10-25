import { useEffect, useRef, useState } from 'react';
import type { Line, SectionId } from '../types';
import { HOUSEHOLD } from '../types';
import { useStore } from '../store/store';
import { useUi, type QuickAddState } from '../store/ui';
import { bookPurchase } from '../store/book';
import { useInbox } from '../cloud/context';
import { useToast } from './Toast';
import { personMonth, previousMonth } from '../lib/calc';
import { templateLines } from '../lib/defaults';
import { evalOr0, evaluate } from '../lib/expr';
import { num } from '../lib/format';
import { periodLabel, periodOf, rangeLabel, todayISO } from '../lib/period';
import { evenPercents, incomePercents, percentsFor, splitAmount } from '../lib/split';
import { setPrefs, usePrefs } from '../lib/prefs';

const ORDER: { id: SectionId; title: string }[] = [
  { id: 'variable', title: 'Rörliga' },
  { id: 'fixed', title: 'Fasta' },
  { id: 'savings', title: 'Sparande' },
  { id: 'income', title: 'Inkomster' },
];

export function QuickAdd() {
  const { quickAdd, closeQuickAdd } = useUi();
  if (!quickAdd) return null;
  return <QuickAddSheet initial={quickAdd} onClose={closeQuickAdd} />;
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

  // Vem köpet gäller: en person eller hela hushållet (delas mellan alla)
  const [target, setTarget] = useState(() => {
    if (entry) return match?.rule.shared && multi ? HOUSEHOLD : (entry.personId ?? fallbackPerson);
    return scope === HOUSEHOLD ? (multi ? HOUSEHOLD : (persons[0]?.id ?? '')) : scope;
  });
  const [percents, setPercents] = useState<number[]>(
    () =>
      (match?.rule.shared ? percentsFor(match.rule.split, personIds) : null) ??
      percentsFor(prefs.split, personIds) ??
      evenPercents(persons.length || 1),
  );
  const [amount, setAmount] = useState(entry?.amount != null ? String(entry.amount).replace('.', ',') : '');
  const [lineKey, setLineKey] = useState(initial.lineKey ?? match?.rule.lineKey ?? '');
  const [note, setNote] = useState(entry?.merchant ?? '');
  const [date, setDate] = useState(entry?.date ?? todayISO());
  const [showAllSections, setShowAllSections] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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

  const preselectedSection = selected?.section;
  const sections = ORDER.filter((s) => s.id === 'variable' || showAllSections || s.id === preselectedSection);

  function save(again: boolean) {
    if (!canSave || !selected) return;
    const line = { key: selected.key, section: selected.section, name: selected.name };
    const split = shared ? percents : undefined;
    const booked =
      entry && inbox
        ? inbox.book(entry, { line, target, percents: split, amount: value!, date, note })
        : bookPurchase(data, dispatch, { personIds: targets.map((t) => t.pid), percents: split, line, amount: value!, date, note });

    if (shared) setPrefs({ split: Object.fromEntries(persons.map((p, i) => [p.id, percents[i]])) });
    const splitText = shared ? ` – delat ${percents.join('/')}` : '';
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
          <h2 id="quickadd-title">{entry ? 'Bokför köp' : 'Logga köp'}</h2>
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
              autoFocus
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

              {persons.length === 2 ? (
                <input
                  type="range"
                  className="split-slider"
                  min={0}
                  max={100}
                  step={1}
                  value={percents[0]}
                  aria-label={`${persons[0].name}s andel i procent`}
                  aria-valuetext={`${persons[0].name} ${percents[0]} %, ${persons[1].name} ${percents[1]} %`}
                  onChange={(e) => {
                    // Snäpp till jämna femtal (40/60, 45/55) när man är nära – lätt att träffa med tummen
                    const raw = Number(e.target.value);
                    const round = Math.round(raw / 5) * 5;
                    const v = Math.abs(raw - round) <= 1 ? round : raw;
                    setPercents([v, 100 - v]);
                  }}
                />
              ) : (
                <div className="split-inputs">
                  {persons.map((p, i) => (
                    <label key={p.id}>
                      {p.name}
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={percents[i]}
                        onChange={(e) =>
                          setPercents(percents.map((x, j) => (j === i ? Math.max(0, Math.min(100, Number(e.target.value) || 0)) : x)))
                        }
                      />
                    </label>
                  ))}
                </div>
              )}
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
            {!entry && (
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
