import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { evaluate, isFormula } from '../lib/expr';
import { num } from '../lib/format';

interface Props {
  /** Uttrycket som det är sparat, t.ex. "1700+2266". */
  value: string;
  onCommit(value: string): void;
  /** Läggs på det visade beloppet när fältet inte är i fokus (loggade köp). */
  extra?: number;
  placeholder?: string;
  label: string;
  className?: string;
  autoFocus?: boolean;
}

/** Hoppa till nästa beloppsfält med Enter, som i Excel. */
function focusNext(current: HTMLInputElement) {
  const all = [...document.querySelectorAll<HTMLInputElement>('input[data-amount]')];
  const idx = all.indexOf(current);
  const next = all[idx + 1];
  if (next) next.focus();
  else current.blur();
}

export function AmountInput({ value, onCommit, extra = 0, placeholder, label, className, autoFocus }: Props) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);

  const result = evaluate(focused ? draft : value);
  const invalid = result === null;
  const empty = value.trim() === '' && extra === 0;

  let shown: string;
  if (focused) shown = draft;
  else if (empty) shown = '';
  else if (invalid) shown = value;
  else shown = num(result + extra);

  function commit() {
    const clean = draft.trim();
    if (clean !== value) onCommit(clean);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
      focusNext(e.currentTarget);
    } else if (e.key === 'Escape') {
      setDraft(value);
      requestAnimationFrame(() => ref.current?.blur());
    }
  }

  const formula = isFormula(value);
  const title = [
    formula ? `${value} = ${num(evaluate(value) ?? 0)}` : '',
    extra ? `inkl. ${num(extra)} kr loggade köp` : '',
    invalid ? 'Kunde inte räkna ut uttrycket' : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <span className={`amount ${className ?? ''} ${invalid ? 'is-invalid' : ''}`}>
      <input
        ref={ref}
        data-amount
        type="text"
        inputMode="decimal"
        enterKeyHint="next"
        autoComplete="off"
        aria-label={label}
        aria-invalid={invalid || undefined}
        title={title || undefined}
        placeholder={placeholder}
        value={shown}
        autoFocus={autoFocus}
        onFocus={(e) => {
          setFocused(true);
          setDraft(value);
          // Markera allt när råvärdet har ritats ut – men inte om man redan hunnit börja skriva
          const el = e.currentTarget;
          requestAnimationFrame(() => {
            if (el.value === value) el.select();
          });
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          commit();
          setFocused(false);
        }}
        onKeyDown={onKeyDown}
      />
      {!focused && (formula || extra !== 0) && (
        <span className="amount-mark" aria-hidden>
          {extra !== 0 ? '+' : 'ƒ'}
        </span>
      )}
      {focused && (extra !== 0 || (isFormula(draft) && result !== null)) && (
        <span className="amount-preview" aria-live="polite">
          {isFormula(draft) && result !== null ? `= ${num(result)}` : ''}
          {extra !== 0 ? ` + ${num(extra)} loggat` : ''}
        </span>
      )}
    </span>
  );
}
