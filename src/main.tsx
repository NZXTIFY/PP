import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { StoreProvider } from './store/store';
import { LocalStorageAdapter } from './store/storage';
import { ToastProvider } from './components/Toast';
import { firebaseConfig } from './cloud/config';
import './lib/theme';
import './styles.css';

// Ingen nypzoom på telefonen – Safari bryr sig inte om user-scalable=no i index.html, men stoppar
// zoomen om gesten avbryts. Sidan ska se ut som en app, med menyerna kvar på plats.
for (const type of ['gesturestart', 'gesturechange']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}

// Med Firebase-konfiguration: inloggning och hushåll i molnet. Utan: allt lokalt i webbläsaren.
const CloudRoot = lazy(() => import('./cloud/CloudRoot'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      {firebaseConfig ? (
        <Suspense fallback={<div className="loading">Laddar…</div>}>
          <CloudRoot />
        </Suspense>
      ) : (
        <StoreProvider adapter={new LocalStorageAdapter()}>
          <App />
        </StoreProvider>
      )}
    </ToastProvider>
  </StrictMode>,
);
