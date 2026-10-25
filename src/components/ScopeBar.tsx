import { HOUSEHOLD } from '../types';
import { useStore } from '../store/store';
import { useUi } from '../store/ui';
import { addMonths, periodLabel, periodStatus, rangeLabel } from '../lib/period';

export function ScopeSwitcher() {
  const { data } = useStore();
  const { scope, setScope } = useUi();
  if (data.persons.length === 0) return null;

  const options = [...data.persons.map((p) => ({ id: p.id, name: p.name }))];
  if (data.persons.length > 1) options.push({ id: HOUSEHOLD, name: 'Hushåll' });

  return (
    <div className="segmented" role="tablist" aria-label="Vems budget">
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={scope === o.id}
          className={scope === o.id ? 'is-active' : ''}
          onClick={() => setScope(o.id)}
        >
          {o.name}
        </button>
      ))}
    </div>
  );
}

const STATUS_TEXT = { past: 'Avslutad', current: 'Pågår', future: 'Kommande' } as const;

export function MonthNav() {
  const { data } = useStore();
  const { period, setPeriod } = useUi();
  const startDay = data.settings.periodStartDay;
  const status = periodStatus(period, startDay);

  return (
    <div className="month-nav">
      <button className="icon-btn" aria-label="Föregående månad" onClick={() => setPeriod(addMonths(period, -1))}>
        ‹
      </button>
      <div className="month-nav-label">
        <strong>{periodLabel(period)}</strong>
        <span>
          {rangeLabel(period, startDay)} · <span className={`status-${status}`}>{STATUS_TEXT[status]}</span>
        </span>
      </div>
      <button className="icon-btn" aria-label="Nästa månad" onClick={() => setPeriod(addMonths(period, 1))}>
        ›
      </button>
    </div>
  );
}
