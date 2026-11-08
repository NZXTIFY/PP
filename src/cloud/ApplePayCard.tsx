import { useEffect, useState } from 'react';
import type { InboxKey } from '../lib/inbox';
import { HOUSEHOLD, type HouseholdSplit } from '../types';
import { useStore } from '../store/store';
import { useToast } from '../components/Toast';
import { SplitSlider } from '../components/SplitSlider';
import { budgetIncomes } from '../lib/calc';
import { currentPeriod } from '../lib/period';
import { evenPercents, incomePercents, percentsFor } from '../lib/split';
import { useCloud, useInbox } from './context';
import { errorText } from './household';

function createdLabel(k: InboxKey): string {
  const ms = k.createdAt?.toMillis();
  if (!ms) return 'adress skapad nyss';
  return `adress skapad ${new Date(ms).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

/** Adresser för genvägen på iPhone, hur gemensamma köp delas, automatisk bokföring och kända handlare. */
export function ApplePayCard() {
  const inbox = useInbox();
  const { user, isOwner } = useCloud()!;
  const { data, dispatch } = useStore();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!inbox) return null;

  const multi = data.persons.length > 1;
  const autoBook = data.settings.inboxAutoBook !== false;
  const merchants = Object.entries(data.merchants).sort(([, a], [, b]) => a.name.localeCompare(b.name, 'sv'));
  // En adress per person för deras egna kort, och en för hushållets gemensamma kort
  const owners = [
    ...data.persons.map((p) => ({ id: p.id, name: p.name, hint: 'Egna kort' })),
    ...(multi ? [{ id: HOUSEHOLD, name: 'Hushåll', hint: 'Gemensamma kortet, delas' }] : []),
  ];
  const ownerName = (k: InboxKey) => owners.find((o) => o.id === k.personId)?.name ?? '?';

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function copy(key: string) {
    const url = inbox!.urlFor(key);
    try {
      await navigator.clipboard.writeText(url);
      toast('Adressen kopierad – klistra in den i genvägen');
    } catch {
      window.prompt('Kopiera adressen:', url);
    }
  }

  function revoke(k: InboxKey) {
    const waiting = inbox!.entries.filter((e) => e.key === k.key).length;
    const text = waiting
      ? `Ta bort adressen? Genvägen som använder den slutar fungera och ${waiting} köp som väntar i inkorgen försvinner.`
      : 'Ta bort adressen? Genvägen som använder den slutar fungera.';
    if (confirm(text)) run(() => inbox!.revokeKey(k.key));
  }

  return (
    <section className="card">
      <h2>Apple Pay</h2>
      <p className="muted">
        Köp du blippar med Apple Pay kan skickas hit automatiskt med en automation i Genvägar på iPhone. Adressen avgör
        vart köpet hamnar: varje person har en för sina egna kort
        {multi && ', och hushållet en för det gemensamma kortet – de köpen delas'}.
      </p>
      {inbox.error && <div className="notice notice-bad">{inbox.error}</div>}

      <ul className="member-list">
        {owners.map((o) => {
          const keys = inbox.keys.filter((k) => k.personId === o.id);
          return (
            <li key={o.id}>
              <div>
                <strong>{o.name}</strong>
                <div className="muted">
                  {o.hint} · {keys.length ? createdLabel(keys[0]) : 'ingen adress än'}
                </div>
              </div>
              <span className="invite-actions">
                {keys.length ? (
                  <>
                    <button className="btn" onClick={() => copy(keys[0].key)}>
                      Kopiera adress
                    </button>
                    {(keys[0].uid === user.uid || isOwner) && (
                      <button className="btn btn-ghost btn-danger" disabled={busy} onClick={() => revoke(keys[0])}>
                        Ta bort
                      </button>
                    )}
                  </>
                ) : (
                  <button className="btn btn-primary" disabled={busy || !!inbox.error} onClick={() => run(() => inbox.createKey(o.id))}>
                    Skapa adress
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {multi && <HouseholdSplitSetting />}

      <label className="setting-check">
        <input
          type="checkbox"
          checked={autoBook}
          onChange={(e) => dispatch({ type: 'settings', patch: { inboxAutoBook: e.target.checked } })}
        />
        <span>
          Bokför direkt när handlaren är känd
          <span className="checkbox-note">
            Annars väntar alla köp under Att kategorisera på sidan Köp. Köp i utländsk valuta väntar alltid.
          </span>
        </span>
      </label>

      {merchants.length > 0 && (
        <details className="merchant-list">
          <summary>Kända handlare ({merchants.length})</summary>
          <ul>
            {merchants.map(([key, rule]) => (
              <li key={key}>
                <span>{rule.name}</span>
                <span className="muted">{rule.lineName}</span>
                <button
                  className="icon-btn"
                  aria-label={`Glöm ${rule.name}`}
                  title="Glöm handlaren"
                  onClick={() => dispatch({ type: 'forgetMerchant', key })}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <details className="guide" open={!inbox.keys.length}>
        <summary>Så gör du genvägen på iPhone</summary>
        <p>
          Varje adress får en egen automation.
          {multi &&
            ' Har du både egna kort och det gemensamma kortet i telefonen gör du stegen två gånger: en gång med dina egna kort och din adress, och en gång med bara det gemensamma kortet och hushållets adress.'}
        </p>
        <ol>
          <li>
            Skapa adresserna ovan. Gör resten på telefonen, så kan du kopiera adressen direkt.
            {inbox.keys.length > 0 && (
              <div className="guide-copy">
                {inbox.keys.map((k) => (
                  <button key={k.key} className="btn btn-small" onClick={() => copy(k.key)}>
                    Kopiera {ownerName(k)}
                  </button>
                ))}
              </div>
            )}
          </li>
          <li>
            Öppna appen <strong>Genvägar</strong>, gå till fliken <strong>Automatisering</strong> och tryck på{' '}
            <strong>+</strong>.
          </li>
          <li>
            Välj <strong>Transaktion</strong> (med Wallet-ikonen). Under <strong>Kort</strong> markerar du bara korten
            som hör till adressen{multi && ' – dina egna kort för din adress, det gemensamma kortet för hushållets'}. Låt
            kategorier och handlare vara som de är (alla).
          </li>
          <li>
            Välj <strong>Kör omedelbart</strong>. Stäng av <strong>Avisera när den körs</strong> om du inte vill ha en
            notis vid varje köp. Tryck på <strong>Nästa</strong>.
          </li>
          <li>
            Tryck på <strong>Ny tom automatisering</strong> och lägg till åtgärden <strong>Hämta innehållet i URL</strong>{' '}
            (Get Contents of URL).
          </li>
          <li>
            Tryck på <strong>URL</strong> och klistra in adressen.
          </li>
          <li>
            Tryck på pilen <strong>›</strong> för fler val. Sätt <strong>Metod</strong> till <strong>POST</strong> och{' '}
            <strong>Begäran</strong> (Request Body) till <strong>JSON</strong>.
          </li>
          <li>
            Tryck på <strong>Lägg till nytt fält</strong>, välj <strong>Ordlista</strong> och skriv <code>fields</code>{' '}
            som nyckel.
          </li>
          <li>
            Öppna <code>fields</code> och lägg till ett nytt fält av typen <strong>Ordlista</strong> med nyckeln{' '}
            <code>kop</code>.
          </li>
          <li>
            Öppna <code>kop</code> och lägg till ett fält av typen <strong>Text</strong> med nyckeln{' '}
            <code>stringValue</code>.
          </li>
          <li>
            Fyll i värdet med tre variabler och semikolon emellan:
            <ul>
              <li>
                välj <strong>Genvägsinmatning</strong> (Shortcut Input), tryck på den och välj <strong>Belopp</strong>{' '}
                (Amount)
              </li>
              <li>
                skriv <code>;</code>
              </li>
              <li>
                välj Genvägsinmatning igen och välj <strong>Handlare</strong> (Merchant)
              </li>
              <li>
                skriv <code>;</code>
              </li>
              <li>
                välj <strong>Aktuellt datum</strong> (Current Date)
              </li>
            </ul>
            Det ska se ut ungefär så här: <code>Belopp;Handlare;Aktuellt datum</code>
          </li>
          <li>
            Tryck på <strong>Klar</strong>. Nästa gång du blippar med Apple Pay hamnar köpet under{' '}
            <strong>Att kategorisera</strong> på sidan Köp.
          </li>
        </ol>
        <p className="muted">
          Första gången du väljer kategori för en handlare kommer appen ihåg den, oavsett vilket kort du betalar med.
          Byter du kategori på ett enstaka köp senare väljer du om det gäller bara det köpet eller även kommande. Kortet avgör vems köpet är{multi && ': egna kort hamnar hos dig, det gemensamma kortet delas enligt inställningen ovan'}.
        </p>
      </details>

      <details className="guide">
        <summary>Om ett köp inte kommer fram</summary>
        <ul>
          <li>
            Genvägen skickar bara en gång. Saknas nät just när du betalar (t.ex. i en källare) kommer köpet inte fram –
            logga det själv med <strong>+</strong>.
          </li>
          <li>
            Kolla att automationen fortfarande står på <strong>Kör omedelbart</strong>. Efter en iOS-uppdatering kan den
            ha bytts till att fråga först.
          </li>
          <li>
            Har du fått ett nytt kort, t.ex. när det gamla gick ut, måste det markeras i automationen igen.
          </li>
          <li>
            Kolla att <strong>Genvägar</strong> och <strong>Wallet</strong> får använda mobildata (Inställningar →
            Mobilnät).
          </li>
          <li>
            Slå på <strong>Avisera när den körs</strong> en tid. Kommer notisen men inget köp var det nätet. Kommer
            ingen notis startade aldrig automationen – det händer ibland i iOS.
          </li>
        </ul>
      </details>
    </section>
  );
}

const MODES: { id: HouseholdSplit['mode']; label: string }[] = [
  { id: 'income', label: 'Efter inkomst' },
  { id: 'even', label: 'Lika' },
  { id: 'custom', label: 'Egen' },
];

/** Hur köp på det gemensamma kortet delas. Det går alltid att ändra på ett enskilt köp. */
function HouseholdSplitSetting() {
  const { data, dispatch } = useStore();
  const persons = data.persons;
  const ids = persons.map((p) => p.id);
  const setting = data.settings.householdSplit;
  const mode = setting?.mode ?? 'income';
  const byIncome = incomePercents(budgetIncomes(data, ids, currentPeriod(data.settings.periodStartDay)));
  const [custom, setCustom] = useState(
    () => percentsFor(setting?.percents, ids) ?? byIncome ?? evenPercents(ids.length),
  );
  const describe = (pct: number[]) => persons.map((p, i) => `${p.name} ${pct[i]} %`).join(', ');

  function save(next: HouseholdSplit) {
    dispatch({ type: 'settings', patch: { householdSplit: next } });
  }

  // Spara reglaget först när man släppt det en stund – annars blir det en skrivning per steg
  useEffect(() => {
    if (mode !== 'custom' || custom.reduce((a, b) => a + b, 0) !== 100) return;
    if (percentsFor(setting?.percents, ids)?.join() === custom.join()) return;
    const timer = setTimeout(() => save({ mode: 'custom', percents: Object.fromEntries(ids.map((id, i) => [id, custom[i]])) }), 400);
    return () => clearTimeout(timer);
  }, [custom, mode]);

  return (
    <div className="split-setting">
      <span className="details-label">Gemensamma kortet delas</span>
      <div className="segmented segmented-small" role="radiogroup" aria-label="Hur köp på gemensamma kortet delas">
        {MODES.map((m) => (
          <button
            type="button"
            key={m.id}
            role="radio"
            aria-checked={mode === m.id}
            className={mode === m.id ? 'is-active' : ''}
            onClick={() =>
              save(m.id === 'custom' ? { mode: 'custom', percents: Object.fromEntries(ids.map((id, i) => [id, custom[i]])) } : { mode: m.id })
            }
          >
            {m.label}
          </button>
        ))}
      </div>
      {mode === 'custom' ? (
        <div className="split">
          <div className="split-parts">
            {persons.map((p, i) => (
              <div key={p.id} className="split-part">
                <span className="split-name">{p.name}</span>
                <strong>{custom[i]} %</strong>
              </div>
            ))}
          </div>
          <SplitSlider persons={persons} percents={custom} onChange={setCustom} />
        </div>
      ) : (
        <p className="muted">
          {mode === 'even'
            ? `Jämnt: ${describe(evenPercents(ids.length))}.`
            : byIncome
              ? `Efter budgeterad inkomst, just nu ${describe(byIncome)}. Följer med när lönerna ändras.`
              : 'Efter budgeterad inkomst – inkomsterna saknas i budgeten, så köpen delas lika tills de finns.'}
        </p>
      )}
    </div>
  );
}
