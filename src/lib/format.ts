const whole = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 });

/** "26 480" */
export function num(n: number): string {
  return whole.format(Math.round(n));
}

/** "26 480 kr" */
export function kr(n: number): string {
  return `${num(n)} kr`;
}

/** "+1 300" / "−450" */
export function signed(n: number): string {
  const r = Math.round(n);
  if (r === 0) return '0';
  return r > 0 ? `+${num(r)}` : num(r);
}

/** "28,2 %" */
export function pct(ratio: number): string {
  return `${(ratio * 100).toFixed(1).replace('.', ',')} %`;
}

/** Kompakt för axlar: 0, 500, 1,5k, 12k */
export function compact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1000) {
    const k = abs / 1000;
    return `${sign}${(k >= 10 ? Math.round(k).toString() : k.toFixed(1).replace('.0', '').replace('.', ','))}k`;
  }
  return `${sign}${Math.round(abs)}`;
}
