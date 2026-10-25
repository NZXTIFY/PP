import { useState } from 'react';
import { useToast } from '../components/Toast';
import { useCloud } from './context';
import { ApplePayCard } from './ApplePayCard';
import {
  createInvite,
  errorText,
  leaveHousehold,
  logOut,
  removeMember,
  renameHousehold,
  resetPassword,
  revokeInvite,
} from './household';

function inviteLink(code: string): string {
  return `${location.origin}${location.pathname}?invite=${code}`;
}

function formatCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, '$1-');
}

export default function CloudSettings() {
  return (
    <>
      <HouseholdCard />
      <ApplePayCard />
      <AccountCard />
    </>
  );
}

function HouseholdCard() {
  const cloud = useCloud()!;
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const { household, householdId, members, invites, isOwner, user } = cloud;

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

  async function share(code: string) {
    const url = inviteLink(code);
    const text = `Gå med i ${household?.name ?? 'vårt hushåll'} i budgetappen. Kod: ${formatCode(code)}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Inbjudan till budgeten', text, url });
        return;
      } catch {
        /* avbrutet – fall tillbaka på kopiering */
      }
    }
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast('Inbjudan kopierad');
  }

  const sorted = [...members].sort((a, b) => (a.role === b.role ? a.displayName.localeCompare(b.displayName) : a.role === 'owner' ? -1 : 1));

  return (
    <section className="card">
      <h2>Hushåll</h2>
      {isOwner ? (
        <div className="details-grid household-name">
          <label>
            Namn
            <input
              defaultValue={household?.name}
              key={household?.name}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== household?.name) run(() => renameHousehold(householdId, v));
              }}
            />
          </label>
        </div>
      ) : (
        <p className="muted">{household?.name}</p>
      )}

      <span className="details-label">Medlemmar</span>
      <ul className="member-list">
        {sorted.map((m) => (
          <li key={m.uid}>
            <div>
              <strong>{m.displayName}</strong>
              {m.uid === user.uid && <span className="muted"> (du)</span>}
              <div className="muted">{m.email}</div>
            </div>
            {m.role === 'owner' ? (
              <span className="badge">Ägare</span>
            ) : isOwner ? (
              <button
                className="btn btn-ghost btn-danger"
                disabled={busy}
                onClick={() => confirm(`Ta bort ${m.displayName} från hushållet?`) && run(() => removeMember(householdId, m.uid))}
              >
                Ta bort
              </button>
            ) : (
              <span className="badge badge-muted">Medlem</span>
            )}
          </li>
        ))}
      </ul>

      {isOwner && (
        <div className="invites">
          <span className="details-label">Bjud in</span>
          <p className="muted">
            Skapa en kod och skicka den (eller länken) till den du vill bjuda in. Koden gäller i 7 dagar.
          </p>
          {invites.map((inv) => (
            <div key={inv.code} className={`invite-row ${fresh === inv.code ? 'is-fresh' : ''}`}>
              <code className="invite-code">{formatCode(inv.code)}</code>
              <span className="muted">t.o.m. {inv.expiresAt.toDate().toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</span>
              <span className="invite-actions">
                <button className="btn" onClick={() => share(inv.code)}>
                  Dela
                </button>
                <button className="btn btn-ghost btn-danger" disabled={busy} onClick={() => run(() => revokeInvite(householdId, inv.code))}>
                  Återkalla
                </button>
              </span>
            </div>
          ))}
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const code = await createInvite(householdId, household?.name ?? '', user);
                setFresh(code);
              })
            }
          >
            + Skapa inbjudningskod
          </button>
        </div>
      )}

      {!isOwner && (
        <div className="details-actions">
          <button
            className="btn btn-ghost btn-danger"
            disabled={busy}
            onClick={() =>
              confirm('Lämna hushållet? Du kommer inte längre åt budgetarna.') && run(() => leaveHousehold(householdId, user.uid))
            }
          >
            Lämna hushållet
          </button>
        </div>
      )}
    </section>
  );
}

function AccountCard() {
  const { user, profile } = useCloud()!;
  const toast = useToast();
  return (
    <section className="card">
      <h2>Konto</h2>
      <p className="muted">
        Inloggad som {profile?.displayName ?? user.displayName} ({user.email})
      </p>
      <div className="details-actions">
        <button
          className="btn"
          onClick={() =>
            resetPassword(user.email ?? '')
              .then(() => toast('Vi har skickat en länk för att byta lösenord'))
              .catch((err) => toast(errorText(err)))
          }
        >
          Byt lösenord
        </button>
        <button className="btn btn-ghost" onClick={() => logOut()}>
          Logga ut
        </button>
      </div>
    </section>
  );
}
