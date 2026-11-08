import type { Person } from '../types';

/** Hur något delas i hushållet: ett reglage för två personer, procentfält för fler. */
export function SplitSlider({
  persons,
  percents,
  onChange,
}: {
  persons: Person[];
  percents: number[];
  onChange(percents: number[]): void;
}) {
  if (persons.length === 2) {
    return (
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
          onChange([v, 100 - v]);
        }}
      />
    );
  }
  return (
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
              onChange(percents.map((x, j) => (j === i ? Math.max(0, Math.min(100, Number(e.target.value) || 0)) : x)))
            }
          />
        </label>
      ))}
    </div>
  );
}
