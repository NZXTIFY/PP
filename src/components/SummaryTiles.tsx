import type { Summary } from '../lib/calc';
import { kr, num, pct } from '../lib/format';
import { usePrefs } from '../lib/prefs';

/** Etikett + ikon för gott/dåligt så att färgen aldrig bär betydelsen ensam. */
export function Delta({ value, goodWhenPositive = true, suffix }: { value: number; goodWhenPositive?: boolean; suffix?: string }) {
  const r = Math.round(value);
  if (r === 0) return <span className="delta is-neutral">± 0{suffix ? ` ${suffix}` : ''}</span>;
  const good = goodWhenPositive ? r > 0 : r < 0;
  return (
    <span className={`delta ${good ? 'is-good' : 'is-bad'}`}>
      {r > 0 ? '▲' : '▼'} {num(Math.abs(r))}
      {suffix ? ` ${suffix}` : ''}
    </span>
  );
}

export function Meter({ value, max }: { value: number; max: number }) {
  const ratio = max > 0 ? value / max : value > 0 ? 1 : 0;
  const level = ratio > 1 ? 'is-over' : ratio > 0.9 ? 'is-near' : '';
  return (
    <div className={`meter ${level}`} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <div className="meter-fill" style={{ width: `${Math.min(100, ratio * 100)}%` }} />
    </div>
  );
}

export type TileId = 'planned' | 'forecast' | 'variable' | 'savings' | 'hitrate';

/** Rutorna överst på budgetsidan. `actual` = visar utfall och döljs i läget "Bara budget". */
export const TILE_OPTIONS: { id: TileId; label: string; actual?: boolean }[] = [
  { id: 'planned', label: 'Planerat över/underskott' },
  { id: 'forecast', label: 'Prognos / faktiskt över/underskott', actual: true },
  { id: 'variable', label: 'Rörliga utgifter', actual: true },
  { id: 'savings', label: 'Sparkvot' },
  { id: 'hitrate', label: 'Budgetträff', actual: true },
];

export function SummaryTiles({ s }: { s: Summary }) {
  const { showActual, hiddenTiles } = usePrefs();
  const show = (id: TileId) =>
    !hiddenTiles.includes(id) && (showActual || !TILE_OPTIONS.find((t) => t.id === id)!.actual);
  const planned = Math.round(s.result.budget);
  const withActual = showActual && s.hasActuals;

  if (!TILE_OPTIONS.some((t) => show(t.id))) return null;

  return (
    <div className="tiles">
      {show('planned') && (
        <div className="tile">
          <span className="tile-label">Planerat över/underskott</span>
          <span className="tile-value">{kr(planned)}</span>
          <span className="tile-hint">
            {planned === 0
              ? '✓ Varje krona har en uppgift'
              : planned > 0
                ? `${num(planned)} kr ofördelat`
                : `⚠ Du planerar ${num(-planned)} kr mer än du tjänar`}
          </span>
        </div>
      )}

      {show('forecast') && (
        <div className="tile">
          <span className="tile-label">
            {s.hasActuals && s.unfilled > 0 ? 'Prognos över/underskott' : 'Faktiskt över/underskott'}
          </span>
          <span className="tile-value">{s.hasActuals ? kr(s.forecast.result) : '–'}</span>
          <span className="tile-hint">
            {s.hasActuals ? (
              <>
                <Delta value={s.forecast.result - s.result.budget} /> mot plan
                {s.unfilled > 0 && ` · ${s.unfilled} rader räknas enligt budget`}
              </>
            ) : (
              'Inget utfall ifyllt än'
            )}
          </span>
        </div>
      )}

      {show('variable') && (
        <div className="tile">
          <span className="tile-label">Rörliga utgifter</span>
          <span className="tile-value">
            {num(s.sections.variable.actual)} <small>av {num(s.sections.variable.budget)}</small>
          </span>
          <Meter value={s.sections.variable.actual} max={s.sections.variable.budget} />
        </div>
      )}

      {show('savings') && (
        <div className="tile">
          <span className="tile-label">Sparkvot</span>
          <span className="tile-value">{pct(withActual ? s.forecast.savingsRate : s.savingsRate.budget)}</span>
          <span className="tile-hint">{withActual ? `Plan ${pct(s.savingsRate.budget)}` : 'Planerad'}</span>
        </div>
      )}

      {show('hitrate') && s.expenseLines > 0 && (
        <div className="tile">
          <span className="tile-label">Budgetträff</span>
          <span className="tile-value">
            {s.withinBudget} <small>av {s.expenseLines} rader</small>
          </span>
          <span className="tile-hint">
            {s.overspend > 0 ? `${num(s.overspend)} kr över på enskilda rader` : '✓ Inga överskridanden'}
          </span>
        </div>
      )}
    </div>
  );
}
