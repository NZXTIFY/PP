import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import type { AppData, Person } from '../types';
import { newId } from '../lib/id';
import { auth, db } from './firebase';

export type Role = 'owner' | 'member';

export interface Profile {
  displayName: string;
  email: string;
  householdId: string | null;
}

export interface HouseholdMeta {
  name: string;
  ownerId: string;
}

export interface Member {
  uid: string;
  displayName: string;
  email: string;
  role: Role;
}

export interface Invite {
  code: string;
  householdId: string;
  householdName: string;
  expiresAt: Timestamp;
}

const INVITE_DAYS = 7;
// Utan tecken som lätt förväxlas (0/O, 1/I/L)
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function displayNameOf(user: User, profile?: Profile | null): string {
  return profile?.displayName || user.displayName || user.email?.split('@')[0] || 'Jag';
}

// ---------- Konto ----------

export async function signUp(name: string, email: string, password: string): Promise<void> {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await updateProfile(cred.user, { displayName: name.trim() });
  await setDoc(doc(db, 'users', cred.user.uid), {
    displayName: name.trim(),
    email: email.trim(),
    householdId: null,
  });
}

export async function signIn(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

export async function logOut(): Promise<void> {
  await signOut(auth);
}

// ---------- Hushåll ----------

/** Skapar ett hushåll med användaren som ägare. Lokal data kan följa med upp. */
export async function createHousehold(user: User, name: string, local: AppData | null): Promise<string> {
  const ref = doc(collection(db, 'households'));
  const displayName = displayNameOf(user);
  const persons: Person[] = local?.persons.length ? local.persons : [{ id: newId(), name: displayName }];

  const batch = writeBatch(db);
  batch.set(ref, {
    name: name.trim(),
    ownerId: user.uid,
    persons,
    settings: local?.settings ?? { periodStartDay: 25 },
    merchants: local?.merchants ?? {},
    createdAt: serverTimestamp(),
  });
  batch.set(doc(ref, 'members', user.uid), {
    displayName,
    email: user.email ?? '',
    role: 'owner',
    joinedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'users', user.uid), { displayName, email: user.email ?? '', householdId: ref.id }, { merge: true });
  await batch.commit();

  if (local) {
    const writes: [string, string, object][] = [
      ...Object.entries(local.months).map(([id, m]): [string, string, object] => ['months', id, m]),
      ...local.transactions.map((t): [string, string, object] => ['transactions', t.id, t]),
    ];
    for (let i = 0; i < writes.length; i += 450) {
      const b = writeBatch(db);
      for (const [coll, id, value] of writes.slice(i, i + 450)) b.set(doc(ref, coll, id), value);
      await b.commit();
    }
  }
  return ref.id;
}

export async function renameHousehold(householdId: string, name: string): Promise<void> {
  await updateDoc(doc(db, 'households', householdId), { name: name.trim() });
}

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Ägaren skapar en inbjudningskod som gäller i en vecka. */
export async function createInvite(householdId: string, householdName: string, user: User): Promise<string> {
  const code = randomCode();
  const data = {
    householdId,
    householdName,
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + INVITE_DAYS * 86400000),
  };
  const batch = writeBatch(db);
  // invites/{code} slås upp av den som går med; kopian under hushållet låter ägaren lista sina koder
  batch.set(doc(db, 'invites', code), data);
  batch.set(doc(db, 'households', householdId, 'invites', code), data);
  await batch.commit();
  return code;
}

export async function revokeInvite(householdId: string, code: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'invites', code));
  batch.delete(doc(db, 'households', householdId, 'invites', code));
  await batch.commit();
}

export async function lookupInvite(rawCode: string): Promise<Invite> {
  const code = normalizeCode(rawCode);
  if (!code) throw new Error('Skriv in en inbjudningskod.');
  const snap = await getDoc(doc(db, 'invites', code));
  if (!snap.exists()) throw new Error('Koden finns inte. Kontrollera stavningen eller be om en ny.');
  const invite = { code, ...(snap.data() as Omit<Invite, 'code'>) };
  if (invite.expiresAt.toMillis() < Date.now()) throw new Error('Koden har gått ut. Be ägaren om en ny.');
  return invite;
}

/** Går med i ett hushåll med en inbjudningskod. */
export async function joinHousehold(user: User, invite: Invite): Promise<void> {
  const displayName = displayNameOf(user);
  const ref = doc(db, 'households', invite.householdId);
  const batch = writeBatch(db);
  batch.set(doc(ref, 'members', user.uid), {
    displayName,
    email: user.email ?? '',
    role: 'member',
    inviteCode: invite.code,
    joinedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'users', user.uid), { displayName, email: user.email ?? '', householdId: invite.householdId }, { merge: true });
  await batch.commit();

  // Ge den nya medlemmen en egen budget om det inte redan finns en person med samma namn
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const persons = (snap.data()?.persons ?? []) as Person[];
    if (persons.some((p) => p.name.trim().toLowerCase() === displayName.trim().toLowerCase())) return;
    tx.update(ref, { persons: [...persons, { id: newId(), name: displayName }] });
  });
}

/** Ägaren tar bort en medlem. */
export async function removeMember(householdId: string, uid: string): Promise<void> {
  await deleteDoc(doc(db, 'households', householdId, 'members', uid));
}

/** En medlem lämnar hushållet själv. */
export async function leaveHousehold(householdId: string, uid: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'households', householdId, 'members', uid));
  batch.set(doc(db, 'users', uid), { householdId: null }, { merge: true });
  await batch.commit();
}

/** Svenska felmeddelanden för de vanligaste Firebase-felen. */
export function errorText(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  const map: Record<string, string> = {
    'auth/invalid-credential': 'Fel e-post eller lösenord.',
    'auth/wrong-password': 'Fel e-post eller lösenord.',
    'auth/user-not-found': 'Det finns inget konto med den e-postadressen.',
    'auth/email-already-in-use': 'Det finns redan ett konto med den e-postadressen. Logga in i stället.',
    'auth/weak-password': 'Lösenordet måste vara minst 6 tecken.',
    'auth/invalid-email': 'Ogiltig e-postadress.',
    'auth/missing-password': 'Skriv in ett lösenord.',
    'auth/too-many-requests': 'För många försök. Vänta en stund och försök igen.',
    'auth/network-request-failed': 'Ingen anslutning. Kontrollera nätet och försök igen.',
    'auth/configuration-not-found':
      'Inloggning är inte aktiverad i Firebase-projektet. Slå på E-post/lösenord under Authentication → Sign-in method.',
    'auth/operation-not-allowed':
      'Inloggning med e-post och lösenord är inte aktiverad. Slå på den under Authentication → Sign-in method.',
    'auth/unauthorized-domain': 'Den här webbadressen är inte godkänd i Firebase (Authentication → Settings → Authorized domains).',
    'permission-denied': 'Du saknar behörighet för det här.',
    unavailable: 'Ingen anslutning till servern just nu.',
  };
  if (map[code]) return map[code];
  return err instanceof Error ? err.message : String(err);
}
