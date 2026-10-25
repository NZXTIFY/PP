import type { FirebaseOptions } from 'firebase/app';

/**
 * Firebase-konfigurationen för webbappen (Project settings → Your apps → SDK setup).
 * Värdena är inte hemliga – det är säkerhetsreglerna i firestore.rules som skyddar datan.
 * Så länge den är null körs appen i lokalt läge utan inloggning.
 */
export const firebaseConfig: FirebaseOptions | null = {
  apiKey: 'AIzaSyA4lHl7qgfKpiuN-l61f4B4al--vNFREnA',
  authDomain: 'budget-55bee.firebaseapp.com',
  projectId: 'budget-55bee',
  storageBucket: 'budget-55bee.firebasestorage.app',
  messagingSenderId: '72217933977',
  appId: '1:72217933977:web:abffb88f28486809332008',
};
