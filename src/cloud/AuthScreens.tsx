import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { LocalStorageAdapter } from '../store/storage';
import type { AppData } from '../types';
import { ThemeToggle } from '../components/ThemeToggle';
import {
  createHousehold,
  displayNameOf,
  errorText,
  joinHousehold,
  logOut,
  lookupInvite,
  normalizeCode,
  resetPassword,
  signIn,
  signUp,
  type Profile,
} from './household';

const INVITE_KEY = 'budgetapp:invite';

/** Plockar upp ?invite=KOD från en inbjudningslänk och kommer ihåg den tills man gått med. */
export function pendingInvite(): string {
  const fromUrl = new URLSearchParams(location.search).get('invite');
  if (fromUrl) {
    try {
      sessionStorage.setItem(INVITE_KEY, normalizeCode(fromUrl));
    } catch {
      /* ignorera */
    }
    history.replaceState(null, '', location.pathname + location.hash);
  }
  try {
    return sessionStorage.getItem(INVITE_KEY) ?? '';
  } catch {
    return '';
  }
}

function clearPendingInvite() {
  try {
    sessionStorage.removeItem(INVITE_KEY);
  } catch {
    /* ignorera */
  }
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      <header className="topbar">
        <h1 className="brand">Budget</h1>
        <ThemeToggle />
      </header>
      <main className="main auth-main">{children}</main>
    </div>
  );
}

type Mode = 'login' | 'signup' | 'reset';

export function AuthScreen() {
  const [invite] = useState(pendingInvite);
  const [mode, setMode] = useState<Mode>(invite ? 'signup' : 'login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === 'login') await signIn(email, password);
      else if (mode === 'signup') {
        if (!name.trim()) throw new Error('Skriv ditt namn.');
        await signUp(name, email, password);
      } else {
        await resetPassword(email);
        setInfo('Om det finns ett konto med adressen har vi skickat en länk för att välja nytt lösenord.');
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Frame>
      <section className="card auth-card">
        {invite && (
          <div className="notice">
            Du har fått en inbjudan till ett hushåll. {mode === 'signup' ? 'Skapa ett konto' : 'Logga in'} så går du med
            direkt efteråt.
          </div>
        )}
        {mode !== 'reset' && (
          <div className="segmented auth-tabs" role="tablist">
            <button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'is-active' : ''} onClick={() => setMode('login')}>
              Logga in
            </button>
            <button role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'is-active' : ''} onClick={() => setMode('signup')}>
              Skapa konto
            </button>
          </div>
        )}
        {mode === 'reset' && <h2>Glömt lösenordet</h2>}

        <form className="auth-form" onSubmit={submit}>
          {mode === 'signup' && (
            <label>
              Namn
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="T.ex. Pella" required />
            </label>
          )}
          <label>
            E-post
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </label>
          {mode !== 'reset' && (
            <label>
              Lösenord
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                minLength={6}
                required
              />
              {mode === 'signup' && <span className="form-note">Minst 6 tecken.</span>}
            </label>
          )}
          {error && <p className="form-error">{error}</p>}
          {info && <p className="form-hint">{info}</p>}
          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            {busy ? 'Vänta…' : mode === 'login' ? 'Logga in' : mode === 'signup' ? 'Skapa konto' : 'Skicka länk'}
          </button>
        </form>

        {mode === 'login' && (
          <button className="link auth-link" onClick={() => setMode('reset')}>
            Glömt lösenordet?
          </button>
        )}
        {mode === 'reset' && (
          <button className="link auth-link" onClick={() => setMode('login')}>
            Tillbaka till inloggning
          </button>
        )}
      </section>
    </Frame>
  );
}

export function HouseholdSetup({
  user,
  profile,
  removed,
  onJoined,
}: {
  user: User;
  profile: Profile | null;
  removed: boolean;
  onJoined(): void;
}) {
  const name = displayNameOf(user, profile);
  const [householdName, setHouseholdName] = useState(`${name}s hushåll`);
  const [code, setCode] = useState(pendingInvite);
  const [local, setLocal] = useState<AppData | null>(null);
  const [bringLocal, setBringLocal] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);

  useEffect(() => {
    new LocalStorageAdapter().load().then((d) => setLocal(d && Object.keys(d.months).length ? d : null));
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy('create');
    try {
      await createHousehold(user, householdName || `${name}s hushåll`, bringLocal ? local : null);
      clearPendingInvite();
      onJoined();
    } catch (err) {
      setError(errorText(err));
      setBusy(null);
    }
  }

  async function join(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy('join');
    try {
      const invite = await lookupInvite(code);
      await joinHousehold(user, invite);
      clearPendingInvite();
      onJoined();
    } catch (err) {
      setError(errorText(err));
      setBusy(null);
    }
  }

  const monthCount = local ? Object.keys(local.months).length : 0;

  return (
    <Frame>
      <section className="card">
        <h2>Hej {name}!</h2>
        <p className="muted">
          {removed
            ? 'Du är inte längre medlem i ditt tidigare hushåll. Skapa ett nytt eller gå med i ett annat.'
            : 'Budgetar sparas per hushåll. Skapa ett eget eller gå med i ett som någon bjudit in dig till.'}
        </p>
        {error && <p className="form-error">{error}</p>}
      </section>

      <section className="card">
        <h2>Gå med i ett hushåll</h2>
        <p className="muted">Be den som äger hushållet om en inbjudningskod eller länk.</p>
        <form className="add-line" onSubmit={join}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Inbjudningskod"
            aria-label="Inbjudningskod"
            autoCapitalize="characters"
            className="code-input"
          />
          <button className="btn btn-primary" type="submit" disabled={!code.trim() || busy !== null}>
            {busy === 'join' ? 'Går med…' : 'Gå med'}
          </button>
        </form>
      </section>

      <section className="card">
        <h2>Skapa ett nytt hushåll</h2>
        <p className="muted">Du blir hushållets ägare och kan bjuda in de andra.</p>
        <form className="auth-form" onSubmit={create}>
          <label>
            Namn på hushållet
            <input value={householdName} onChange={(e) => setHouseholdName(e.target.value)} />
          </label>
          {local && (
            <label className="checkbox">
              <input type="checkbox" checked={bringLocal} onChange={(e) => setBringLocal(e.target.checked)} />
              Ta med budgetarna som finns på den här enheten ({monthCount} månader, {local.transactions.length} köp)
            </label>
          )}
          <button className="btn btn-primary btn-block" type="submit" disabled={busy !== null}>
            {busy === 'create' ? 'Skapar…' : 'Skapa hushåll'}
          </button>
        </form>
      </section>

      <div className="danger-zone">
        <span className="muted">Inloggad som {user.email}</span>
        <button className="btn btn-ghost" onClick={() => logOut()}>
          Logga ut
        </button>
      </div>
    </Frame>
  );
}
