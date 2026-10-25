import { setThemePref, useTheme, type ThemePref } from '../lib/theme';

const SUN = 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4';
const MOON = 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z';

/** Snabbväxling i toppraden mellan ljust och mörkt. */
export function ThemeToggle() {
  const { dark } = useTheme();
  const label = dark ? 'Byt till ljust läge' : 'Byt till mörkt läge';
  return (
    <button className="icon-btn theme-toggle" aria-label={label} title={label} onClick={() => setThemePref(dark ? 'light' : 'dark')}>
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d={dark ? SUN : MOON} />
      </svg>
    </button>
  );
}

const OPTIONS: { id: ThemePref; label: string }[] = [
  { id: 'system', label: 'Som systemet' },
  { id: 'light', label: 'Ljust' },
  { id: 'dark', label: 'Mörkt' },
];

export function ThemeCard() {
  const { pref } = useTheme();
  return (
    <section className="card">
      <h2>Utseende</h2>
      <p className="muted">Valet sparas på den här enheten.</p>
      <div className="segmented" role="radiogroup" aria-label="Tema">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            role="radio"
            aria-checked={pref === o.id}
            className={pref === o.id ? 'is-active' : ''}
            onClick={() => setThemePref(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </section>
  );
}
