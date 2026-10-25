import { useEffect, useRef, useState } from 'react';
import type { SectionId } from '../types';
import { HOUSEHOLD } from '../types';
import { useStore } from '../store/store';
import { useUi, type QuickAddState } from '../store/ui';
import { useToast } from './Toast';
import { personMonth, previousMonth } from '../lib/calc';
import { templateLines } from '../lib/defaults';
import { evaluate } from '../lib/expr';
import { newId } from '../lib/id';
import { num } from '../lib/format';
import { periodLabel, periodOf, rangeLabel, todayISO } from '../lib/period';

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
  const toast = useToast();
  const startDay = data.settings.periodStartDay;

  const [personId, setPersonId] = useState(scope !== HOUSEHOLD ? scope : (data.persons[0]?.id ?? ''));
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

  const period = periodOf(date || todayISO(), startDay);
  const month = personMonth(data, personId, period);
  const prev = month ? undefined : previousMonth(data, personId, period);
  const lines = month?.lines ?? prev?.lines ?? templateLines();
  const value = evaluate(amount);
  const selected = lines.find((l) => l.key === lineKey);
  const canSave = value !== null && value !== 0 && !!selected && !!personId;

  // Visa rörliga direkt; övriga sektioner bakom en knapp så listan hålls kort.
  const preselectedSection = selected?.section;
  const sections = ORDER.filter(
    (s) => s.id === 'variable' || showAllSections || s.id === preselectedSection,
  );

  function save(again: boolean) {
    if (!canSave || !selected) return;
    if (!month) dispatch({ type: 'createMonth', personId, period, from: prev });
    dispatch({
      type: 'addTransaction',
      tx: {
        id: newId(),
        personId,
        period,
        lineKey: selected.key,
        amount: value!,
        date,
        note: note.trim(),
        createdAt: new Date().toISOString(),
      },
    });
    const created = month ? '' : ` – ${periodLabel(period)} skapad`;
    toast(`${num(value!)} kr på ${selected.name}${created}`);
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

          {data.persons.length > 1 && (
            <div className="segmented segmented-small" role="radiogroup" aria-label="Vems köp">
              {data.persons.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  role="radio"
                  aria-checked={personId === p.id}
                  className={personId === p.id ? 'is-active' : ''}
                  onClick={() => setPersonId(p.id)}
                >
                  {p.name}
                </button>
              ))}
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
            {!month && ' – budgeten skapas automatiskt från föregående månad'}
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
