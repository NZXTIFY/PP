import { lazy, Suspense, useEffect, useState } from 'react';
import { useCloud, useInbox } from './cloud/context';
import { useStore } from './store/store';
import { UiProvider, useUi, type Tab } from './store/ui';
import { MonthNav, ScopeSwitcher } from './components/ScopeBar';
import { QuickAdd } from './components/QuickAdd';
import { ThemeToggle } from './components/ThemeToggle';
import { BudgetView } from './views/BudgetView';
import { TransactionsView } from './views/TransactionsView';
import { ExcelImportCard, PersonsCard, SettingsView } from './views/SettingsView';

// Graferna (Recharts) laddas först när man öppnar Analys
const AnalysisView = lazy(() => import('./views/AnalysisView').then((m) => ({ default: m.AnalysisView })));

const ICONS: Record<Tab, string> = {
  budget: 'M4 5h16M4 12h16M4 19h10',
  kop: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  analys: 'M5 20V12M12 20V5M19 20v-9',
  installningar: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4',
};

const TABS: { id: Tab; label: string }[] = [
  { id: 'budget', label: 'Budget' },
  { id: 'kop', label: 'Köp' },
  { id: 'analys', label: 'Analys' },
  { id: 'installningar', label: 'Inställningar' },
];

export function App() {
  const { data, loaded } = useStore();
  if (!loaded) return <div className="loading">Laddar…</div>;

  return <UiProvider>{data.persons.length === 0 ? <Onboarding /> : <Shell />}</UiProvider>;
}

function Onboarding() {
  return (
    <div className="app">
      <header className="topbar">
        <h1 className="brand">Budget</h1>
        <ThemeToggle />
      </header>
      <main className="main">
        <PersonsCard intro />
        <ExcelImportCard />
      </main>
    </div>
  );
}

function TabButtons({ withIcons }: { withIcons?: boolean }) {
  const { tab, setTab } = useUi();
  // Antal Apple Pay-köp som väntar på en kategori
  const waiting = useInbox()?.entries.length ?? 0;
  return TABS.map((t) => (
    <button key={t.id} className={tab === t.id ? 'is-active' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
      {withIcons && (
        <svg className="tab-icon" viewBox="0 0 24 24" aria-hidden>
          <path d={ICONS[t.id]} />
        </svg>
      )}
      {t.label}
      {t.id === 'kop' && waiting > 0 && (
        <span className="tab-count" aria-label={`${waiting} att kategorisera`}>
          {waiting}
        </span>
      )}
    </button>
  ));
}

function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

function Shell() {
  const { saveError } = useStore();
  const { tab, openQuickAdd } = useUi();
  const cloud = useCloud();
  const online = useOnline();

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="brand">Budget</h1>
        <nav className="tabs tabs-top" aria-label="Sidor">
          <TabButtons />
        </nav>
        <ThemeToggle />
      </header>

      <main className="main">
        {saveError && <div className="notice notice-bad">Kunde inte spara: {saveError}</div>}
        {cloud && !online && (
          <div className="notice">Du är offline. Ändringar sparas på enheten och synkas när du är online igen.</div>
        )}
        {tab !== 'installningar' && (
          <div className="controls">
            <ScopeSwitcher />
            {tab !== 'analys' && <MonthNav />}
          </div>
        )}
        {tab === 'budget' && <BudgetView />}
        {tab === 'kop' && <TransactionsView />}
        {tab === 'analys' && (
          <Suspense fallback={<div className="loading">Laddar grafer…</div>}>
            <AnalysisView />
          </Suspense>
        )}
        {tab === 'installningar' && <SettingsView />}
      </main>

      {tab !== 'installningar' && (
        <button className="fab" aria-label="Logga köp" title="Logga köp" onClick={() => openQuickAdd()}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      )}

      <nav className="tabs tabs-bottom" aria-label="Sidor">
        <TabButtons withIcons />
      </nav>

      <QuickAdd />
    </div>
  );
}
