import { useEffect, useRef, useState } from 'react';
import type { Line, SectionId } from '../types';
import { HOUSEHOLD } from '../types';
import { useStore } from '../store/store';
import { useUi, type QuickAddState } from '../store/ui';
import { useToast } from './Toast';
import { personMonth, previousMonth } from '../lib/calc';
import { templateLines } from '../lib/defaults';
import { evalOr0, evaluate } from '../lib/expr';
import { monthId, newId } from '../lib/id';
import { num } from '../lib/format';
import { periodLabel, periodOf, rangeLabel, todayISO } from '../lib/period';
import { evenPercents, incomePercents, splitAmount } from '../lib/split';
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

  // Vem köpet gäller: en person eller hela hushållet (delas mellan alla)
  const [target, setTarget] = useState(
    scope === HOUSEHOLD ? (multi ? HOUSEHOLD : (persons[0]?.id ?? '')) : scope,
  );
  const [percents, setPercents] = useState<number[]>(() => {
    const saved = persons.map((p) => prefs.split[p.id]);
    const ok = saved.every((n) => typeof n === 'number') && saved.reduce((a, b) => a + b, 0) === 100;
    return ok ? saved : evenPercents(persons.length || 1);
  });
  const [amount, setAmount] = useState('');
  const [lineKey, setLineKey] = useState(initial.lineKey ?? '');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayISO());
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
    const amounts = shared ? parts : [value!];
    const splitId = shared ? newId() : undefined;
    const created: string[] = [];

    targets.forEach((t, i) => {
      if (shared && amounts[i] === 0) return;
      if (!t.month) {
        dispatch({ type: 'createMonth', personId: t.pid, period, from: t.prev });
        created.push(persons.find((p) => p.id === t.pid)?.name ?? '');
      }
      dispatch({
        type: 'ensureLine',
        monthId: monthId(t.pid, period),
        key: selected.key,
        section: selected.section,
        name: selected.name,
      });
      dispatch({
        type: 'addTransaction',
        tx: {
          id: newId(),
          personId: t.pid,
          period,
          lineKey: selected.key,
          amount: amounts[i],
          date,
          note: note.trim(),
          createdAt: new Date().toISOString(),
          splitId,
          share: shared ? percents[i] / 100 : undefined,
        },
      });
    });

    if (shared) setPrefs({ split: Object.fromEntries(persons.map((p, i) => [p.id, percents[i]])) });
    const split = shared ? ` – delat ${percents.join('/')}` : '';
    const createdText = created.length ? ` – ${periodLabel(period)} skapad` : '';
    toast(`${num(value!)} kr på ${selected.name}${split}${createdText}`);
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
          <h2 id="quickadd-title">Logga köp</h2>
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
            <button type="button" className="btn" disabled={!canSave} onClick={() => save(true)}>
              Spara & nästa
            </button>
            <button type="submit" className="btn btn-primary" disabled={!canSave}>
              Spara
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
