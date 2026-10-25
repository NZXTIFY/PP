import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { firebaseConfig } from './config';

if (!firebaseConfig) throw new Error('Firebase är inte konfigurerat');

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Offline-cache: appen fungerar utan nät och synkar när uppkopplingen kommer tillbaka.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  ignoreUndefinedProperties: true,
});
