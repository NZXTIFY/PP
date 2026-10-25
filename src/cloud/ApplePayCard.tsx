import { useState } from 'react';
import type { InboxKey } from '../lib/inbox';
import { useStore } from '../store/store';
import { useToast } from '../components/Toast';
import { useCloud, useInbox } from './context';
import { errorText } from './household';

function createdLabel(k: InboxKey): string {
  const ms = k.createdAt?.toMillis();
  if (!ms) return 'Adress skapad nyss';
  return `Adress skapad ${new Date(ms).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

/** Adresser för genvägen på iPhone, automatisk bokföring och kända handlare. */
export function ApplePayCard() {
  const inbox = useInbox();
  const { user, isOwner } = useCloud()!;
  const { data, dispatch } = useStore();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!inbox) return null;

  const autoBook = data.settings.inboxAutoBook !== false;
  const merchants = Object.entries(data.merchants).sort(([, a], [, b]) => a.name.localeCompare(b.name, 'sv'));
  const firstKey = inbox.keys.find((k) => k.uid === user.uid) ?? inbox.keys[0];

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
        Köp du blippar med Apple Pay kan skickas hit automatiskt med en automation i Genvägar på iPhone. Varje person
        behöver en egen adress – den avgör vems budget köpet hamnar i.
      </p>
      {inbox.error && <div className="notice notice-bad">{inbox.error}</div>}

      <ul className="member-list">
        {data.persons.map((p) => {
          const keys = inbox.keys.filter((k) => k.personId === p.id);
          return (
            <li key={p.id}>
              <div>
                <strong>{p.name}</strong>
                <div className="muted">{keys.length ? createdLabel(keys[0]) : 'Ingen adress än'}</div>
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
                  <button className="btn btn-primary" disabled={busy || !!inbox.error} onClick={() => run(() => inbox.createKey(p.id))}>
                    Skapa adress
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>

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
                <span className="muted">
                  {rule.lineName}
                  {rule.shared && ' · delat'}
                </span>
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
        <ol>
          <li>
            Skapa en adress ovan för den som ska använda telefonen. Gör resten på telefonen, så kan du kopiera adressen
            direkt.
            {firstKey && (
              <div className="guide-copy">
                <button className="btn btn-small" onClick={() => copy(firstKey.key)}>
                  Kopiera adress
                </button>
              </div>
            )}
          </li>
          <li>
            Öppna appen <strong>Genvägar</strong>, gå till fliken <strong>Automatisering</strong> och tryck på{' '}
            <strong>+</strong>.
          </li>
          <li>
            Välj <strong>Transaktion</strong> (med Wallet-ikonen). Markera korten du betalar med och låt resten vara som
            det är.
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
          Bra att veta: genvägen behöver vara uppkopplad när du betalar. Utan nät skickas inget och då får du logga köpet
          själv. Den körs när du blippar i butik, inte alltid vid Apple Pay i appar eller på webben. Första gången du
          väljer kategori för en handlare kommer appen ihåg den. Välj Hushåll om köpet ska delas, så minns appen det
          också.
        </p>
      </details>
    </section>
  );
}
