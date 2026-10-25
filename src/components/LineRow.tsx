import { useState } from 'react';
import type { MonthBudget } from '../types';
import { useStore } from '../store/store';
import { useUi } from '../store/ui';
import { useToast } from './Toast';
import { deviation, isExpense, lineHistory, type CLine } from '../lib/calc';
import { num, kr } from '../lib/format';
import { addMonths, periodsBetween, shortLabel } from '../lib/period';
import { AmountInput } from './AmountInput';
import { splitGroup } from '../lib/split';
import { usePrefs } from '../lib/prefs';

/** Kort statustext under radnamnet, t.ex. "450 kvar" eller "1 203 över". */
export function lineStatus(l: CLine): { text: string; cls: string } | null {
  if (!l.hasActual) return null;
  const dev = Math.round(deviation(l.section, l.filledBudget, l.actual));
  const txText = l.txCount ? ` · ${l.txCount} köp` : '';
  if (dev === 0) return { text: `enligt budget${txText}`, cls: 'is-neutral' };
  const good = dev > 0;
  const amount = num(Math.abs(dev));
  let text: string;
  if (isExpense(l.section)) text = good ? `${amount} kvar` : `${amount} över`;
  else if (l.section === 'savings') text = good ? `${amount} mer sparat` : `${amount} mindre sparat`;
  else text = good ? `${amount} mer` : `${amount} mindre`;
  return { text: `${good ? '▲' : '▼'} ${text}${txText}`, cls: good ? 'is-good' : 'is-bad' };
}

export function LineRow({ month, line }: { month: MonthBudget; line: CLine }) {
  const { dispatch } = useStore();
  const { showActual } = usePrefs();
  const [open, setOpen] = useState(false);
  const raw = line.line!;
  const status = showActual ? lineStatus(line) : null;
  const ratio = line.budget > 0 ? line.actual / line.budget : 0;
  const showBar = showActual && isExpense(line.section) && line.hasActual && line.budget > 0;

  const update = (patch: Partial<typeof raw>) =>
    dispatch({ type: 'updateLine', monthId: month.id, lineId: raw.id, patch });

  return (
    <div className={`line-wrap ${open ? 'is-open' : ''}`}>
      <div className="line">
        <button className="line-name" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="line-title">
            {raw.name}
            {raw.comment && <span className="line-comment-dot" title={raw.comment} aria-label="Har kommentar" />}
          </span>
          {status && <span className={`line-sub ${status.cls}`}>{status.text}</span>}
          {showBar && (
            <span className={`line-bar ${ratio > 1 ? 'is-over' : ''}`} aria-hidden>
              <span style={{ width: `${Math.min(100, ratio * 100)}%` }} />
            </span>
          )}
        </button>
        <AmountInput label={`${raw.name}, budget`} value={raw.budget} onCommit={(v) => update({ budget: v })} placeholder="0" />
        {showActual && (
          <AmountInput
            label={`${raw.name}, faktiskt`}
            value={raw.actual}
            extra={line.logged}
            onCommit={(v) => update({ actual: v })}
            placeholder="–"
            className="is-actual"
          />
        )}
      </div>
      {open && <LineDetails month={month} line={line} onClose={() => setOpen(false)} />}
    </div>
  );
}

function LineDetails({ month, line, onClose }: { month: MonthBudget; line: CLine; onClose(): void }) {
  const { data, dispatch } = useStore();
  const { openQuickAdd } = useUi();
  const toast = useToast();
  const raw = line.line!;
  const [name, setName] = useState(raw.name);

  const periods = periodsBetween(addMonths(month.period, -6), addMonths(month.period, -1));
  const history = lineHistory(data, month.personId, raw.key, periods).filter((h) => h.hasActual || h.budget);
  const recent = history.filter((h) => h.hasActual).slice(-3);
  const avg = recent.length ? recent.reduce((s, h) => s + h.actual, 0) / recent.length : null;

  const txs = data.transactions
    .filter((t) => t.personId === month.personId && t.period === month.period && t.lineKey === raw.key)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const update = (patch: Partial<typeof raw>) =>
    dispatch({ type: 'updateLine', monthId: month.id, lineId: raw.id, patch });

  function remove() {
    const extra = txs.length ? ` och ${txs.length} loggade köp` : '';
    if (!confirm(`Ta bort raden "${raw.name}"${extra} från den här månaden?`)) return;
    const before = data;
    dispatch({ type: 'removeLine', monthId: month.id, lineId: raw.id });
    toast(`"${raw.name}" borttagen`, { undo: () => dispatch({ type: 'replace', data: before }) });
  }

  return (
    <div className="line-details">
      <div className="details-grid">
        <label>
          Namn
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name !== raw.name && update({ name: name.trim() })}
          />
        </label>
        <label>
          Kommentar
          <input
            defaultValue={raw.comment}
            placeholder="T.ex. vad som hände den här månaden"
            onBlur={(e) => e.target.value !== raw.comment && update({ comment: e.target.value })}
          />
        </label>
      </div>

      <div className="details-actions">
        <button className="btn btn-primary" onClick={() => openQuickAdd({ lineKey: raw.key })}>
          + Logga köp
        </button>
        {raw.budget.trim() !== '' && (
          <button className="btn" onClick={() => update({ actual: raw.budget })}>
            Faktiskt = budget
          </button>
        )}
        {avg !== null && Math.round(avg) !== Math.round(line.budget) && (
          <button className="btn" onClick={() => update({ budget: String(Math.round(avg)) })}>
            Budget = snitt {recent.length} mån ({num(avg)})
          </button>
        )}
      </div>

      {history.length > 0 && (
        <div className="history">
          <span className="details-label">Tidigare månader</span>
          <div className="history-row">
            {history.map((h) => {
              const dev = deviation(line.section, h.budget, h.actual);
              return (
                <div key={h.period} className="history-cell">
                  <span className="history-month">{shortLabel(h.period)}</span>
                  <span>{num(h.budget)}</span>
                  <span className={h.hasActual ? (dev >= 0 ? 'is-good' : 'is-bad') : 'is-neutral'}>
                    {h.hasActual ? num(h.actual) : '–'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {txs.length > 0 && (
        <div className="tx-mini">
          <span className="details-label">Loggade köp ({kr(line.logged)})</span>
          <ul>
            {txs.map((t) => (
              <li key={t.id}>
                <span>{t.date.slice(5).replace('-', '/')}</span>
                <span className="tx-note">
                  {[t.note, t.splitId ? `delat, ${Math.round((t.share ?? 0) * 100)} %` : ''].filter(Boolean).join(' · ') || '–'}
                </span>
                <span className="tx-amount">{num(t.amount)}</span>
                <button
                  className="icon-btn"
                  aria-label={t.splitId ? 'Ta bort delat köp' : 'Ta bort köp'}
                  onClick={() => {
                    const before = data;
                    for (const part of splitGroup(data.transactions, t)) dispatch({ type: 'removeTransaction', id: part.id });
                    toast(t.splitId ? 'Delat köp borttaget för alla' : 'Köp borttaget', {
                      undo: () => dispatch({ type: 'replace', data: before }),
                    });
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="details-foot">
        <button className="btn btn-ghost" onClick={() => dispatch({ type: 'moveLine', monthId: month.id, lineId: raw.id, dir: -1 })}>
          ↑ Flytta upp
        </button>
        <button className="btn btn-ghost" onClick={() => dispatch({ type: 'moveLine', monthId: month.id, lineId: raw.id, dir: 1 })}>
          ↓ Flytta ner
        </button>
        <button className="btn btn-ghost btn-danger" onClick={remove}>
          Ta bort rad
        </button>
        <button className="btn btn-ghost" onClick={onClose}>
          Stäng
        </button>
      </div>
    </div>
  );
}
