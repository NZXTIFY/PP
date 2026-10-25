import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Period, SectionId } from '../types';
import { useStore } from '../store/store';
import { useUi } from '../store/ui';
import { deviation, isExpense, linesFor, periodsWithData, summarize, type CLine, type Summary } from '../lib/calc';
import { SECTIONS } from '../lib/defaults';
import { compact, kr, num, pct, signed } from '../lib/format';
import { periodLabel, shortLabel, splitPeriod } from '../lib/period';
import { C, ChartCard, DataEndBar, DataEndBarH, LegendItem, SeriesTooltip, TooltipBox, axisProps } from '../components/charts';

type Range = 6 | 12 | 0;

interface MonthStat {
  period: Period;
  label: string;
  lines: CLine[];
  s: Summary;
}

export function AnalysisView() {
  const { data } = useStore();
  const { scope, period, setPeriod } = useUi();
  const [range, setRange] = useState<Range>(12);

  const all: MonthStat[] = useMemo(() => {
    const periods = periodsWithData(data, scope);
    const years = new Set(periods.map((p) => splitPeriod(p).year));
    return periods.map((p) => {
      const lines = linesFor(data, scope, p)!;
      return { period: p, label: shortLabel(p, years.size > 1), lines, s: summarize(lines) };
    });
  }, [data, scope]);

  if (all.length === 0) {
    return (
      <section className="card empty-state">
        <h2>Inget att analysera än</h2>
        <p>Skapa en budget och fyll i utfall, eller importera din Excel under Inställningar.</p>
      </section>
    );
  }

  const months = range ? all.slice(-range) : all;
  const followed = months.filter((m) => m.s.followedUp);
  const detail = all.find((m) => m.period === period) ?? followed.at(-1) ?? all.at(-1)!;

  return (
    <>
      <div className="filter-row">
        <div className="segmented segmented-small" role="radiogroup" aria-label="Tidsintervall">
          {([6, 12, 0] as Range[]).map((r) => (
            <button
              key={r}
              role="radio"
              aria-checked={range === r}
              className={range === r ? 'is-active' : ''}
              onClick={() => setRange(r)}
            >
              {r ? `${r} mån` : 'Allt'}
            </button>
          ))}
        </div>
        <label className="inline-select">
          Detaljmånad
          <select value={detail.period} onChange={(e) => setPeriod(e.target.value)}>
            {all.map((m) => (
              <option key={m.period} value={m.period}>
                {periodLabel(m.period)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <RangeKpis months={followed} total={months.length} />
      <SpendingVsBudget months={months} />
      <ResultChart months={months} />
      <Composition months={followed} />
      <CategoryDeviation month={detail} />
      <CategoryTrend months={months} />
      <YearTable all={all} />
    </>
  );
}

function RangeKpis({ months, total }: { months: MonthStat[]; total: number }) {
  if (months.length === 0) {
    return (
      <div className="notice">Inga månader med ifyllt utfall i intervallet än – graferna visar bara planerade belopp.</div>
    );
  }
  const avgResult = months.reduce((s, m) => s + m.s.forecast.result, 0) / months.length;
  const saved = months.reduce((s, m) => s + m.s.forecast.savings, 0);
  const income = months.reduce((s, m) => s + m.s.forecast.income, 0);
  const within = months.filter((m) => m.s.spending.actual <= m.s.spending.budget).length;

  // Kategorin som oftast går över budget
  const over = new Map<string, { name: string; count: number; amount: number }>();
  for (const m of months) {
    for (const l of m.lines) {
      if (!isExpense(l.section) || !l.hasActual || l.actual <= l.filledBudget) continue;
      const prev = over.get(l.key) ?? { name: l.name, count: 0, amount: 0 };
      over.set(l.key, { name: l.name, count: prev.count + 1, amount: prev.amount + l.actual - l.filledBudget });
    }
  }
  const worst = [...over.values()].sort((a, b) => b.count - a.count || b.amount - a.amount)[0];

  return (
    <div className="tiles">
      <div className="tile">
        <span className="tile-label">Snitt över/underskott</span>
        <span className="tile-value">{kr(avgResult)}</span>
        <span className="tile-hint">
          per månad, {months.length} uppföljda{total > months.length ? ` av ${total}` : ''}
        </span>
      </div>
      <div className="tile">
        <span className="tile-label">Sparat totalt</span>
        <span className="tile-value">{kr(saved)}</span>
        <span className="tile-hint">Sparkvot {pct(income > 0 ? saved / income : 0)}</span>
      </div>
      <div className="tile">
        <span className="tile-label">Utgifter inom budget</span>
        <span className="tile-value">
          {within} <small>av {months.length} mån</small>
        </span>
        <span className="tile-hint">Fasta + rörliga sammanlagt</span>
      </div>
      <div className="tile">
        <span className="tile-label">Oftast över budget</span>
        <span className="tile-value tile-value-text">{worst ? worst.name : '–'}</span>
        <span className="tile-hint">
          {worst ? `${worst.count} av ${months.length} mån · ${num(worst.amount)} kr totalt` : '✓ Inga överskridanden'}
        </span>
      </div>
    </div>
  );
}

function SpendingVsBudget({ months }: { months: MonthStat[] }) {
  const rows = months.map((m) => ({
    label: m.label,
    period: m.period,
    Budget: Math.round(m.s.spending.budget),
    Faktiskt: m.s.followedUp ? Math.round(m.s.spending.actual) : undefined,
  }));
  return (
    <ChartCard
      title="Utgifter mot budget"
      subtitle="Fasta + rörliga utgifter per månad"
      legend={
        <>
          <LegendItem color={C.budget} label="Budget" />
          <LegendItem color={C.s1} label="Faktiskt" />
        </>
      }
    >
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={rows} barGap={2} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis {...axisProps} axisLine={false} width={44} tickFormatter={compact} />
          <Tooltip cursor={{ fill: C.wash }} content={(p) => <SeriesTooltip {...p} />} />
          <Bar dataKey="Budget" fill={C.budget} maxBarSize={24} shape={DataEndBar} />
          <Bar dataKey="Faktiskt" fill={C.s1} maxBarSize={24} shape={DataEndBar} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function ResultChart({ months }: { months: MonthStat[] }) {
  const rows = months.map((m) => ({
    label: m.label,
    value: Math.round(m.s.forecast.result),
    planned: !m.s.followedUp,
    partial: m.s.followedUp && m.s.unfilled > 0,
  }));
  return (
    <ChartCard
      title="Över/underskott per månad"
      subtitle="Inkomster minus utgifter och sparande. Rader utan utfall räknas enligt budget; månader som inte följts upp visas ljusare."
      legend={
        <>
          <LegendItem color={C.pos} label="Överskott" />
          <LegendItem color={C.neg} label="Underskott" />
        </>
      }
    >
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis {...axisProps} axisLine={false} width={44} tickFormatter={compact} />
          <ReferenceLine y={0} stroke={C.axis} />
          <Tooltip
            cursor={{ fill: C.wash }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload as (typeof rows)[number];
              return (
                <TooltipBox
                  title={String(label)}
                  rows={[{ name: r.value >= 0 ? 'Överskott' : 'Underskott', value: r.value, color: r.value >= 0 ? C.pos : C.neg }]}
                  note={
                    r.planned ? 'Plan – inte uppföljd än' : r.partial ? 'Prognos – vissa rader enligt budget' : undefined
                  }
                />
              );
            }}
          />
          <Bar dataKey="value" maxBarSize={24} shape={DataEndBar}>
            {rows.map((r) => (
              <Cell key={r.label} fill={r.value >= 0 ? C.pos : C.neg} fillOpacity={r.planned ? 0.4 : 1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function Composition({ months }: { months: MonthStat[] }) {
  if (months.length === 0) return null;
  const rows = months.map((m) => ({
    label: m.label,
    Fasta: Math.round(m.s.sections.fixed.actual),
    Rörliga: Math.round(m.s.sections.variable.actual),
    Sparande: Math.round(m.s.sections.savings.actual),
  }));
  return (
    <ChartCard
      title="Vart pengarna tog vägen"
      subtitle="Faktiskt utfall, uppföljda månader"
      legend={
        <>
          <LegendItem color={C.s1} label="Fasta" />
          <LegendItem color={C.s2} label="Rörliga" />
          <LegendItem color={C.s3} label="Sparande" />
        </>
      }
    >
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis {...axisProps} axisLine={false} width={44} tickFormatter={compact} />
          <Tooltip cursor={{ fill: C.wash }} content={(p) => <SeriesTooltip {...p} />} />
          <Bar dataKey="Fasta" stackId="a" fill={C.s1} maxBarSize={32} stroke="var(--surface)" strokeWidth={2} />
          <Bar dataKey="Rörliga" stackId="a" fill={C.s2} maxBarSize={32} stroke="var(--surface)" strokeWidth={2} />
          <Bar
            dataKey="Sparande"
            stackId="a"
            fill={C.s3}
            maxBarSize={32}
            stroke="var(--surface)"
            strokeWidth={2}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function CategoryDeviation({ month }: { month: MonthStat }) {
  const rows = month.lines
    .filter((l) => l.section !== 'income' && (l.budget !== 0 || l.actual !== 0))
    .map((l) => ({
      key: l.key,
      name: l.name,
      section: l.section,
      budget: Math.round(l.budget),
      filledBudget: Math.round(l.filledBudget),
      actual: Math.round(l.actual),
      dev: Math.round(deviation(l.section, l.filledBudget, l.actual)),
      hasActual: l.hasActual,
    }));
  const charted = rows.filter((r) => r.hasActual && r.dev !== 0).sort((a, b) => a.dev - b.dev);
  const partlyFilled = rows.some((r) => r.hasActual && r.filledBudget !== r.budget);

  return (
    <ChartCard
      title={`Kategorier – ${periodLabel(month.period)}`}
      subtitle="Avvikelse mot budget. Höger = bättre än planerat (mindre utgift eller mer sparat), vänster = sämre."
      legend={
        <>
          <LegendItem color={C.pos} label="Bättre än budget" />
          <LegendItem color={C.neg} label="Sämre än budget" />
        </>
      }
    >
      {charted.length > 0 ? (
        <ResponsiveContainer width="100%" height={Math.max(120, charted.length * 30 + 30)}>
          <BarChart data={charted} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid horizontal={false} stroke={C.grid} />
            <XAxis type="number" {...axisProps} tickFormatter={compact} />
            <YAxis type="category" dataKey="name" {...axisProps} axisLine={false} width={130} interval={0} />
            <ReferenceLine x={0} stroke={C.axis} />
            <Tooltip
              cursor={{ fill: C.wash }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const r = payload[0].payload as (typeof rows)[number];
                return (
                  <TooltipBox
                    title={r.name}
                    rows={[
                      { name: 'Budget', value: r.filledBudget, color: C.budget },
                      { name: 'Faktiskt', value: r.actual, color: C.s1 },
                    ]}
                    note={`${signed(r.dev)} kr ${r.dev >= 0 ? 'bättre' : 'sämre'} än budget`}
                  />
                );
              }}
            />
            <Bar dataKey="dev" maxBarSize={18} shape={DataEndBarH}>
              {charted.map((r) => (
                <Cell key={r.key} fill={r.dev >= 0 ? C.pos : C.neg} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <p className="muted">Inga avvikelser att visa – fyll i utfall för månaden.</p>
      )}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Kategori</th>
              <th>Budget</th>
              <th>Faktiskt</th>
              <th>Avvikelse</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
                <tr key={r.key}>
                  <th>{r.name}</th>
                  <td>{num(r.budget)}</td>
                  <td>{r.hasActual ? num(r.actual) : '–'}</td>
                  <td className={!r.hasActual || r.dev === 0 ? 'is-neutral' : r.dev > 0 ? 'is-good' : 'is-bad'}>
                    {r.hasActual ? `${r.dev > 0 ? '▲' : r.dev < 0 ? '▼' : ''} ${signed(r.dev)}` : '–'}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {partlyFilled && (
        <p className="muted">Avvikelsen räknas bara mot budgeten för de personer som har fyllt i utfall på raden.</p>
      )}
    </ChartCard>
  );
}

function CategoryTrend({ months }: { months: MonthStat[] }) {
  const options = useMemo(() => {
    const map = new Map<string, { key: string; name: string; section: string }>();
    for (const m of months) for (const l of m.lines) if (!map.has(l.key)) map.set(l.key, { key: l.key, name: l.name, section: l.section });
    return [...map.values()];
  }, [months]);
  const [key, setKey] = useState<string>(() => options.find((o) => o.key.startsWith('variable:mat'))?.key ?? options[0]?.key ?? '');
  const selected = options.find((o) => o.key === key) ?? options[0];
  if (!selected) return null;

  const rows = months.map((m) => {
    const l = m.lines.find((x) => x.key === selected.key);
    return {
      label: m.label,
      Budget: l ? Math.round(l.budget) : undefined,
      Faktiskt: l?.hasActual ? Math.round(l.actual) : undefined,
    };
  });
  const actuals = rows.map((r) => r.Faktiskt).filter((v): v is number => v !== undefined);
  const avg = actuals.length ? actuals.reduce((a, b) => a + b, 0) / actuals.length : null;

  return (
    <ChartCard
      title="Trend för en kategori"
      subtitle={avg !== null ? `Snittutfall ${kr(avg)} per månad` : undefined}
      legend={
        <>
          <LegendItem color={C.budget} label="Budget" kind="line" />
          <LegendItem color={C.s1} label="Faktiskt" kind="line" />
        </>
      }
    >
      <label className="inline-select">
        Kategori
        <select value={selected.key} onChange={(e) => setKey(e.target.value)}>
          {SECTIONS.map((s) => (
            <optgroup key={s.id} label={s.title}>
              {options
                .filter((o) => o.section === s.id)
                .map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={rows} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis {...axisProps} axisLine={false} width={44} tickFormatter={compact} />
          <Tooltip cursor={{ stroke: C.axis }} content={(p) => <SeriesTooltip {...p} />} />
          <Line
            type="linear"
            dataKey="Budget"
            stroke={C.budget}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
            connectNulls
          />
          <Line
            type="linear"
            dataKey="Faktiskt"
            stroke={C.s1}
            strokeWidth={2}
            dot={{ r: 4, fill: C.s1, stroke: 'var(--surface)', strokeWidth: 2 }}
            activeDot={{ r: 5, stroke: 'var(--surface)', strokeWidth: 2 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function YearTable({ all }: { all: MonthStat[] }) {
  const years = [...new Set(all.map((m) => splitPeriod(m.period).year))].sort();
  const [year, setYear] = useState(years.at(-1)!);
  const [mode, setMode] = useState<'actual' | 'budget'>('actual');
  const byMonth = new Map(all.filter((m) => splitPeriod(m.period).year === year).map((m) => [splitPeriod(m.period).month, m]));
  const monthsIdx = Array.from({ length: 12 }, (_, i) => i + 1);

  // "Utfall" använder prognosen: rader utan utfall räknas enligt budget (= faktiskt för helt ifyllda månader)
  const sectionRow = (label: string, id: SectionId) => ({
    label,
    pick: (s: Summary) => (mode === 'actual' ? s.forecast.sections[id] : s.sections[id].budget),
  });
  const rowsDef: { label: string; pick: (s: Summary) => number }[] = [
    sectionRow('Inkomster', 'income'),
    sectionRow('Fasta utgifter', 'fixed'),
    sectionRow('Rörliga utgifter', 'variable'),
    sectionRow('Sparande', 'savings'),
    { label: 'Över/underskott', pick: (s) => (mode === 'actual' ? s.forecast.result : s.result.budget) },
  ];

  const usable = (m: MonthStat | undefined) => m && (mode === 'budget' || m.s.followedUp);
  const partial = (m: MonthStat | undefined) => mode === 'actual' && !!m?.s.followedUp && m.s.unfilled > 0;
  const anyPartial = monthsIdx.some((i) => partial(byMonth.get(i)));

  return (
    <section className="card">
      <header className="chart-head">
        <h2>Årsöversikt {year}</h2>
        <div className="filter-row">
          {years.length > 1 && (
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="År">
              {years.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          )}
          <div className="segmented segmented-small" role="radiogroup" aria-label="Visa">
            <button role="radio" aria-checked={mode === 'actual'} className={mode === 'actual' ? 'is-active' : ''} onClick={() => setMode('actual')}>
              Utfall
            </button>
            <button role="radio" aria-checked={mode === 'budget'} className={mode === 'budget' ? 'is-active' : ''} onClick={() => setMode('budget')}>
              Budget
            </button>
          </div>
        </div>
      </header>
      <div className="table-wrap">
        <table className="table table-year">
          <thead>
            <tr>
              <th />
              {monthsIdx.map((i) => (
                <th key={i}>
                  {shortLabel(`${year}-${String(i).padStart(2, '0')}`)}
                  {partial(byMonth.get(i)) ? '*' : ''}
                </th>
              ))}
              <th>Summa</th>
            </tr>
          </thead>
          <tbody>
            {rowsDef.map((r) => {
              const total = monthsIdx.reduce((s, i) => {
                const m = byMonth.get(i);
                return usable(m) ? s + r.pick(m!.s) : s;
              }, 0);
              return (
                <tr key={r.label}>
                  <th>{r.label}</th>
                  {monthsIdx.map((i) => {
                    const m = byMonth.get(i);
                    return <td key={i}>{usable(m) ? num(r.pick(m!.s)) : ''}</td>;
                  })}
                  <td className="is-total">{num(total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {anyPartial && <p className="muted">* Prognos: rader som saknar utfall räknas enligt budget.</p>}
    </section>
  );
}
