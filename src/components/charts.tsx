import type { ReactNode } from 'react';
import { Rectangle } from 'recharts';
import { num } from '../lib/format';

/** Färgroller – definieras som CSS-variabler i styles.css (ljust/mörkt läge). */
export const C = {
  s1: 'var(--series-1)',
  s2: 'var(--series-2)',
  s3: 'var(--series-3)',
  budget: 'var(--series-budget)',
  pos: 'var(--div-pos)',
  neg: 'var(--div-neg)',
  grid: 'var(--grid)',
  axis: 'var(--axis)',
  muted: 'var(--text-muted)',
  wash: 'var(--hover-wash)',
};

export const axisProps = {
  stroke: C.axis,
  tick: { fill: C.muted, fontSize: 12 },
  tickLine: false,
} as const;

export function ChartCard({ title, subtitle, children, legend }: { title: string; subtitle?: string; legend?: ReactNode; children: ReactNode }) {
  return (
    <section className="card chart-card">
      <header className="chart-head">
        <h2>{title}</h2>
        {subtitle && <p className="muted">{subtitle}</p>}
        {legend && <div className="legend">{legend}</div>}
      </header>
      {children}
    </section>
  );
}

export function LegendItem({ color, label, kind = 'rect' }: { color: string; label: string; kind?: 'rect' | 'line' }) {
  return (
    <span className="legend-item">
      <span className={`legend-key legend-${kind}`} style={{ background: color }} />
      {label}
    </span>
  );
}

interface TipRow {
  name: string;
  value: number;
  color: string;
}

/** Tooltip: värdet först, namnet efter, med en kort linje i seriens färg. */
export function TooltipBox({ title, rows, note }: { title: string; rows: TipRow[]; note?: string }) {
  return (
    <div className="chart-tip">
      <div className="chart-tip-title">{title}</div>
      {rows.map((r) => (
        <div key={r.name} className="chart-tip-row">
          <span className="chart-tip-key" style={{ background: r.color }} />
          <strong>{num(r.value)}</strong>
          <span>{r.name}</span>
        </div>
      ))}
      {note && <div className="chart-tip-note">{note}</div>}
    </div>
  );
}

interface SeriesTooltipProps {
  active?: boolean;
  label?: unknown;
  payload?: ReadonlyArray<{ name?: unknown; value?: unknown; color?: string }>;
}

/** Standardtooltip för Recharts – alla serier vid samma x, i seriens färg. */
export function SeriesTooltip({ active, payload, label }: SeriesTooltipProps) {
  if (!active || !payload?.length) return null;
  const rows = payload
    .filter((p) => p.value !== undefined && p.value !== null)
    .map((p) => ({ name: String(p.name), value: Number(p.value), color: p.color ?? C.s1 }));
  return <TooltipBox title={String(label)} rows={rows} />;
}

/** Stapel med 4px rundad dataände – även för negativa värden (där änden pekar nedåt). */
export function DataEndBar(props: unknown) {
  const p = props as { x: number; y: number; width: number; height: number; fill: string; value?: number | [number, number] };
  const value = Array.isArray(p.value) ? p.value[1] - p.value[0] : (p.value ?? 0);
  const negative = value < 0 || p.height < 0;
  const radius: [number, number, number, number] = negative ? [0, 0, 4, 4] : [4, 4, 0, 0];
  // Recharts ger negativ höjd för negativa staplar – normalisera
  const y = p.height < 0 ? p.y + p.height : p.y;
  const height = Math.abs(p.height);
  return <Rectangle x={p.x} y={y} width={p.width} height={height} fill={p.fill} radius={radius} />;
}

/** Horisontell stapel: rundad ände åt höger för positiva, åt vänster för negativa. */
export function DataEndBarH(props: unknown) {
  const p = props as { x: number; y: number; width: number; height: number; fill: string; value?: number };
  const negative = (p.value ?? 0) < 0 || p.width < 0;
  const radius: [number, number, number, number] = negative ? [4, 0, 0, 4] : [0, 4, 4, 0];
  const x = p.width < 0 ? p.x + p.width : p.x;
  const width = Math.abs(p.width);
  return <Rectangle x={x} y={p.y} width={width} height={p.height} fill={p.fill} radius={radius} />;
}
