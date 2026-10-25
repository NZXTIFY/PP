import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { StoreProvider } from './store/store';
import { LocalStorageAdapter } from './store/storage';
import { ToastProvider } from './components/Toast';
import './styles.css';

// Byt till en FirestoreAdapter här när molnsynk läggs till.
const adapter = new LocalStorageAdapter();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider adapter={adapter}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </StoreProvider>
  </StrictMode>,
);
