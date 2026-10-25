import { useState } from 'react';
import type { MonthBudget, Period, SectionId } from '../types';
import { HOUSEHOLD } from '../types';
import { useStore } from '../store/store';
import { useUi } from '../store/ui';
import { useToast } from '../components/Toast';
import {
  computeLines,
  deviation,
  isExpense,
  linesFor,
  personMonth,
  previousMonth,
  summarize,
  transactionsFor,
  type CLine,
} from '../lib/calc';
import { SECTIONS } from '../lib/defaults';
import { kr, num } from '../lib/format';
import { periodLabel, shortLabel } from '../lib/period';
import { monthId } from '../lib/id';
import { Delta, SummaryTiles } from '../components/SummaryTiles';
import { LineRow, lineStatus } from '../components/LineRow';

export function BudgetView() {
  const { data } = useStore();
  const { scope, period } = useUi();

  if (scope === HOUSEHOLD) return <HouseholdBudget period={period} />;
  const month = personMonth(data, scope, period);
  if (!month) return <CreateMonth personId={scope} period={period} />;
  return <MonthEditor month={month} />;
}

function CreateMonth({ personId, period }: { personId: string; period: Period }) {
  const { data, dispatch } = useStore();
  const toast = useToast();
  const prev = previousMonth(data, personId, period);
  const person = data.persons.find((p) => p.id === personId);
  const others = Object.values(data.months)
    .filter((m) => m.id !== prev?.id && m.period !== period)
    .sort((a, b) => (a.period < b.period ? 1 : -1));
  const [otherId, setOtherId] = useState('');

  function create(from?: MonthBudget) {
    dispatch({ type: 'createMonth', personId, period, from });
    toast(from ? `Budget skapad från ${periodLabel(from.period)}` : 'Budget skapad från mallen');
  }

  const prevSummary = prev ? summarize(computeLines(prev, [])) : null;

  return (
    <section className="card empty-state">
      <h2>
        Ingen budget för {periodLabel(period)} än{person ? ` (${person.name})` : ''}
      </h2>
      {prev && prevSummary ? (
        <>
          <p>
            Börja från förra budgeten ({periodLabel(prev.period)}): inkomster {kr(prevSummary.sections.income.budget)},
            utgifter och sparande {kr(prevSummary.outflow.budget)}. Du justerar sedan bara det som ändrats.
          </p>
          <button className="btn btn-primary" onClick={() => create(prev)}>
            Kopiera från {periodLabel(prev.period)}
          </button>
        </>
      ) : (
        <p>Starta med samma kategorier som i Excel-mallen och fyll i dina belopp.</p>
      )}
      <div className="empty-actions">
        <button className={`btn ${prev ? '' : 'btn-primary'}`} onClick={() => create()}>
          Börja från tom mall
        </button>
        {others.length > 0 && (
          <span className="copy-other">
            <select value={otherId} onChange={(e) => setOtherId(e.target.value)} aria-label="Kopiera från annan månad">
              <option value="">Kopiera från annan…</option>
              {others.map((m) => (
                <option key={m.id} value={m.id}>
                  {data.persons.find((p) => p.id === m.personId)?.name} – {periodLabel(m.period)}
                </option>
              ))}
            </select>
            <button className="btn" disabled={!otherId} onClick={() => create(data.months[otherId])}>
              Kopiera
            </button>
          </span>
        )}
      </div>
    </section>
  );
}

function MonthEditor({ month }: { month: MonthBudget }) {
  const { data, dispatch } = useStore();
  const toast = useToast();
  const lines = computeLines(month, transactionsFor(data, month.personId, month.period));
  const summary = summarize(lines);

  function deleteMonth() {
    if (!confirm(`Radera hela budgeten för ${periodLabel(month.period)}? Loggade köp för månaden raderas också.`)) return;
    const before = data;
    dispatch({ type: 'deleteMonth', personId: month.personId, period: month.period });
    toast('Månadens budget raderad', { undo: () => dispatch({ type: 'replace', data: before }) });
  }

  return (
    <>
      <SummaryTiles s={summary} />
      {SECTIONS.map((s) => (
        <SectionCard key={s.id} month={month} section={s.id} title={s.title} lines={lines} />
      ))}
      <div className="danger-zone">
        <button className="btn btn-ghost btn-danger" onClick={deleteMonth}>
          Radera budgeten för {periodLabel(month.period)}
        </button>
      </div>
    </>
  );
}

function SectionCard({
  month,
  section,
  title,
  lines,
}: {
  month: MonthBudget;
  section: SectionId;
  title: string;
  lines: CLine[];
}) {
  const { dispatch } = useStore();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const mine = lines.filter((l) => l.section === section);
  const budget = mine.reduce((s, l) => s + l.budget, 0);
  const actual = mine.reduce((s, l) => s + l.actual, 0);
  const hasActual = mine.some((l) => l.hasActual);
  const unfilled = mine.filter((l) => !l.hasActual && l.budget !== 0);

  function fillAll() {
    dispatch({ type: 'fillActuals', monthId: month.id, lineIds: unfilled.map((l) => l.line!.id) });
    toast(`${unfilled.length} rader ifyllda enligt budget`);
  }

  function addLine() {
    const name = newName.trim();
    if (!name) return setAdding(false);
    dispatch({ type: 'addLine', monthId: month.id, section, name });
    setNewName('');
    setAdding(false);
  }

  return (
    <section className={`card section section-${section}`}>
      <header className="section-head">
        <div>
          <h2>{title}</h2>
          <span className="section-totals">
            {num(budget)} budget{hasActual ? ` · ${num(actual)} faktiskt` : ''}
          </span>
        </div>
        {hasActual && (
          <Delta
            value={deviation(section, budget, actual)}
            suffix={isExpense(section) ? (deviation(section, budget, actual) >= 0 ? 'kvar' : 'över') : undefined}
          />
        )}
      </header>

      <div className="line-head" aria-hidden>
        <span>Kategori</span>
        <span>Budget</span>
        <span>Faktiskt</span>
      </div>
      {mine.map((l) => (
        <LineRow key={l.line!.id} month={month} line={l} />
      ))}

      <footer className="section-foot">
        {adding ? (
          <form
            className="add-line"
            onSubmit={(e) => {
              e.preventDefault();
              addLine();
            }}
          >
            <input
              autoFocus
              value={newName}
              placeholder="Namn på ny rad, t.ex. Gym"
              onChange={(e) => setNewName(e.target.value)}
              onBlur={() => {
                if (!newName.trim()) setAdding(false);
              }}
            />
            <button className="btn btn-primary" type="submit">
              Lägg till
            </button>
          </form>
        ) : (
          <button className="btn btn-ghost" onClick={() => setAdding(true)}>
            + Ny rad
          </button>
        )}
        {unfilled.length > 0 && section !== 'variable' && (
          <button className="btn btn-ghost" onClick={fillAll} title="Sätt faktiskt = budget på rader som saknar utfall">
            ✓ Resten enligt budget ({unfilled.length})
          </button>
        )}
      </footer>
    </section>
  );
}

function HouseholdBudget({ period }: { period: Period }) {
  const { data } = useStore();
  const { setScope } = useUi();
  const lines = linesFor(data, HOUSEHOLD, period);
  const perPerson = data.persons.map((p) => {
    const month = data.months[monthId(p.id, period)];
    return {
      person: p,
      summary: month ? summarize(computeLines(month, transactionsFor(data, p.id, period))) : null,
    };
  });
  const missing = perPerson.filter((x) => !x.summary);

  if (!lines) {
    return (
      <section className="card empty-state">
        <h2>Ingen i hushållet har en budget för {periodLabel(period)}</h2>
        <p>Välj en person ovan och skapa en budget, så summeras den här.</p>
      </section>
    );
  }
  const summary = summarize(lines);

  return (
    <>
      {missing.length > 0 && (
        <div className="notice">
          {missing.map((m) => (
            <span key={m.person.id}>
              {m.person.name} har ingen budget för {shortLabel(period)}.{' '}
              <button className="link" onClick={() => setScope(m.person.id)}>
                Skapa
              </button>
            </span>
          ))}
        </div>
      )}
      <SummaryTiles s={summary} />

      <section className="card">
        <h2>Per person</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Inkomster</th>
                <th>Utgifter</th>
                <th>Sparande</th>
                <th>Över/under (plan)</th>
                <th>Över/under (faktiskt)</th>
              </tr>
            </thead>
            <tbody>
              {perPerson
                .filter((x) => x.summary)
                .map(({ person, summary: s }) => (
                  <tr key={person.id}>
                    <th>{person.name}</th>
                    <td>{num(s!.sections.income.budget)}</td>
                    <td>{num(s!.spending.budget)}</td>
                    <td>{num(s!.sections.savings.budget)}</td>
                    <td>{num(s!.result.budget)}</td>
                    <td>{s!.hasActuals ? num(s!.result.actual) : '–'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      {SECTIONS.map((s) => {
        const mine = lines.filter((l) => l.section === s.id && (l.budget !== 0 || l.actual !== 0));
        if (mine.length === 0) return null;
        return (
          <section key={s.id} className="card section">
            <header className="section-head">
              <h2>{s.title}</h2>
            </header>
            <div className="line-head" aria-hidden>
              <span>Kategori</span>
              <span>Budget</span>
              <span>Faktiskt</span>
            </div>
            {mine.map((l) => {
              const st = lineStatus(l);
              return (
                <div key={l.key} className="line is-readonly">
                  <div className="line-name">
                    <span>{l.name}</span>
                    {st && <span className={`line-sub ${st.cls}`}>{st.text}</span>}
                  </div>
                  <span className="amount-static">{num(l.budget)}</span>
                  <span className="amount-static">{l.hasActual ? num(l.actual) : ''}</span>
                </div>
              );
            })}
          </section>
        );
      })}
    </>
  );
}
